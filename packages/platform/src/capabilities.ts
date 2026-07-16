/**
 * Platform capability snapshot + platform-corrected quality recommendation.
 *
 * All probes are defensive; every function is safe to call in any
 * environment (browser, WebView shell, WeChat, Node/SSR, tests).
 */
import { detectPlatform, type PlatformKind } from './detection'

/** What the current platform can do, as one flat snapshot. */
export interface PlatformCapabilities {
  /** The detected (or forced) platform. */
  kind: PlatformKind
  /** A real DOM is available (`false` for weapp — its adapter is a polyfill, not a DOM). */
  hasDOM: boolean
  /** WebGL rendering is available (weapp canvases are WebGL-capable). */
  hasWebGL: boolean
  /** Touch input is available. */
  hasTouch: boolean
  /** A physical keyboard is the expected primary input. */
  hasKeyboard: boolean
  /** Which persistent storage backend the platform bridge will use by default. */
  persistentStorage: 'localStorage' | 'file' | 'wx' | 'memory'
}

function matchesCoarsePointer(): boolean {
  try {
    return (
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(pointer: coarse)').matches
    )
  } catch {
    return false
  }
}

function hasMobileUserAgent(): boolean {
  if (typeof navigator === 'undefined') return false
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent ?? '')
}

/** Coarse pointer or a mobile user agent — the "phone-shaped device" signal. */
function isMobileLike(): boolean {
  return matchesCoarsePointer() || hasMobileUserAgent()
}

function probeTouch(): boolean {
  if (typeof window === 'undefined') return false
  try {
    if ('ontouchstart' in window) return true
  } catch {
    // fall through
  }
  if (typeof navigator !== 'undefined' && typeof navigator.maxTouchPoints === 'number') {
    if (navigator.maxTouchPoints > 0) return true
  }
  return matchesCoarsePointer()
}

function localStorageAvailable(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage !== null
  } catch {
    // Accessing `localStorage` can throw (sandboxed iframes, privacy modes).
    return false
  }
}

/**
 * Snapshot the current platform's capabilities. Computed fresh on every
 * call (probes are cheap); memoize per component with the `usePlatform()`
 * hook if you read it during render.
 */
export function getCapabilities(): PlatformCapabilities {
  const kind = detectPlatform()

  if (kind === 'weapp') {
    return {
      kind,
      hasDOM: false,
      hasWebGL: true,
      hasTouch: true,
      hasKeyboard: false,
      persistentStorage: 'wx',
    }
  }

  if (kind === 'node') {
    return {
      kind,
      hasDOM: false,
      hasWebGL: false,
      hasTouch: false,
      hasKeyboard: false,
      persistentStorage: 'memory',
    }
  }

  const hasDOM = typeof document !== 'undefined' && document !== null
  const hasWebGL = typeof WebGLRenderingContext !== 'undefined'
  const hasTouch = kind === 'capacitor' ? true : probeTouch()
  // Desktop shells always have a keyboard; mobile shells never lead with
  // one; for web/telegram assume keyboard unless the device is phone-shaped.
  const hasKeyboard = kind === 'tauri' ? true : kind === 'capacitor' ? false : !isMobileLike()
  const persistentStorage: PlatformCapabilities['persistentStorage'] = localStorageAvailable()
    ? 'localStorage'
    : 'memory'

  return { kind, hasDOM, hasWebGL, hasTouch, hasKeyboard, persistentStorage }
}

/**
 * Default mount switch for `@overworld-engine/input`'s `<VirtualJoystick>`:
 * `true` when touch is available and no physical keyboard is expected.
 *
 * ```tsx
 * {shouldShowTouchControls() && <VirtualJoystick target={inputRef} />}
 * ```
 */
export function shouldShowTouchControls(): boolean {
  const caps = getCapabilities()
  return caps.hasTouch && !caps.hasKeyboard
}

/** One of the three built-in quality tiers of `@overworld-engine/scene`. */
export type QualityPresetName = 'high' | 'medium' | 'low'

const PRESET_RANK: Record<QualityPresetName, number> = { low: 0, medium: 1, high: 2 }

function capPreset(preset: QualityPresetName, max: QualityPresetName): QualityPresetName {
  const presetRank = PRESET_RANK[preset]
  const maxRank = PRESET_RANK[max]
  return presetRank > maxRank ? max : preset
}

/**
 * Device heuristic (mirrors `@overworld-engine/scene`'s `detectQualityPreset`
 * without depending on the scene package):
 *
 * - non-browser (no `navigator`) → `'high'` (SSR/tests; harmless default),
 * - "weak" = `hardwareConcurrency` ≤ 4 or `deviceMemory` ≤ 4 GB (guarded),
 * - "mobile" = coarse pointer or mobile UA,
 * - mobile + weak → `'low'`; mobile → `'medium'`; desktop + weak →
 *   `'medium'`; otherwise `'high'`.
 */
function heuristicPreset(): QualityPresetName {
  if (typeof navigator === 'undefined') return 'high'

  const nav = navigator as Navigator & { deviceMemory?: number }
  const cores = typeof nav.hardwareConcurrency === 'number' ? nav.hardwareConcurrency : undefined
  const memory = typeof nav.deviceMemory === 'number' ? nav.deviceMemory : undefined
  const weak = (cores !== undefined && cores <= 4) || (memory !== undefined && memory <= 4)

  if (isMobileLike()) return weak ? 'low' : 'medium'
  return weak ? 'medium' : 'high'
}

/**
 * Platform-corrected quality recommendation: the device heuristic above,
 * then capped per platform — `telegram` / `capacitor` / `weapp` never exceed
 * `'medium'` (WebView & mini-app GPUs underperform their raw specs).
 *
 * Feed it straight to the scene quality store:
 *
 * ```ts
 * useQualityStore.getState().setPreset(recommendedQualityPreset())
 * ```
 */
export function recommendedQualityPreset(): QualityPresetName {
  const preset = heuristicPreset()
  const kind = detectPlatform()
  if (kind === 'telegram' || kind === 'capacitor' || kind === 'weapp') {
    return capPreset(preset, 'medium')
  }
  return preset
}
