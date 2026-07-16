/**
 * Rendering quality presets for mobile / low-end devices.
 *
 * A tiny zustand singleton holds the active {@link QualitySettings}; the
 * `<ApplyQuality />` component (mounted inside the Canvas) applies the
 * GL-facing parts (DPR, shadow map toggle). Everything else — particle
 * counts, shadow map sizes on lights — is game-owned: read the values from
 * the store and apply them where you create those objects.
 *
 * The store is intentionally NOT persisted: games decide whether and where
 * to save the player's choice (localStorage, save slot, ...).
 */
import { create } from 'zustand'

/** One rendering quality tier. All values are hints the game applies itself, except `dpr`/`shadows` which `<ApplyQuality />` applies to the GL context. */
export interface QualitySettings {
  /**
   * Device-pixel-ratio range `[min, max]` passed to R3F's `setDpr`: the
   * actual `window.devicePixelRatio` is clamped into this range.
   */
  dpr: [min: number, max: number]
  /** Whether the renderer's shadow map is enabled. */
  shadows: boolean
  /**
   * Suggested `shadow-mapSize` for shadow-casting lights. The framework
   * never touches the game's lights — read this value where you create
   * them (e.g. `<directionalLight shadow-mapSize={[size, size]} />`).
   */
  shadowMapSize: number
  /**
   * Multiplier games apply to their particle counts (1 = full count).
   * Convenience selector: {@link useParticleMultiplier}.
   */
  particleMultiplier: number
}

export type QualityPresetName = 'high' | 'medium' | 'low'

/** Built-in quality tiers. Treat the entries as read-only. */
export const QUALITY_PRESETS: Record<QualityPresetName, QualitySettings> = {
  high: { dpr: [1, 2], shadows: true, shadowMapSize: 2048, particleMultiplier: 1 },
  medium: { dpr: [1, 1.5], shadows: true, shadowMapSize: 1024, particleMultiplier: 0.6 },
  low: { dpr: [0.75, 1], shadows: false, shadowMapSize: 512, particleMultiplier: 0.3 },
}

/** State and actions of the quality store. */
export interface QualityState {
  /** Active preset name, or `'custom'` after a partial `setSettings`. */
  preset: QualityPresetName | 'custom'
  /** Effective settings (always fully resolved, never partial). */
  settings: QualitySettings
  /** Switch to a built-in preset (replaces `settings` wholesale). */
  setPreset: (name: QualityPresetName) => void
  /** Merge a partial override into the current settings; `preset` becomes `'custom'`. */
  setSettings: (partial: Partial<QualitySettings>) => void
}

/**
 * Singleton quality store. Defaults to `'high'`; call
 * `setPreset(detectQualityPreset())` at startup to adapt to the device.
 * Not persisted — persist the player's choice yourself if you want to.
 */
export const useQualityStore = create<QualityState>((set) => ({
  preset: 'high',
  settings: { ...QUALITY_PRESETS.high },

  setPreset: (name) => set({ preset: name, settings: { ...QUALITY_PRESETS[name] } }),

  setSettings: (partial) =>
    set((state) => ({ preset: 'custom', settings: { ...state.settings, ...partial } })),
}))

/** The current particle multiplier (re-renders when it changes). */
export const useParticleMultiplier = (): number =>
  useQualityStore((state) => state.settings.particleMultiplier)

/**
 * Best-effort device heuristic:
 *
 * - non-browser (no `navigator`) → `'high'` (SSR/tests; harmless default),
 * - "weak" = `navigator.hardwareConcurrency` ≤ 4 **or**
 *   `navigator.deviceMemory` ≤ 4 GB (both guarded — missing values are
 *   simply not counted against the device),
 * - "mobile" = coarse pointer (`matchMedia('(pointer: coarse)')`) **or**
 *   a mobile user-agent hint (Android/iPhone/iPad/iPod/Mobile),
 * - mobile + weak → `'low'`; mobile → `'medium'`; desktop + weak →
 *   `'medium'`; otherwise `'high'`.
 *
 * It is a starting point, not a benchmark — pass the result to
 * `useQualityStore.getState().setPreset(...)` and let players override it.
 */
export function detectQualityPreset(): QualityPresetName {
  if (typeof navigator === 'undefined') return 'high'

  const nav = navigator as Navigator & { deviceMemory?: number }
  const cores = typeof nav.hardwareConcurrency === 'number' ? nav.hardwareConcurrency : undefined
  const memory = typeof nav.deviceMemory === 'number' ? nav.deviceMemory : undefined
  const weak = (cores !== undefined && cores <= 4) || (memory !== undefined && memory <= 4)

  const coarsePointer =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(pointer: coarse)').matches
  const mobileUA = /Android|iPhone|iPad|iPod|Mobile/i.test(nav.userAgent ?? '')
  const mobile = coarsePointer || mobileUA

  if (mobile) return weak ? 'low' : 'medium'
  return weak ? 'medium' : 'high'
}
