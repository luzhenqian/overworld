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
 * function is a no-op.
 *
 * This does NOT register loading-store tasks and reports no progress — use
 * `useSceneLoadProgress` inside the Canvas for real model progress.
 */
export function preloadManifest(
  manifest: AssetManifest,
  options?: PreloadManifestOptions
): void {
  if (typeof window === 'undefined') return

  const wants = (category: AssetCategory): boolean =>
    options?.categories === undefined || options.categories.includes(category)
  const fresh = (url: string): boolean => {
    if (preloadedUrls.has(url)) return false
    preloadedUrls.add(url)
    return true
  }

  if (wants('models')) {
    for (const url of manifest.models ?? []) {
      if (fresh(url)) useGLTF.preload(url)
    }
  }
  if (wants('images')) {
    for (const url of manifest.images ?? []) {
      if (fresh(url)) new Image().src = url
    }
  }
  if (wants('audio')) {
    for (const url of manifest.audio ?? []) {
      if (!fresh(url)) continue
      const audio = new Audio()
      audio.preload = 'auto'
      audio.src = url
    }
  }
  // fonts: intentionally skipped.
}
