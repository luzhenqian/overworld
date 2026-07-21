/**
 * Asset manifest convention: declare a scene's (or the whole game's) assets
 * as plain data, compose per-scene manifests with `mergeManifests`, and kick
 * off browser preloads with `preloadManifest`.
 *
 * `preloadManifest` intentionally does NOT touch the loading store. The
 * underlying preload APIs (`useGLTF.preload`, `Image`, `Audio`) report no
 * granular progress, so registering store tasks here would only fake numbers.
 * Real model-loading progress flows through three.js' loading manager and is
 * bridged into the store by `useSceneLoadProgress` once the scene mounts —
 * that hook is the progress seam; this module is only the "start early" seam.
 */
import { useGLTF } from '@react-three/drei'

/** Declarative list of asset URLs, grouped by category. */
export interface AssetManifest {
  /** GLTF/GLB model URLs, preloaded via drei's `useGLTF.preload`. */
  models?: string[]
  /** Audio file URLs, warmed via `new Audio()` with `preload = 'auto'`. */
  audio?: string[]
  /** Image URLs, warmed via `new Image()`. */
  images?: string[]
  /**
   * Font URLs — listed for inventory/documentation only; `preloadManifest`
   * skips them. drei's `<Text>` loads its own fonts (troika), and CSS fonts
   * belong in `@font-face` / `<link rel="preload">` in the host page.
   */
  fonts?: string[]
}

export const ASSET_CATEGORIES = ['models', 'audio', 'images', 'fonts'] as const

/** One of the manifest's category keys. */
export type AssetCategory = (typeof ASSET_CATEGORIES)[number]

/**
 * Identity helper that anchors the manifest convention: gives content files
 * type inference/checking without any runtime cost.
 *
 * ```ts
 * export const VILLAGE_ASSETS = defineAssetManifest({
 *   models: ['/models/guide.glb'],
 *   audio: ['/audio/bgm/village.mp3'],
 * })
 * ```
 */
export function defineAssetManifest(manifest: AssetManifest): AssetManifest {
  return manifest
}

/**
 * Merge any number of manifests into one, deduplicating URLs per category
 * while preserving first-seen order. Categories absent from every input stay
 * `undefined` in the result.
 */
export function mergeManifests(...manifests: AssetManifest[]): AssetManifest {
  const merged: AssetManifest = {}
  for (const category of ASSET_CATEGORIES) {
    const seen = new Set<string>()
    const urls: string[] = []
    let present = false
    for (const manifest of manifests) {
      const list = manifest[category]
      if (!list) continue
      present = true
      for (const url of list) {
        if (seen.has(url)) continue
        seen.add(url)
        urls.push(url)
      }
    }
    if (present) merged[category] = urls
  }
  return merged
}

export interface PreloadManifestOptions {
  /**
   * Preload only these categories. Defaults to all preloadable categories
   * (`fonts` is always skipped — see {@link AssetManifest.fonts}).
   */
  categories?: AssetCategory[]
  /** Progress 0..1 as trackable (image/audio) assets settle. Models count as kicked-off. */
  onProgress?: (fraction: number) => void
}

/** URLs already handed to a preloader this session (across all calls). */
const preloadedUrls = new Set<string>()

/**
 * Kick off fire-and-forget browser preloads for a manifest:
 *
 * - `models` → drei `useGLTF.preload` (fills the same GLTF cache the scene
 *   components read from)
 * - `images` → `new Image().src`
 * - `audio`  → `new Audio()` with `preload = 'auto'`
 * - `fonts`  → skipped (drei `<Text>` loads its own fonts)
 *
 * Each URL is only ever preloaded once per session, so calling this from
 * several places (or re-rendering) is cheap. In Node/SSR (no `window`) the
 * function is a no-op and resolves immediately.
 *
 * Returns a promise that settles once every *trackable* asset has settled,
 * and drives `options.onProgress` (0..1) as they do. This does NOT register
 * loading-store tasks — use `useSceneLoadProgress` inside the Canvas for real
 * model progress.
 *
 * If any image/audio fails to load, `onProgress` still reaches 1 (every
 * asset still counts as settled) but the returned promise *rejects* with the
 * first error once all jobs have settled, so callers can surface it (e.g.
 * `sceneLoad.tsx`'s `failZone`). The failed URL is evicted from the
 * dedup cache so a subsequent call (e.g. `retry()`) re-attempts it;
 * successfully-loaded URLs stay deduped.
 *
 * Honest limitation: `useGLTF.preload` exposes no completion event, so
 * models cannot be tracked to real completion. They count toward the total
 * asset count but are treated as settled the instant they're kicked off
 * (fire-and-forget); only `images` and `audio` settle on their real
 * load/error events. A manifest of only models therefore resolves and
 * reports `onProgress(1)` immediately even though the browser is still
 * fetching them in the background.
 */
export async function preloadManifest(
  manifest: AssetManifest,
  options?: PreloadManifestOptions
): Promise<void> {
  if (typeof window === 'undefined') return

  const wants = (category: AssetCategory): boolean =>
    options?.categories === undefined || options.categories.includes(category)
  const fresh = (url: string): boolean => {
    if (preloadedUrls.has(url)) return false
    preloadedUrls.add(url)
    return true
  }

  const models = wants('models') ? (manifest.models ?? []).filter(fresh) : []
  const images = wants('images') ? (manifest.images ?? []).filter(fresh) : []
  const audio = wants('audio') ? (manifest.audio ?? []).filter(fresh) : []
  // fonts: intentionally skipped.
  const total = models.length + images.length + audio.length
  if (total === 0) {
    options?.onProgress?.(1)
    return
  }

  let settled = 0
  const bump = () => options?.onProgress?.(settled / total)
  let firstError: unknown = null
  const track = (url: string, p: Promise<unknown>) =>
    p.then(
      () => {
        settled++
        bump()
      },
      (e) => {
        settled++
        bump()
        // Evict so a later retry() re-issues the request for this URL.
        preloadedUrls.delete(url)
        if (firstError == null) firstError = e
      }
    )

  const jobs: Promise<unknown>[] = []
  for (const url of models) {
    useGLTF.preload(url)
    settled++ // models: no completion event; count as kicked-off
  }
  bump()
  for (const url of images) {
    jobs.push(
      track(
        url,
        new Promise<void>((res, rej) => {
          const img = new Image()
          img.onload = () => res()
          img.onerror = () => rej(new Error(`Failed to preload image: ${url}`))
          img.src = url
        })
      )
    )
  }
  for (const url of audio) {
    jobs.push(
      track(
        url,
        new Promise<void>((res, rej) => {
          const a = new Audio()
          a.preload = 'auto'
          a.oncanplaythrough = () => res()
          a.onerror = () => rej(new Error(`Failed to preload audio: ${url}`))
          a.src = url
        })
      )
    )
  }
  await Promise.all(jobs)
  options?.onProgress?.(1)
  if (firstError != null) throw firstError
}
