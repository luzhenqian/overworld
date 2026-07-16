import { EventBus, type OverworldEventMap } from '@overworld-engine/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createBridge,
  createCapacitorBridge,
  createTauriBridge,
  createTauriFileStorage,
  createTelegramBridge,
  createWebBridge,
  registerBridge,
  type PlatformBridge,
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
