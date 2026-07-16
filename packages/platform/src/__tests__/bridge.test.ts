import { EventBus, createSaveSlots, type OverworldEventMap } from '@overworld-engine/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createBridge,
  createCapacitorBridge,
  createTauriBridge,
  createTauriFileStorage,
  createTelegramBridge,
  createTelegramCloudStorage,
  encodeCloudKey,
  decodeCloudKey,
  createWebBridge,
  registerBridge,
  type PlatformBridge,
  type TelegramBridge,
} from '../bridge'
import { configurePlatform, resetPlatform } from '../detection'

// ---------------------------------------------------------------------------
// Stub helpers
// ---------------------------------------------------------------------------

interface EventTargetStub {
  addEventListener: (event: string, cb: () => void) => void
  removeEventListener: (event: string, cb: () => void) => void
  fire: (event: string) => void
  listenerCount: (event: string) => number
}

function createEventTargetStub(): EventTargetStub {
  const listeners = new Map<string, Set<() => void>>()
  return {
    addEventListener(event, cb) {
      let set = listeners.get(event)
      if (!set) {
        set = new Set()
        listeners.set(event, set)
      }
      set.add(cb)
    },
    removeEventListener(event, cb) {
      listeners.get(event)?.delete(cb)
    },
    fire(event) {
      for (const cb of [...(listeners.get(event) ?? [])]) cb()
    },
    listenerCount(event) {
      return listeners.get(event)?.size ?? 0
    },
  }
}

function stubDocument(): EventTargetStub & { visibilityState: string } {
  const doc = Object.assign(createEventTargetStub(), { visibilityState: 'visible' })
  vi.stubGlobal('document', doc)
  return doc
}

function trackEvents(bus: EventBus<OverworldEventMap>): string[] {
  const events: string[] = []
  bus.onAny((event) => events.push(String(event)))
  return events
}

const flushMicrotasks = async (): Promise<void> => {
  await Promise.resolve()
  await Promise.resolve()
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  resetPlatform()
  // Restore the built-in factories in case a test overrode them.
  registerBridge('web', createWebBridge)
  registerBridge('telegram', createTelegramBridge)
  registerBridge('tauri', createTauriBridge)
  registerBridge('capacitor', createCapacitorBridge)
})

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

describe('createBridge / registerBridge', () => {
  it('defaults to the detected platform', () => {
    configurePlatform({ force: 'telegram' })
    expect(createBridge().kind).toBe('telegram')
  })

  it('an explicit kind wins over detection', () => {
    configurePlatform({ force: 'telegram' })
    expect(createBridge('tauri').kind).toBe('tauri')
  })

  it('unknown kinds fall back to the web bridge with a warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const bridge = createBridge('node')
    expect(bridge.kind).toBe('web')
    expect(warn).toHaveBeenCalledOnce()
    expect(warn.mock.calls[0]?.[0]).toContain('"node"')
  })

  it('registerBridge lets externals provide (or replace) a factory', () => {
    const custom: PlatformBridge = {
      kind: 'weapp',
      storage: () => ({
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
        keys: () => [],
      }),
      openExternal: () => {},
      safeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
      bindLifecycle: () => () => {},
    }
    registerBridge('weapp', () => custom)
    expect(createBridge('weapp')).toBe(custom)

    // Replacing a built-in also works.
    registerBridge('web', () => custom)
    expect(createBridge('web')).toBe(custom)
  })
})

// ---------------------------------------------------------------------------
// Web bridge
// ---------------------------------------------------------------------------

describe('webBridge', () => {
  it('storage() satisfies EnumerableStorage (memory fallback without localStorage)', () => {
    const storage = createWebBridge().storage()
    storage.setItem('overworld:a', '1')
    storage.setItem('overworld:b', '2')
    expect(storage.getItem('overworld:a')).toBe('1')
    expect(storage.keys().sort()).toEqual(['overworld:a', 'overworld:b'])
    storage.removeItem('overworld:a')
    expect(storage.getItem('overworld:a')).toBeNull()
    expect(storage.keys()).toEqual(['overworld:b'])
  })

  it('storage() wraps localStorage when available, keys() enumerating it', () => {
    const backing = new Map<string, string>([['overworld:x', '42']])
    vi.stubGlobal('localStorage', {
      get length() {
        return backing.size
      },
      key: (i: number) => [...backing.keys()][i] ?? null,
      getItem: (k: string) => backing.get(k) ?? null,
      setItem: (k: string, v: string) => void backing.set(k, v),
      removeItem: (k: string) => void backing.delete(k),
    })
    const storage = createWebBridge().storage()
    expect(storage.getItem('overworld:x')).toBe('42')
    storage.setItem('overworld:y', '7')
    expect(storage.keys().sort()).toEqual(['overworld:x', 'overworld:y'])
  })

  it('openExternal opens a new window with noopener', () => {
    const open = vi.fn()
    vi.stubGlobal('window', { open })
    createWebBridge().openExternal('https://example.com')
    expect(open).toHaveBeenCalledWith('https://example.com', '_blank', 'noopener,noreferrer')
  })

  it('bindLifecycle maps visibilitychange to app:paused/app:resumed and unbinds', () => {
    const doc = stubDocument()
    const bus = new EventBus<OverworldEventMap>()
    const events = trackEvents(bus)

    const unbind = createWebBridge().bindLifecycle(bus)
    expect(doc.listenerCount('visibilitychange')).toBe(1)

    doc.visibilityState = 'hidden'
    doc.fire('visibilitychange')
    doc.visibilityState = 'visible'
    doc.fire('visibilitychange')
    expect(events).toEqual(['app:paused', 'app:resumed'])

    unbind()
    expect(doc.listenerCount('visibilitychange')).toBe(0)
    doc.visibilityState = 'hidden'
    doc.fire('visibilitychange')
    expect(events).toEqual(['app:paused', 'app:resumed'])
  })

  it('bindLifecycle is a no-op without a document', () => {
    const bus = new EventBus<OverworldEventMap>()
    expect(() => createWebBridge().bindLifecycle(bus)()).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// Telegram bridge
// ---------------------------------------------------------------------------

interface TelegramStub {
  webApp: Record<string, unknown>
  fire: (event: string) => void
  fireBack: () => void
  ready: ReturnType<typeof vi.fn>
  expand: ReturnType<typeof vi.fn>
  openLink: ReturnType<typeof vi.fn>
  backShow: ReturnType<typeof vi.fn>
  backHide: ReturnType<typeof vi.fn>
  impact: ReturnType<typeof vi.fn>
  offEvent: ReturnType<typeof vi.fn>
}

function stubTelegram(): TelegramStub {
  const listeners = new Map<string, Set<() => void>>()
  const backClicks = new Set<() => void>()
  const ready = vi.fn()
  const expand = vi.fn()
  const openLink = vi.fn()
  const backShow = vi.fn()
  const backHide = vi.fn()
  const impact = vi.fn()
  const offEvent = vi.fn((event: string, cb: () => void) => {
    listeners.get(event)?.delete(cb)
  })
  const webApp = {
    initData: 'query_id=abc',
    isActive: true,
    ready,
    expand,
    openLink,
    themeParams: { bg_color: '#17212b' },
    safeAreaInset: { top: 47, right: 0, bottom: 34, left: 0 },
    onEvent: (event: string, cb: () => void) => {
      let set = listeners.get(event)
      if (!set) {
        set = new Set()
        listeners.set(event, set)
      }
      set.add(cb)
    },
    offEvent,
    BackButton: {
      show: backShow,
      hide: backHide,
      onClick: (cb: () => void) => void backClicks.add(cb),
      offClick: (cb: () => void) => void backClicks.delete(cb),
    },
    HapticFeedback: { impactOccurred: impact },
  }
  vi.stubGlobal('window', { Telegram: { WebApp: webApp } })
  return {
    webApp,
    fire: (event) => {
      for (const cb of [...(listeners.get(event) ?? [])]) cb()
    },
    fireBack: () => {
      for (const cb of [...backClicks]) cb()
    },
    ready,
    expand,
    openLink,
    backShow,
    backHide,
    impact,
    offEvent,
  }
}

describe('telegramBridge', () => {
  it('creation calls ready() and expand()', () => {
    const tg = stubTelegram()
    createTelegramBridge()
    expect(tg.ready).toHaveBeenCalledOnce()
    expect(tg.expand).toHaveBeenCalledOnce()
  })

  it('openExternal uses WebApp.openLink', () => {
    const tg = stubTelegram()
    createTelegramBridge().openExternal('https://example.com')
    expect(tg.openLink).toHaveBeenCalledWith('https://example.com')
  })

  it('safeAreaInsets reads WebApp.safeAreaInset (zeros when absent)', () => {
    stubTelegram()
    expect(createTelegramBridge().safeAreaInsets()).toEqual({
      top: 47,
      right: 0,
      bottom: 34,
      left: 0,
    })
    vi.stubGlobal('window', { Telegram: { WebApp: {} } })
    expect(createTelegramBridge().safeAreaInsets()).toEqual({
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    })
  })

  it('getTheme returns a copy of themeParams', () => {
    const tg = stubTelegram()
    const theme = createTelegramBridge().getTheme()
    expect(theme).toEqual({ bg_color: '#17212b' })
    expect(theme).not.toBe(tg.webApp['themeParams'])
  })

  it('vibrate forwards the pattern to HapticFeedback.impactOccurred', () => {
    const tg = stubTelegram()
    createTelegramBridge().vibrate?.('light')
    expect(tg.impact).toHaveBeenCalledWith('light')
  })

  it('bindLifecycle: activated/deactivated events and BackButton → app:back', () => {
    const tg = stubTelegram()
    const bus = new EventBus<OverworldEventMap>()
    const events = trackEvents(bus)

    const unbind = createTelegramBridge().bindLifecycle(bus)
    expect(tg.backShow).toHaveBeenCalledOnce()

    tg.fire('deactivated')
    tg.fire('activated')
    tg.fireBack()
    expect(events).toEqual(['app:paused', 'app:resumed', 'app:back'])

    unbind()
    expect(tg.offEvent).toHaveBeenCalledTimes(2)
    expect(tg.backHide).toHaveBeenCalledOnce()
    tg.fire('deactivated')
    tg.fireBack()
    expect(events).toEqual(['app:paused', 'app:resumed', 'app:back'])
  })

  it('bindLifecycle falls back to visibilitychange without activated/deactivated support', () => {
    vi.stubGlobal('window', { Telegram: { WebApp: { initData: 'x' } } })
    const doc = stubDocument()
    const bus = new EventBus<OverworldEventMap>()
    const events = trackEvents(bus)

    createTelegramBridge().bindLifecycle(bus)
    doc.visibilityState = 'hidden'
    doc.fire('visibilitychange')
    expect(events).toEqual(['app:paused'])
  })
})

// ---------------------------------------------------------------------------
// Telegram CloudStorage
// ---------------------------------------------------------------------------

interface CloudStorageStub {
  data: Map<string, string>
  sets: Array<{ key: string; value: string }>
  removes: string[]
  webApp: Record<string, unknown>
}

/**
 * In-memory Telegram CloudStorage stub: the real API is entirely
 * callback-async, so every method here invokes its `callback(error, result)`
 * (synchronously — good enough to exercise the serialized write-through queue).
 */
function stubCloudStorage(initial?: Record<string, string>): CloudStorageStub {
  const data = new Map<string, string>(Object.entries(initial ?? {}))
  const sets: Array<{ key: string; value: string }> = []
  const removes: string[] = []
  const CloudStorage = {
    getKeys(cb: (error: string | null, keys?: string[]) => void) {
      cb(null, [...data.keys()])
    },
    getItems(keys: string[], cb: (error: string | null, values?: Record<string, string>) => void) {
      const out: Record<string, string> = {}
      for (const key of keys) out[key] = data.get(key) ?? ''
      cb(null, out)
    },
    getItem(key: string, cb: (error: string | null, value?: string) => void) {
      cb(null, data.get(key) ?? '')
    },
    setItem(key: string, value: string, cb?: (error: string | null, success?: boolean) => void) {
      // Model real Telegram: reject keys outside [A-Za-z0-9_] (1-128) so the
      // suite proves the adapter only ever sends legal (encoded) keys.
      if (!/^[A-Za-z0-9_]{1,128}$/.test(key)) {
        cb?.('WEBAPP_CLOUD_STORAGE_INVALID_KEY')
        return
      }
      data.set(key, value)
      sets.push({ key, value })
      cb?.(null, true)
    },
    removeItem(key: string, cb?: (error: string | null, success?: boolean) => void) {
      data.delete(key)
      removes.push(key)
      cb?.(null, true)
    },
    removeItems(keys: string[], cb?: (error: string | null, success?: boolean) => void) {
      for (const key of keys) data.delete(key)
      cb?.(null, true)
    },
  }
  const webApp = { initData: 'query_id=abc', CloudStorage }
  vi.stubGlobal('window', { Telegram: { WebApp: webApp } })
  return { data, sets, removes, webApp }
}

// Real setTimeout(0) crosses a macrotask boundary, after the whole serialized
// microtask write-through chain has settled — robust regardless of its length.
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

describe('encodeCloudKey / decodeCloudKey', () => {
  it('round-trips arbitrary keys within Telegram\'s [A-Za-z0-9_] charset', () => {
    for (const key of [
      'overworld:quest',
      'overworld:save-slot',
      'plain',
      'has_underscore',
      'a:b/c.d e',
      'symbols!@#$%^&*()',
      'unicode_名前',
    ]) {
      const enc = encodeCloudKey(key)
      expect(enc).toMatch(/^[A-Za-z0-9_]*$/) // legal Telegram key charset
      expect(decodeCloudKey(enc)).toBe(key) // exact reversibility
    }
  })

  it('escapes the colon and the underscore itself unambiguously', () => {
    expect(encodeCloudKey('overworld:quest')).toBe('overworld_003Aquest')
    // A literal '_' must be escaped so it is not mistaken for an escape start.
    expect(encodeCloudKey('a_b')).toBe('a_005Fb')
    expect(decodeCloudKey('a_005Fb')).toBe('a_b')
  })
})

/** Seed a CloudStorage stub as Telegram really holds it: under *encoded* keys. */
function seedEncoded(original: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(original)) out[encodeCloudKey(key)] = value
  return out
}

describe('createTelegramCloudStorage', () => {
  it('loads keys+values into a synchronous mirror, decoding to original keys', async () => {
    stubCloudStorage(seedEncoded({ 'overworld:quest': '1', 'overworld:ach': '2' }))
    const storage = await createTelegramCloudStorage()
    expect(storage.getItem('overworld:quest')).toBe('1')
    expect(storage.getItem('overworld:ach')).toBe('2')
    expect(storage.getItem('missing')).toBeNull()
    expect(storage.keys().sort()).toEqual(['overworld:ach', 'overworld:quest'])
  })

  it('setItem mirrors synchronously and writes a legal, decodable key through', async () => {
    const stub = stubCloudStorage()
    const storage = await createTelegramCloudStorage()

    storage.setItem('overworld:quest', '42')
    // Mirror speaks the ORIGINAL key and reflects the write immediately.
    expect(storage.getItem('overworld:quest')).toBe('42')
    expect(storage.keys()).toEqual(['overworld:quest'])

    await settle()
    // The wire key Telegram received is legal and decodes back to the original.
    expect(stub.sets).toHaveLength(1)
    const wireKey = stub.sets[0]?.key ?? ''
    expect(wireKey).toMatch(/^[A-Za-z0-9_]+$/)
    expect(wireKey).not.toContain(':')
    expect(decodeCloudKey(wireKey)).toBe('overworld:quest')
    expect(stub.data.get(wireKey)).toBe('42')
  })

  it('the colon key that broke a naive pass-through now persists end-to-end', async () => {
    // With a charset-enforcing stub, a naive pass-through would have its
    // `overworld:quest` write rejected and swallowed → nothing persisted.
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const stub = stubCloudStorage()
    const first = await createTelegramCloudStorage()
    first.setItem('overworld:quest', '{"active":{"gather":1}}')
    await settle()
    // No write was rejected (no swallowed error), and something was stored.
    expect(error).not.toHaveBeenCalled()
    expect(stub.sets).toHaveLength(1)
    // A fresh adapter (simulated reload) rehydrates the original key + value.
    const reloaded = await createTelegramCloudStorage()
    expect(reloaded.getItem('overworld:quest')).toBe('{"active":{"gather":1}}')
    error.mockRestore()
  })

  it('round-trips an empty-string value (getKeys membership, not truthiness)', async () => {
    const stub = stubCloudStorage()
    const first = await createTelegramCloudStorage()
    first.setItem('overworld:flag', '')
    await settle()
    expect(stub.sets).toHaveLength(1)
    const reloaded = await createTelegramCloudStorage()
    // A stored '' must survive reload as '' — not be dropped as "absent".
    expect(reloaded.getItem('overworld:flag')).toBe('')
    expect(reloaded.keys()).toEqual(['overworld:flag'])
  })

  it('removeItem updates the mirror and writes through; absent keys are a no-op', async () => {
    const stub = stubCloudStorage(seedEncoded({ 'overworld:quest': '1' }))
    const storage = await createTelegramCloudStorage()

    storage.removeItem('overworld:quest')
    expect(storage.getItem('overworld:quest')).toBeNull()
    storage.removeItem('missing') // not in the mirror → no write-through

    await settle()
    expect(stub.removes).toHaveLength(1)
    expect(decodeCloudKey(stub.removes[0] ?? '')).toBe('overworld:quest')
    expect(stub.data.size).toBe(0)
  })

  it('serializes concurrent writes so CloudStorage sees them in order', async () => {
    const stub = stubCloudStorage()
    const storage = await createTelegramCloudStorage()

    storage.setItem('k', '1')
    storage.setItem('k', '2')
    storage.setItem('k', '3')

    await settle()
    expect(stub.sets.map((entry) => entry.value)).toEqual(['1', '2', '3'])
    expect(stub.data.get('k')).toBe('3') // 'k' is charset-legal → unencoded
  })

  it('swallows write failures (console.error) so a failed save never throws', async () => {
    const stub = stubCloudStorage()
    ;(stub.webApp['CloudStorage'] as { setItem: unknown }).setItem = (
      _key: string,
      _value: string,
      cb?: (error: string | null) => void
    ) => cb?.('CLOUD_STORAGE_QUOTA_EXCEEDED')
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const storage = await createTelegramCloudStorage()

    expect(() => storage.setItem('k', 'v')).not.toThrow()
    await settle()
    expect(error).toHaveBeenCalledOnce()
    expect(String(error.mock.calls[0]?.[1])).toContain('CLOUD_STORAGE_QUOTA_EXCEEDED')
    error.mockRestore()
  })

  it('logs and skips (keeps in mirror) a write whose encoded key exceeds 128 chars', async () => {
    const stub = stubCloudStorage()
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const storage = await createTelegramCloudStorage()
    const longKey = 'overworld:' + ':'.repeat(60) // each ':' → 5 chars encoded → >128
    storage.setItem(longKey, 'v')
    expect(storage.getItem(longKey)).toBe('v') // mirror keeps it
    await settle()
    expect(stub.sets).toHaveLength(0) // nothing written to the cloud
    expect(error).toHaveBeenCalledOnce()
    error.mockRestore()
  })

  it('rejects with an actionable error when CloudStorage is unavailable', async () => {
    vi.stubGlobal('window', { Telegram: { WebApp: { initData: 'x' } } })
    await expect(createTelegramCloudStorage()).rejects.toThrow(/CloudStorage is unavailable/)
    vi.stubGlobal('window', {})
    await expect(createTelegramCloudStorage()).rejects.toThrow(/Bot API >= 6\.9/)
  })

  it('filters the mirror to the given (original-key) prefix', async () => {
    stubCloudStorage(seedEncoded({ 'game:a': '1', 'game:b': '2', 'other:c': '3' }))
    const storage = await createTelegramCloudStorage({ prefix: 'game:' })
    expect(storage.keys().sort()).toEqual(['game:a', 'game:b'])
    expect(storage.getItem('other:c')).toBeNull()
  })

  it('bridge.cloudStorage() delegates to createTelegramCloudStorage', async () => {
    stubCloudStorage(seedEncoded({ 'overworld:x': '9' }))
    const bridge = createTelegramBridge() as TelegramBridge
    const storage = await bridge.cloudStorage()
    expect(storage.getItem('overworld:x')).toBe('9')
  })

  it('flush() resolves only after the serialized write-through queue drains', async () => {
    const stub = stubCloudStorage()
    const storage = await createTelegramCloudStorage()

    storage.setItem('overworld:a', '1')
    storage.setItem('overworld:b', '2')
    // Writes are queued (async); nothing has necessarily reached the cloud yet.
    await storage.flush()
    // By the time flush() resolves, every queued write has landed on the wire.
    expect(stub.sets).toHaveLength(2)
    expect(stub.data.get(encodeCloudKey('overworld:a'))).toBe('1')
    expect(stub.data.get(encodeCloudKey('overworld:b'))).toBe('2')
  })
})

// ---------------------------------------------------------------------------
// createSaveSlots over Telegram CloudStorage
// ---------------------------------------------------------------------------

describe('createSaveSlots over Telegram CloudStorage', () => {
  it('named save slots round-trip through the charset-enforcing cloud mirror', async () => {
    // Seed a live save exactly as Telegram holds it (under an *encoded* key).
    const stub = stubCloudStorage(seedEncoded({ 'overworld:quest': '{"active":{"gather":1}}' }))
    const storage = await createTelegramCloudStorage()
    // createSaveSlots works over ANY EnumerableStorage — the cloud mirror's
    // synchronous keys()/getItem satisfy it with no cloud-specific code.
    const slots = createSaveSlots({ storage }) // prefix defaults to 'overworld'

    // The live key is visible to saveSlots through the mirror's sync keys().
    expect(storage.keys()).toEqual(['overworld:quest'])

    // Copy the live save into a named slot.
    slots.saveTo('slot-1')
    expect(slots.listSlots().map((info) => info.slot)).toEqual(['slot-1'])

    // Mutate + clear the live save ("new game").
    storage.setItem('overworld:quest', '{"active":{"gather":3}}')
    slots.clearCurrent()
    expect(storage.getItem('overworld:quest')).toBeNull()
    expect(slots.snapshot().entries).toEqual({}) // live save empty
    // Only the slot key survives in the mirror; the live namespace is empty.
    expect(storage.keys()).toEqual(['overworld:slots:slot-1'])

    // Restore the slot back into the live keys.
    expect(slots.loadFrom('slot-1')).toBe(true)
    expect(storage.getItem('overworld:quest')).toBe('{"active":{"gather":1}}')

    // Drain the serialized write-through, then assert EVERY wire key that ever
    // hit CloudStorage is Telegram-legal — including the slots namespace key.
    await storage.flush()
    for (const { key } of stub.sets) expect(key).toMatch(/^[A-Za-z0-9_]+$/)
    for (const key of stub.removes) expect(key).toMatch(/^[A-Za-z0-9_]+$/)

    // The slot namespace key (overworld:slots:slot-1) must be encoded on the wire.
    const slotWireKey = encodeCloudKey('overworld:slots:slot-1')
    expect(slotWireKey).toMatch(/^[A-Za-z0-9_]+$/)
    expect(slotWireKey).not.toContain(':')
    expect(stub.sets.some((entry) => entry.key === slotWireKey)).toBe(true)
    expect(stub.data.has(slotWireKey)).toBe(true) // slot persisted under the encoded key

    // deleteSlot removes it from both the mirror and (after flush) the cloud.
    slots.deleteSlot('slot-1')
    expect(slots.listSlots()).toEqual([])
    await storage.flush()
    expect(stub.data.has(slotWireKey)).toBe(false)

    // keys() enumerates the live keys correctly for saveSlots after a flush.
    expect(storage.keys()).toEqual(['overworld:quest'])
  })
})

// ---------------------------------------------------------------------------
// Tauri bridge
// ---------------------------------------------------------------------------

describe('tauriBridge', () => {
  it('bindLifecycle: visibilitychange plus beforeunload → app:paused', () => {
    const doc = stubDocument()
    const win = createEventTargetStub()
    vi.stubGlobal('window', win)
    const bus = new EventBus<OverworldEventMap>()
    const events = trackEvents(bus)

    const unbind = createTauriBridge().bindLifecycle(bus)
    doc.visibilityState = 'hidden'
    doc.fire('visibilitychange')
    win.fire('beforeunload')
    expect(events).toEqual(['app:paused', 'app:paused'])

    unbind()
    win.fire('beforeunload')
    doc.fire('visibilitychange')
    expect(events).toEqual(['app:paused', 'app:paused'])
  })

  it('openExternal prefers the global shell plugin', () => {
    const open = vi.fn()
    vi.stubGlobal('window', { __TAURI__: { shell: { open } } })
    createTauriBridge().openExternal('https://example.com')
    expect(open).toHaveBeenCalledWith('https://example.com')
  })

  it('quit closes the current Tauri window', () => {
    const close = vi.fn()
    vi.stubGlobal('window', { __TAURI__: { window: { getCurrentWindow: () => ({ close }) } } })
    createTauriBridge().quit?.()
    expect(close).toHaveBeenCalledOnce()
  })

  it('createTauriFileStorage rejects with a helpful error when plugin-fs is missing', async () => {
    await expect(createTauriFileStorage()).rejects.toThrow(/@tauri-apps\/plugin-fs/)
  })
})

// ---------------------------------------------------------------------------
// Capacitor bridge
// ---------------------------------------------------------------------------

function stubCapacitor(): {
  fire: (event: string) => void
  removes: ReturnType<typeof vi.fn>[]
  browserOpen: ReturnType<typeof vi.fn>
  impact: ReturnType<typeof vi.fn>
} {
  const listeners = new Map<string, Set<(data?: unknown) => void>>()
  const removes: ReturnType<typeof vi.fn>[] = []
  const browserOpen = vi.fn()
  const impact = vi.fn()
  vi.stubGlobal('window', {
    Capacitor: {
      isNativePlatform: () => true,
      Plugins: {
        App: {
          addListener: (event: string, cb: (data?: unknown) => void) => {
            let set = listeners.get(event)
            if (!set) {
              set = new Set()
              listeners.set(event, set)
            }
            set.add(cb)
            const remove = vi.fn(() => set.delete(cb))
            removes.push(remove)
            // v3+ returns a promise of the handle.
            return Promise.resolve({ remove })
          },
        },
        Browser: { open: browserOpen },
        Haptics: { impact },
      },
    },
  })
  return {
    fire: (event) => {
      for (const cb of [...(listeners.get(event) ?? [])]) cb()
    },
    removes,
    browserOpen,
    impact,
  }
}

describe('capacitorBridge', () => {
  it('bindLifecycle: App plugin pause/resume/backButton → bus events', () => {
    const cap = stubCapacitor()
    const bus = new EventBus<OverworldEventMap>()
    const events = trackEvents(bus)

    createCapacitorBridge().bindLifecycle(bus)
    cap.fire('pause')
    cap.fire('resume')
    cap.fire('backButton')
    expect(events).toEqual(['app:paused', 'app:resumed', 'app:back'])
  })

  it('unbind removes all App plugin listeners (promise-returning addListener)', async () => {
    const cap = stubCapacitor()
    const bus = new EventBus<OverworldEventMap>()
    const events = trackEvents(bus)

    const unbind = createCapacitorBridge().bindLifecycle(bus)
    unbind()
    await flushMicrotasks()
    expect(cap.removes).toHaveLength(3)
    for (const remove of cap.removes) expect(remove).toHaveBeenCalledOnce()
    cap.fire('pause')
    expect(events).toEqual([])
  })

  it('falls back to visibilitychange when the App plugin is missing', () => {
    vi.stubGlobal('window', { Capacitor: { isNativePlatform: () => true } })
    const doc = stubDocument()
    const bus = new EventBus<OverworldEventMap>()
    const events = trackEvents(bus)

    createCapacitorBridge().bindLifecycle(bus)
    doc.visibilityState = 'hidden'
    doc.fire('visibilitychange')
    expect(events).toEqual(['app:paused'])
  })

  it('openExternal uses the Browser plugin', () => {
    const cap = stubCapacitor()
    createCapacitorBridge().openExternal('https://example.com')
    expect(cap.browserOpen).toHaveBeenCalledWith({ url: 'https://example.com' })
  })

  it('vibrate maps patterns to Haptics impact styles', () => {
    const cap = stubCapacitor()
    createCapacitorBridge().vibrate?.('heavy')
    expect(cap.impact).toHaveBeenCalledWith({ style: 'HEAVY' })
  })

  it('safeAreaInsets returns zeros without a usable DOM', () => {
    stubCapacitor()
    expect(createCapacitorBridge().safeAreaInsets()).toEqual({
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    })
  })
})
