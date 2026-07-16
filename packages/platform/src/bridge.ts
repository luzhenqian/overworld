/**
 * PlatformBridge: one object per platform that answers "where do saves go,
 * how do I open a link, what are the safe-area insets, and who tells the
 * event bus about pause/resume/back".
 *
 * Every built-in bridge is **zero-hard-dependency**: shell SDKs
 * (`window.Telegram.WebApp`, `window.Capacitor`, Tauri plugins) are probed
 * dynamically at call time and every probe degrades gracefully, so the same
 * bundle runs everywhere. The `weapp` bridge is not built in — it is
 * registered by `@overworld-engine/adapters-weapp` via {@link registerBridge}
 * (this package never depends on it).
 */
import {
  EventBus,
  createMemoryStorage,
  fromWebStorage,
  type EnumerableStorage,
  type OverworldEventMap,
} from '@overworld-engine/core'
// Type-only: pulls the `app:*` OverworldEventMap augmentation into scope.
import type {} from './events'
import { detectPlatform, type PlatformKind } from './detection'

/** Safe-area padding in CSS pixels (notches, home indicators, TG headers). */
export interface SafeAreaInsets {
  top: number
  right: number
  bottom: number
  left: number
}

/**
 * The per-platform capability bridge. Obtain one with {@link createBridge};
 * platforms without special needs are served by the web bridge.
 */
export interface PlatformBridge {
  /** Which platform this bridge serves. */
  kind: PlatformKind
  /**
   * Save-game storage. Satisfies core's `EnumerableStorage`, so it can be
   * fed directly to `persistOptions({ storage: () => bridge.storage() })`
   * and `createSaveSlots({ storage: bridge.storage() })`.
   */
  storage(): EnumerableStorage
  /** Open an external URL: Telegram uses `openLink`, shells use the system browser. */
  openExternal(url: string): void
  /** Current safe-area insets ({@link SafeAreaInsets}); all zeros when unknown. */
  safeAreaInsets(): SafeAreaInsets
  /** Haptic feedback, when the platform supports it. */
  vibrate?(pattern: 'light' | 'medium' | 'heavy'): void
  /**
   * Wire platform lifecycle events onto the bus as typed `app:paused` /
   * `app:resumed` / `app:back` events. Returns an unbind function.
   */
  bindLifecycle(bus: EventBus<OverworldEventMap>): () => void
  /** Quit the app — available on desktop shells. */
  quit?(): void
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

let sharedMemoryStorage: EnumerableStorage | undefined

/**
 * `localStorage` wrapped as `EnumerableStorage` when available, else a
 * process-wide in-memory fallback (shared, so persistOptions and saveSlots
 * see the same data).
 */
function defaultWebStorage(): EnumerableStorage {
  try {
    if (typeof localStorage !== 'undefined' && localStorage !== null) {
      return fromWebStorage(localStorage)
    }
  } catch {
    // Accessing localStorage can throw (sandboxed iframes, privacy modes).
  }
  sharedMemoryStorage ??= createMemoryStorage()
  return sharedMemoryStorage
}

function openWithWindow(url: string): void {
  if (typeof window !== 'undefined' && typeof window.open === 'function') {
    window.open(url, '_blank', 'noopener,noreferrer')
  }
}

const ZERO_INSETS: SafeAreaInsets = { top: 0, right: 0, bottom: 0, left: 0 }

/** `document.visibilitychange` → `app:paused` / `app:resumed`. */
function bindVisibility(bus: EventBus<OverworldEventMap>): () => void {
  if (typeof document === 'undefined' || typeof document.addEventListener !== 'function') {
    return () => {}
  }
  const doc = document
  const onChange = (): void => {
    bus.emit(doc.visibilityState === 'hidden' ? 'app:paused' : 'app:resumed', {})
  }
  doc.addEventListener('visibilitychange', onChange)
  return () => doc.removeEventListener('visibilitychange', onChange)
}

/**
 * Dynamic import with a *variable* specifier so bundlers neither resolve nor
 * pre-bundle optional shell plugins (`@tauri-apps/plugin-fs`, …) that only
 * exist inside shell templates.
 */
function dynamicImport(specifier: string): Promise<Record<string, unknown>> {
  return import(/* @vite-ignore */ /* webpackIgnore: true */ specifier) as Promise<
    Record<string, unknown>
  >
}

// ---------------------------------------------------------------------------
// Web bridge
// ---------------------------------------------------------------------------

/**
 * Plain-browser bridge: `localStorage` saves, `window.open` links,
 * `visibilitychange` → `app:paused` / `app:resumed`. Also the universal
 * fallback for kinds without a registered bridge.
 */
export function createWebBridge(): PlatformBridge {
  return {
    kind: 'web',
    storage: defaultWebStorage,
    openExternal: openWithWindow,
    safeAreaInsets: () => ({ ...ZERO_INSETS }),
    bindLifecycle: bindVisibility,
  }
}

// ---------------------------------------------------------------------------
// Telegram bridge
// ---------------------------------------------------------------------------

interface TelegramBackButton {
  show?: () => void
  hide?: () => void
  onClick?: (cb: () => void) => void
  offClick?: (cb: () => void) => void
}

interface TelegramWebApp {
  initData?: string
  isActive?: boolean
  ready?: () => void
  expand?: () => void
  openLink?: (url: string) => void
  themeParams?: Record<string, string>
  safeAreaInset?: { top?: number; right?: number; bottom?: number; left?: number }
  onEvent?: (event: string, cb: () => void) => void
  offEvent?: (event: string, cb: () => void) => void
  BackButton?: TelegramBackButton
  HapticFeedback?: { impactOccurred?: (style: string) => void }
}

function getTelegramWebApp(): TelegramWebApp | undefined {
  if (typeof window === 'undefined') return undefined
  const win = window as unknown as { Telegram?: { WebApp?: TelegramWebApp } }
  return win.Telegram?.WebApp
}

/** {@link PlatformBridge} plus Telegram's theme parameters. */
export interface TelegramBridge extends PlatformBridge {
  /** Telegram's `themeParams` (empty object outside Telegram) — map onto your HUD. */
  getTheme(): Record<string, string>
}

/**
 * Telegram Mini App bridge, reading `window.Telegram.WebApp` directly (no
 * `@twa-dev/sdk` dependency). Creating the bridge calls `ready()` +
 * `expand()`. `bindLifecycle` prefers the `activated` / `deactivated`
 * WebApp events (Bot API ≥ 8.0, detected via `isActive`), falling back to
 * `visibilitychange`; the `BackButton` is shown and emits `app:back`.
 */
export function createTelegramBridge(): TelegramBridge {
  const webApp = getTelegramWebApp()
  try {
    webApp?.ready?.()
    webApp?.expand?.()
  } catch {
    // Telegram script variants that throw here should not break bridge creation.
  }

  return {
    kind: 'telegram',
    storage: defaultWebStorage,

    openExternal(url) {
      const wa = getTelegramWebApp()
      if (typeof wa?.openLink === 'function') {
        wa.openLink(url)
        return
      }
      openWithWindow(url)
    },

    safeAreaInsets() {
      const inset = getTelegramWebApp()?.safeAreaInset
      return {
        top: inset?.top ?? 0,
        right: inset?.right ?? 0,
        bottom: inset?.bottom ?? 0,
        left: inset?.left ?? 0,
      }
    },

    vibrate(pattern) {
      getTelegramWebApp()?.HapticFeedback?.impactOccurred?.(pattern)
    },

    getTheme() {
      return { ...(getTelegramWebApp()?.themeParams ?? {}) }
    },

    bindLifecycle(bus) {
      const wa = getTelegramWebApp()
      const unbinders: Array<() => void> = []

      if (wa !== undefined && typeof wa.onEvent === 'function' && wa.isActive !== undefined) {
        const onActivated = (): void => bus.emit('app:resumed', {})
        const onDeactivated = (): void => bus.emit('app:paused', {})
        wa.onEvent('activated', onActivated)
        wa.onEvent('deactivated', onDeactivated)
        unbinders.push(() => {
          wa.offEvent?.('activated', onActivated)
          wa.offEvent?.('deactivated', onDeactivated)
        })
      } else {
        unbinders.push(bindVisibility(bus))
      }

      const back = wa?.BackButton
      if (back !== undefined && typeof back.onClick === 'function') {
        const onBack = (): void => bus.emit('app:back', {})
        back.show?.()
        back.onClick(onBack)
        unbinders.push(() => {
          back.offClick?.(onBack)
          back.hide?.()
        })
      }

      return () => {
        for (const unbind of unbinders) unbind()
      }
    },
  }
}

// ---------------------------------------------------------------------------
// Tauri bridge
// ---------------------------------------------------------------------------

interface TauriGlobal {
  shell?: { open?: (url: string) => unknown }
  opener?: { openUrl?: (url: string) => unknown }
  window?: {
    getCurrentWindow?: () => { close?: () => unknown } | undefined
    getCurrent?: () => { close?: () => unknown } | undefined
  }
}

function getTauriGlobal(): TauriGlobal | undefined {
  if (typeof window === 'undefined') return undefined
  return (window as unknown as { __TAURI__?: TauriGlobal }).__TAURI__
}

/**
 * Tauri 2 desktop bridge. `storage()` stays on `localStorage` (the WebView
 * persists it under the app's data dir) — upgrade to file saves with
 * {@link createTauriFileStorage}. `openExternal` prefers the shell/opener
 * plugin (via the `withGlobalTauri` global, else a dynamic import of
 * `@tauri-apps/plugin-shell`), falling back to `window.open`. Lifecycle:
 * `visibilitychange` plus `beforeunload` (window closing) → `app:paused`.
 */
export function createTauriBridge(): PlatformBridge {
  return {
    kind: 'tauri',
    storage: defaultWebStorage,

    openExternal(url) {
      const tauri = getTauriGlobal()
      const open = tauri?.shell?.open ?? tauri?.opener?.openUrl
      if (typeof open === 'function') {
        void open(url)
        return
      }
      dynamicImport('@tauri-apps/plugin-shell')
        .then((mod) => {
          const shellOpen = mod['open']
          if (typeof shellOpen === 'function') {
            void (shellOpen as (url: string) => unknown)(url)
          } else {
            openWithWindow(url)
          }
        })
        .catch(() => openWithWindow(url))
    },

    safeAreaInsets: () => ({ ...ZERO_INSETS }),

    bindLifecycle(bus) {
      const unbindVisibility = bindVisibility(bus)
      if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') {
        return unbindVisibility
      }
      const win = window
      const onBeforeUnload = (): void => bus.emit('app:paused', {})
      win.addEventListener('beforeunload', onBeforeUnload)
      return () => {
        unbindVisibility()
        win.removeEventListener('beforeunload', onBeforeUnload)
      }
    },

    quit() {
      const tauriWindow = getTauriGlobal()?.window
      const current = tauriWindow?.getCurrentWindow?.() ?? tauriWindow?.getCurrent?.()
      if (current !== undefined && typeof current.close === 'function') {
        void current.close()
        return
      }
      if (typeof window !== 'undefined' && typeof window.close === 'function') window.close()
    },
  }
}

/** Options for {@link createTauriFileStorage}. */
export interface TauriFileStorageOptions {
  /**
   * Path of the save file, relative to the app's data directory
   * (`BaseDirectory.AppData`). @default 'overworld-save.json'
   */
  fileName?: string
}

interface TauriFsModule {
  BaseDirectory?: { AppData?: number }
  exists?: (path: string, opts?: { baseDir?: number }) => Promise<boolean>
  mkdir?: (path: string, opts?: { baseDir?: number; recursive?: boolean }) => Promise<void>
  readTextFile?: (path: string, opts?: { baseDir?: number }) => Promise<string>
  writeTextFile?: (path: string, contents: string, opts?: { baseDir?: number }) => Promise<void>
}

/**
 * Optional file-based save storage for Tauri shells: one JSON file in the
 * app-data directory, loaded once up front and flushed (serialized, in
 * order) after every write.
 *
 * Requires `@tauri-apps/plugin-fs` **in the shell template** (this package
 * has no Tauri dependency; the plugin is loaded with a bundler-invisible
 * dynamic import and the returned promise rejects when it is missing).
 *
 * The result is async — resolve it *before* creating your stores, then hand
 * the resolved value to `persistOptions` / `createSaveSlots`:
 *
 * ```ts
 * const storage = await createTauriFileStorage()
 * persistOptions({ name: 'inventory', storage: () => storage })
 * createSaveSlots({ storage })
 * ```
 */
export async function createTauriFileStorage(
  options?: TauriFileStorageOptions
): Promise<EnumerableStorage> {
  const fileName = options?.fileName ?? 'overworld-save.json'

  let fs: TauriFsModule
  try {
    fs = (await dynamicImport('@tauri-apps/plugin-fs')) as TauriFsModule
  } catch (error) {
    throw new Error(
      '[overworld] createTauriFileStorage: failed to load "@tauri-apps/plugin-fs" — ' +
        'install it in your Tauri shell (pnpm add @tauri-apps/plugin-fs) and enable the fs plugin. ' +
        `Original error: ${String(error)}`
    )
  }
  if (typeof fs.readTextFile !== 'function' || typeof fs.writeTextFile !== 'function') {
    throw new Error(
      '[overworld] createTauriFileStorage: "@tauri-apps/plugin-fs" loaded but is missing readTextFile/writeTextFile'
    )
  }
  const baseDir = fs.BaseDirectory?.AppData
  const fsOptions = baseDir !== undefined ? { baseDir } : undefined

  // Best-effort: make sure the parent directory exists (AppData is not
  // auto-created by Tauri). Ignore failures — the write below will surface them.
  const lastSlash = fileName.lastIndexOf('/')
  if (lastSlash > 0 && typeof fs.mkdir === 'function') {
    try {
      await fs.mkdir(fileName.slice(0, lastSlash), { ...fsOptions, recursive: true })
    } catch {
      // Directory may already exist.
    }
  }

  const entries = new Map<string, string>()
  try {
    const raw = await fs.readTextFile(fileName, fsOptions)
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed === 'object' && parsed !== null) {
      for (const [key, value] of Object.entries(parsed)) {
        if (typeof value === 'string') entries.set(key, value)
      }
    }
  } catch {
    // First run (file missing) or corrupt file — start empty.
  }

  const writeTextFile = fs.writeTextFile
  let pendingWrite: Promise<void> = Promise.resolve()
  const flush = (): void => {
    const snapshot = JSON.stringify(Object.fromEntries(entries))
    pendingWrite = pendingWrite
      .then(() => writeTextFile(fileName, snapshot, fsOptions))
      .catch((error: unknown) => {
        console.error('[overworld] createTauriFileStorage: write failed', error)
      })
  }

  return {
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => {
      entries.set(key, value)
      flush()
    },
    removeItem: (key) => {
      if (entries.delete(key)) flush()
    },
    keys: () => [...entries.keys()],
  }
}

// ---------------------------------------------------------------------------
// Capacitor bridge
// ---------------------------------------------------------------------------

interface CapacitorListenerHandle {
  remove?: () => unknown
}

interface CapacitorGlobal {
  isNativePlatform?: () => boolean
  Plugins?: {
    App?: {
      addListener?: (
        event: string,
        cb: (data?: unknown) => void
      ) => CapacitorListenerHandle | Promise<CapacitorListenerHandle> | undefined
    }
    Browser?: { open?: (opts: { url: string }) => unknown }
    Haptics?: { impact?: (opts: { style: string }) => unknown }
  }
}

function getCapacitorGlobal(): CapacitorGlobal | undefined {
  if (typeof window === 'undefined') return undefined
  return (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor
}

/** Measure `env(safe-area-inset-*)` by computing the padding of a probe element. */
function readCssSafeArea(): SafeAreaInsets {
  if (
    typeof document === 'undefined' ||
    document.body == null ||
    typeof document.createElement !== 'function' ||
    typeof getComputedStyle !== 'function'
  ) {
    return { ...ZERO_INSETS }
  }
  try {
    const probe = document.createElement('div')
    probe.style.cssText =
      'position:fixed;top:0;left:0;visibility:hidden;pointer-events:none;' +
      'padding-top:env(safe-area-inset-top,0px);padding-right:env(safe-area-inset-right,0px);' +
      'padding-bottom:env(safe-area-inset-bottom,0px);padding-left:env(safe-area-inset-left,0px)'
    document.body.appendChild(probe)
    const style = getComputedStyle(probe)
    const parse = (value: string): number => {
      const parsed = Number.parseFloat(value)
      return Number.isFinite(parsed) ? parsed : 0
    }
    const insets = {
      top: parse(style.paddingTop),
      right: parse(style.paddingRight),
      bottom: parse(style.paddingBottom),
      left: parse(style.paddingLeft),
    }
    probe.remove()
    return insets
  } catch {
    return { ...ZERO_INSETS }
  }
}

const CAPACITOR_HAPTIC_STYLE: Record<'light' | 'medium' | 'heavy', string> = {
  light: 'LIGHT',
  medium: 'MEDIUM',
  heavy: 'HEAVY',
}

/**
 * Capacitor 7 mobile bridge. Lifecycle rides the App plugin
 * (`pause` / `resume` / `backButton` → bus, with `visibilitychange` as the
 * fallback when the plugin is absent); safe-area comes from CSS
 * `env(safe-area-inset-*)`; `vibrate` uses the Haptics plugin when present.
 */
export function createCapacitorBridge(): PlatformBridge {
  return {
    kind: 'capacitor',
    storage: defaultWebStorage,

    openExternal(url) {
      const browser = getCapacitorGlobal()?.Plugins?.Browser
      if (browser !== undefined && typeof browser.open === 'function') {
        void browser.open({ url })
        return
      }
      openWithWindow(url)
    },

    safeAreaInsets: readCssSafeArea,

    vibrate(pattern) {
      const haptics = getCapacitorGlobal()?.Plugins?.Haptics
      if (haptics !== undefined && typeof haptics.impact === 'function') {
        void haptics.impact({ style: CAPACITOR_HAPTIC_STYLE[pattern] })
      }
    },

    bindLifecycle(bus) {
      const app = getCapacitorGlobal()?.Plugins?.App
      if (app === undefined || typeof app.addListener !== 'function') {
        return bindVisibility(bus)
      }

      const handles = [
        app.addListener('pause', () => bus.emit('app:paused', {})),
        app.addListener('resume', () => bus.emit('app:resumed', {})),
        app.addListener('backButton', () => bus.emit('app:back', {})),
      ]
      return () => {
        for (const handle of handles) {
          // addListener returns a handle or (v3+) a promise of one.
          void Promise.resolve(handle)
            .then((resolved) => resolved?.remove?.())
            .catch(() => {})
        }
      }
    },
  }
}

// ---------------------------------------------------------------------------
// Bridge registry
// ---------------------------------------------------------------------------

const bridgeFactories = new Map<PlatformKind, () => PlatformBridge>()

/**
 * Register (or replace) the bridge factory for a platform kind. This is how
 * `@overworld-engine/adapters-weapp` plugs in the `weapp` bridge without
 * this package depending on it:
 *
 * ```ts
 * registerBridge('weapp', () => myWeappBridge)
 * ```
 */
export function registerBridge(kind: PlatformKind, factory: () => PlatformBridge): void {
  bridgeFactories.set(kind, factory)
}

registerBridge('web', createWebBridge)
registerBridge('telegram', createTelegramBridge)
registerBridge('tauri', createTauriBridge)
registerBridge('capacitor', createCapacitorBridge)

/**
 * Create the bridge for `kind` (default: `detectPlatform()`). Kinds without
 * a registered factory (e.g. `weapp` before `registerWeappBridge()`, or
 * `node`) fall back to the web bridge with a console warning.
 */
export function createBridge(kind?: PlatformKind): PlatformBridge {
  const resolved = kind ?? detectPlatform()
  const factory = bridgeFactories.get(resolved)
  if (factory !== undefined) return factory()
  console.warn(
    `[overworld] createBridge: no bridge registered for "${resolved}" — ` +
      'falling back to the web bridge (use registerBridge to provide one)'
  )
  return createWebBridge()
}
