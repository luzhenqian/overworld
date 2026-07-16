import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EventBus, type OverworldEventMap } from '@overworld-engine/core'
import { createBridge } from '@overworld-engine/platform'
import { createWeappBridge, registerWeappBridge } from '../bridge'

function makeFakeWx() {
  const showCbs = new Set<() => void>()
  const hideCbs = new Set<() => void>()
  const store = new Map<string, unknown>()
  return {
    fireShow: () => {
      for (const cb of [...showCbs]) cb()
    },
    fireHide: () => {
      for (const cb of [...hideCbs]) cb()
    },
    wx: {
      getStorageSync: (key: string) => store.get(key) ?? '',
      setStorageSync: (key: string, value: unknown) => void store.set(key, value),
      removeStorageSync: (key: string) => void store.delete(key),
      getStorageInfoSync: () => ({ keys: [...store.keys()] }),
      getSystemInfoSync: () => ({
        windowWidth: 390,
        windowHeight: 844,
        pixelRatio: 3,
        safeArea: { top: 47, right: 390, bottom: 810, left: 0, width: 390, height: 763 },
      }),
      onShow: (cb: () => void) => showCbs.add(cb),
      onHide: (cb: () => void) => hideCbs.add(cb),
      offShow: (cb: () => void) => showCbs.delete(cb),
      offHide: (cb: () => void) => hideCbs.delete(cb),
    },
    showCbs,
    hideCbs,
  }
}

let fake: ReturnType<typeof makeFakeWx>

beforeEach(() => {
  fake = makeFakeWx()
  vi.stubGlobal('wx', fake.wx)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('weapp platform bridge', () => {
  it('registerWeappBridge makes createBridge("weapp") return the weapp bridge', () => {
    registerWeappBridge()
    const bridge = createBridge('weapp')
    expect(bridge.kind).toBe('weapp')

    // Storage goes through wx storage.
    bridge.storage().setItem('overworld:x', '1')
    expect(fake.wx.getStorageSync('overworld:x')).toBe('1')
  })

  it('maps wx onShow/onHide to app:resumed/app:paused on the bus, unbind detaches', () => {
    const bridge = createWeappBridge()
    const bus = new EventBus<OverworldEventMap>()
    const events: string[] = []
    bus.on('app:paused', () => events.push('paused'))
    bus.on('app:resumed', () => events.push('resumed'))

    const unbind = bridge.bindLifecycle(bus)
    fake.fireHide()
    fake.fireShow()
    expect(events).toEqual(['paused', 'resumed'])

    unbind()
    expect(fake.showCbs.size).toBe(0)
    expect(fake.hideCbs.size).toBe(0)
    fake.fireHide()
    expect(events).toEqual(['paused', 'resumed'])
  })

  it('derives safe-area insets from getSystemInfoSync().safeArea', () => {
    const bridge = createWeappBridge()
    expect(bridge.safeAreaInsets()).toEqual({ top: 47, right: 0, bottom: 34, left: 0 })
  })

  it('openExternal is a warn-only no-op', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    createWeappBridge().openExternal('https://example.com')
    expect(warn).toHaveBeenCalledOnce()
  })
})
