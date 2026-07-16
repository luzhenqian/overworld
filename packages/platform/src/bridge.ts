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

/**
 * An {@link EnumerableStorage} whose asynchronous write-through can be awaited.
 *
 * Both {@link createTelegramCloudStorage} and {@link createTauriFileStorage}
 * return this: their `setItem`/`removeItem` update a synchronous in-memory
 * mirror and flush to the cloud/disk through a serialized queue, so `flush()`
 * resolves once that queue has drained. Await it on `app:paused` to guarantee
 * the save reached the cloud/disk *before* the app backgrounds — CloudStorage
 * and file writes are async and an OS may freeze the WebView the moment it is
 * hidden:
 *
 * ```ts
 * gameEvents.on('app:paused', () => {
 *   void storage.flush() // fire the drain; the platform is going to background
 * })
 * ```
 *
 * `flush()` is additive over {@link EnumerableStorage}, so anything typed as
 * `EnumerableStorage` keeps working; feature-detect with `'flush' in storage`
 * when the backend might instead be plain `localStorage`.
 */
export interface FlushableStorage extends EnumerableStorage {
  /**
   * Resolve once every queued async write has been flushed to the backing
   * store. Writes enqueued *while* the flush is in flight are followed too, so
   * the returned promise resolves only when the queue is quiescent.
   */
  flush(): Promise<void>
}

/**
 * Build a `flush()` that awaits the tail of a serialized write-through queue.
 * The queue's tail (`getTail()`) is reassigned on every enqueue, so we re-read
 * it after each await and loop until it stops changing — guaranteeing every
 * write outstanding at (and enqueued during) the flush has settled.
 */
function drainQueue(getTail: () => Promise<void>): () => Promise<void> {
  return async () => {
    let tail: Promise<void>
    do {
      tail = getTail()
      await tail
    } while (tail !== getTail())
  }
}

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

/**
 * Node-style `callback(error, result)` used by every Telegram `CloudStorage`
 * method. `error` is a non-empty string on failure, `null`/empty on success.
 */
type CloudStorageCallback<T> = (error: string | null, result?: T) => void

/**
 * Telegram `WebApp.CloudStorage` (Bot API ≥ 6.9): per-user cloud key/value
 * store synced across the user's devices. Every method is asynchronous and
 * reports via a `callback(error, result)`. Constraints enforced by Telegram:
 * keys match `[A-Za-z0-9_]` (length 1-128), values are ≤ 4096 bytes, and a
 * user may keep at most 1024 keys.
 */
interface TelegramCloudStorage {
  setItem: (key: string, value: string, callback?: CloudStorageCallback<boolean>) => void
  getItem: (key: string, callback: CloudStorageCallback<string>) => void
  getItems: (keys: string[], callback: CloudStorageCallback<Record<string, string>>) => void
  removeItem: (key: string, callback?: CloudStorageCallback<boolean>) => void
  removeItems: (keys: string[], callback?: CloudStorageCallback<boolean>) => void
  getKeys: (callback: CloudStorageCallback<string[]>) => void
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
  /** Cloud key/value store (Bot API ≥ 6.9); absent outside Telegram / on older clients. */
  CloudStorage?: TelegramCloudStorage
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
  /**
   * Telegram `CloudStorage`-backed {@link EnumerableStorage} — a per-user
   * cloud save that follows the player across devices. Delegates to
   * {@link createTelegramCloudStorage}: the returned promise resolves to a
   * synchronous mirror (built by loading every key up front) and **rejects**
   * outside Telegram or on clients below Bot API 6.9. Resolve it *before*
   * creating your persisted stores; fall back to {@link PlatformBridge.storage}
   * (localStorage) when it rejects. See {@link createTelegramCloudStorage} for
   * the size limits. The resolved storage is a {@link FlushableStorage} — call
   * `flush()` on `app:paused` to force the cloud write-through to drain before
   * the app backgrounds.
   */
  cloudStorage(options?: TelegramCloudStorageOptions): Promise<FlushableStorage>
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

    cloudStorage(options) {
      return createTelegramCloudStorage(options)
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

/** Telegram CloudStorage limits (Bot API): key charset/length and value size. */
const MAX_CLOUD_KEY_LENGTH = 128
const MAX_CLOUD_VALUE_BYTES = 4096

/** UTF-8 byte length of a string, guarded for environments without TextEncoder. */
function byteLength(value: string): number {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(value).length
  // Fallback estimate (over-counts nothing that matters for a soft warning).
  return value.length
}

/**
 * Encode an arbitrary storage key into Telegram CloudStorage's `[A-Za-z0-9_]`
 * charset. Every character outside `[A-Za-z0-9]` — including `_` itself — is
 * replaced with `_` followed by its 4-hex UTF-16 code unit, which
 * {@link decodeCloudKey} reverses exactly (`overworld:quest` ⇄
 * `overworld_003Aquest`). Because every emitted `_` starts a 5-char escape and
 * a literal `_` is itself escaped, decoding is unambiguous.
 */
export function encodeCloudKey(key: string): string {
  let out = ''
  for (let i = 0; i < key.length; i++) {
    const ch = key.charAt(i)
    out += /[A-Za-z0-9]/.test(ch)
      ? ch
      : '_' + key.charCodeAt(i).toString(16).padStart(4, '0').toUpperCase()
  }
  return out
}

/** Inverse of {@link encodeCloudKey}. */
export function decodeCloudKey(encoded: string): string {
  let out = ''
  for (let i = 0; i < encoded.length; i++) {
    if (encoded.charAt(i) === '_') {
      out += String.fromCharCode(Number.parseInt(encoded.slice(i + 1, i + 5), 16))
      i += 4
    } else {
      out += encoded.charAt(i)
    }
  }
  return out
}

/** Options for {@link createTelegramCloudStorage}. */
export interface TelegramCloudStorageOptions {
  /**
   * When set, only keys starting with this prefix are mirrored on load (and
   * `keys()` reflects just those). Writes are still stored under the full key
   * you pass; the prefix only scopes which existing keys are hydrated. Omit to
   * mirror every key in the user's CloudStorage.
   */
  prefix?: string
}

/**
 * Optional cloud-save storage for Telegram Mini Apps, backed by
 * `window.Telegram.WebApp.CloudStorage` (Bot API ≥ 6.9): a per-user key/value
 * store that Telegram syncs across the user's devices.
 *
 * Telegram's CloudStorage API is entirely **callback-async**, but core's
 * {@link EnumerableStorage} (and zustand's persist) needs synchronous
 * `getItem`/`setItem`/`keys`. So — exactly like {@link createTauriFileStorage}
 * — this loads every key once up front (`getKeys` → `getItems`) into an
 * in-memory `Map` mirror and returns a storage that reads/enumerates the
 * mirror **synchronously**, while writes update the mirror synchronously and
 * are flushed to CloudStorage asynchronously through a serialized queue. Flush
 * failures are swallowed (logged via `console.error`) so a failed cloud write
 * never crashes the game.
 *
 * Telegram-only: the returned promise **rejects with an actionable error**
 * outside Telegram or on clients below Bot API 6.9. Guard with a fallback:
 *
 * ```ts
 * const storage =
 *   bridge.kind === 'telegram' && 'cloudStorage' in bridge
 *     ? await bridge.cloudStorage().catch(() => bridge.storage())
 *     : bridge.storage()
 * persistOptions({ name: 'quest', storage: () => storage })
 * ```
 *
 * Overworld's persist keys are colon-namespaced (e.g. `overworld:quest`), but
 * Telegram only accepts keys matching `[A-Za-z0-9_]`. This adapter therefore
 * **transparently encodes** every storage key to a Telegram-legal wire form
 * (via {@link encodeCloudKey}) and back, so framework stores route through it
 * unchanged — `keys()` and `getItem` always speak the original colon keys. You
 * only need to respect Telegram's value/key-count limits: each value ≤ 4096
 * bytes and ≤ 1024 keys per user, so use CloudStorage for compact progress
 * state, not large blobs. Encoded keys longer than 128 chars (very long store
 * names with many escaped characters) are logged and skipped rather than
 * crashing.
 *
 * The returned storage is a {@link FlushableStorage}: `flush()` resolves once
 * the serialized cloud write-through queue has drained. Await it on
 * `app:paused` to guarantee saves reach the cloud before the app backgrounds.
 */
export async function createTelegramCloudStorage(
  options?: TelegramCloudStorageOptions
): Promise<FlushableStorage> {
  const cloud = getTelegramWebApp()?.CloudStorage
  if (
    cloud === undefined ||
    typeof cloud.getKeys !== 'function' ||
    typeof cloud.getItems !== 'function' ||
    typeof cloud.setItem !== 'function' ||
    typeof cloud.removeItem !== 'function'
  ) {
    throw new Error(
      '[overworld] createTelegramCloudStorage: window.Telegram.WebApp.CloudStorage is unavailable — ' +
        'CloudStorage only exists inside a Telegram Mini App on Bot API >= 6.9. ' +
        'Run this only when detectPlatform() === "telegram", and fall back to bridge.storage() ' +
        '(localStorage) elsewhere.'
    )
  }

  const prefix = options?.prefix

  // Load once. CloudStorage stores *encoded* keys; decode to the original keys
  // callers use, then scope by the original-key prefix.
  const encodedKeys = await new Promise<string[]>((resolve, reject) => {
    cloud.getKeys((error, keys) => {
      if (error) reject(new Error(`[overworld] createTelegramCloudStorage: getKeys failed: ${error}`))
      else resolve(keys ?? [])
    })
  })
  const pairs = encodedKeys.map((enc) => ({ enc, key: decodeCloudKey(enc) }))
  const scoped = prefix !== undefined ? pairs.filter((pair) => pair.key.startsWith(prefix)) : pairs

  const entries = new Map<string, string>()
  if (scoped.length > 0) {
    const values = await new Promise<Record<string, string>>((resolve, reject) => {
      cloud.getItems(
        scoped.map((pair) => pair.enc),
        (error, result) => {
          if (error) reject(new Error(`[overworld] createTelegramCloudStorage: getItems failed: ${error}`))
          else resolve(result ?? {})
        }
      )
    })
    // A key returned by getKeys is real even if its value is '' — trust
    // membership over value truthiness (fixes the empty-string round-trip).
    for (const { enc, key } of scoped) {
      const value = values[enc]
      entries.set(key, typeof value === 'string' ? value : '')
    }
  }

  // Serialize write-through so concurrent set/remove calls flush in order and
  // never race. Failures are logged, never thrown — a save must not crash the game.
  let pendingWrite: Promise<void> = Promise.resolve()
  const enqueue = (task: () => Promise<void>): void => {
    pendingWrite = pendingWrite.then(task).catch((error: unknown) => {
      console.error('[overworld] createTelegramCloudStorage: write failed', error)
    })
  }

  return {
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => {
      entries.set(key, value)
      const enc = encodeCloudKey(key)
      if (enc.length > MAX_CLOUD_KEY_LENGTH) {
        console.error(
          `[overworld] createTelegramCloudStorage: encoded key exceeds ${MAX_CLOUD_KEY_LENGTH} chars ` +
            `(Telegram limit), kept in the local mirror but not written to the cloud: ${key}`
        )
        return
      }
      if (byteLength(value) > MAX_CLOUD_VALUE_BYTES) {
        console.warn(
          `[overworld] createTelegramCloudStorage: value for "${key}" exceeds ${MAX_CLOUD_VALUE_BYTES} bytes; ` +
            'Telegram may reject it. Route large/authoritative state through your own backend instead.'
        )
      }
      enqueue(
        () =>
          new Promise<void>((resolve, reject) => {
            cloud.setItem(enc, value, (error) => {
              if (error) reject(new Error(String(error)))
              else resolve()
            })
          })
      )
    },
    removeItem: (key) => {
      if (!entries.delete(key)) return
      enqueue(
        () =>
          new Promise<void>((resolve, reject) => {
            cloud.removeItem(encodeCloudKey(key), (error) => {
              if (error) reject(new Error(String(error)))
              else resolve()
            })
          })
      )
    },
    keys: () => [...entries.keys()],
    flush: drainQueue(() => pendingWrite),
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
 *
 * Like {@link createTelegramCloudStorage}, the result is a
 * {@link FlushableStorage}: `flush()` resolves once the serialized disk
 * write-through queue has drained — await it on `app:paused` (Tauri wires
 * `beforeunload` → `app:paused`) so the last save lands before the window
 * closes.
 */
export async function createTauriFileStorage(
  options?: TauriFileStorageOptions
): Promise<FlushableStorage> {
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
  const scheduleWrite = (): void => {
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
      scheduleWrite()
    },
    removeItem: (key) => {
      if (entries.delete(key)) scheduleWrite()
    },
    keys: () => [...entries.keys()],
    flush: drainQueue(() => pendingWrite),
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
