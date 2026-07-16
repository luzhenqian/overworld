/**
 * Runtime platform detection.
 *
 * Probes host globals in **descending specificity** so that a more specific
 * shell always wins over the environment it embeds (e.g. a Capacitor WebView
 * that also loads the Telegram script is still `'capacitor'`):
 *
 * 1. `wx` with a functional `getSystemInfoSync` → `'weapp'`
 * 2. `window.__TAURI_INTERNALS__` → `'tauri'`
 * 3. `window.Capacitor` (native, see below) → `'capacitor'`
 * 4. `window.Telegram.WebApp.initData` (non-empty) → `'telegram'`
 * 5. `window` present → `'web'`
 * 6. otherwise → `'node'`
 *
 * Every probe is defensive (`typeof` checks only, no throwing property
 * access), so detection is safe to call in any environment, including SSR
 * and tests.
 */

/** Every platform the framework can detect. */
export type PlatformKind = 'web' | 'telegram' | 'tauri' | 'capacitor' | 'weapp' | 'node'

/** Options for {@link configurePlatform}. */
export interface PlatformConfig {
  /**
   * Force {@link detectPlatform} to return this kind, bypassing all host
   * probes. Intended for tests and debugging (e.g. previewing the Telegram
   * layout in a plain browser). `undefined` clears a previous override.
   */
  force?: PlatformKind
}

let forced: PlatformKind | undefined

/**
 * Override the detected platform (tests / debugging). Pass `{ force: kind }`
 * to pin {@link detectPlatform}'s result; pass `{}` (or call
 * {@link resetPlatform}) to return to real detection.
 */
export function configurePlatform(config: PlatformConfig): void {
  forced = config.force
}

/** Clear any {@link configurePlatform} override and return to real detection. */
export function resetPlatform(): void {
  forced = undefined
}

function readGlobal(name: string): unknown {
  return (globalThis as Record<string, unknown>)[name]
}

/**
 * `window.Capacitor` also exists in Capacitor's *web* builds; when the
 * runtime exposes `isNativePlatform` we only claim `'capacitor'` for actual
 * native shells. Older runtimes without the method count as capacitor.
 */
function isCapacitorNative(capacitor: { isNativePlatform?: unknown }): boolean {
  if (typeof capacitor.isNativePlatform !== 'function') return true
  try {
    return capacitor.isNativePlatform() === true
  } catch {
    return true
  }
}

/**
 * Detect the current platform (see the module doc for the probe order).
 * Cheap and side-effect free — call it as often as you like. Respects a
 * {@link configurePlatform} override.
 */
export function detectPlatform(): PlatformKind {
  if (forced !== undefined) return forced

  // 1. WeChat mini-game / mini-program: the `wx` global with its sync API.
  const wx = readGlobal('wx') as { getSystemInfoSync?: unknown } | undefined
  if (wx !== undefined && wx !== null && typeof wx.getSystemInfoSync === 'function') {
    return 'weapp'
  }

  if (typeof window === 'undefined') return 'node'
  const win = window as unknown as Record<string, unknown>

  // 2. Tauri 2 injects `__TAURI_INTERNALS__` into every WebView.
  if (win['__TAURI_INTERNALS__'] !== undefined && win['__TAURI_INTERNALS__'] !== null) {
    return 'tauri'
  }

  // 3. Capacitor native shell.
  const capacitor = win['Capacitor'] as { isNativePlatform?: unknown } | undefined
  if (capacitor !== undefined && capacitor !== null && isCapacitorNative(capacitor)) {
    return 'capacitor'
  }

  // 4. Telegram Mini App: the WebApp object carries non-empty initData only
  //    when actually launched from Telegram.
  const telegram = win['Telegram'] as { WebApp?: { initData?: unknown } } | undefined
  const initData = telegram?.WebApp?.initData
  if (typeof initData === 'string' && initData.length > 0) return 'telegram'

  // 5./6. Plain browser, else Node.
  return 'web'
}
