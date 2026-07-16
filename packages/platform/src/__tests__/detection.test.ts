import { afterEach, describe, expect, it, vi } from 'vitest'
import { configurePlatform, detectPlatform, resetPlatform } from '../detection'

const weappWx = { getSystemInfoSync: () => ({ platform: 'devtools' }) }
const telegramWindow = { Telegram: { WebApp: { initData: 'query_id=abc&user=1' } } }

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  resetPlatform()
})

describe('detectPlatform — probe order (descending specificity)', () => {
  it('returns node when no host globals exist', () => {
    expect(detectPlatform()).toBe('node')
  })

  it('returns web for a bare window', () => {
    vi.stubGlobal('window', {})
    expect(detectPlatform()).toBe('web')
  })

  it('returns telegram when Telegram.WebApp has non-empty initData', () => {
    vi.stubGlobal('window', telegramWindow)
    expect(detectPlatform()).toBe('telegram')
  })

  it('treats empty initData as plain web (Telegram script loaded outside Telegram)', () => {
    vi.stubGlobal('window', { Telegram: { WebApp: { initData: '' } } })
    expect(detectPlatform()).toBe('web')
  })

  it('returns capacitor when window.Capacitor is present', () => {
    vi.stubGlobal('window', { Capacitor: {} })
    expect(detectPlatform()).toBe('capacitor')
  })

  it('capacitor wins over telegram (more specific shell)', () => {
    vi.stubGlobal('window', { ...telegramWindow, Capacitor: { isNativePlatform: () => true } })
    expect(detectPlatform()).toBe('capacitor')
  })

  it('a non-native Capacitor runtime (web build) falls through to telegram', () => {
    vi.stubGlobal('window', { ...telegramWindow, Capacitor: { isNativePlatform: () => false } })
    expect(detectPlatform()).toBe('telegram')
  })

  it('a non-native Capacitor runtime alone falls through to web', () => {
    vi.stubGlobal('window', { Capacitor: { isNativePlatform: () => false } })
    expect(detectPlatform()).toBe('web')
  })

  it('a Capacitor runtime whose isNativePlatform throws still counts as capacitor', () => {
    vi.stubGlobal('window', {
      Capacitor: {
        isNativePlatform: () => {
          throw new Error('boom')
        },
      },
    })
    expect(detectPlatform()).toBe('capacitor')
  })

  it('tauri wins over capacitor and telegram', () => {
    vi.stubGlobal('window', {
      __TAURI_INTERNALS__: {},
      Capacitor: { isNativePlatform: () => true },
      ...telegramWindow,
    })
    expect(detectPlatform()).toBe('tauri')
  })

  it('weapp wins over everything', () => {
    vi.stubGlobal('wx', weappWx)
    vi.stubGlobal('window', {
      __TAURI_INTERNALS__: {},
      Capacitor: {},
      ...telegramWindow,
    })
    expect(detectPlatform()).toBe('weapp')
  })

  it('a wx global without getSystemInfoSync is not weapp', () => {
    vi.stubGlobal('wx', { someOtherApi: true })
    vi.stubGlobal('window', {})
    expect(detectPlatform()).toBe('web')
  })

  it('a wx global without window (and no functional API) is node', () => {
    vi.stubGlobal('wx', {})
    expect(detectPlatform()).toBe('node')
  })
})

describe('configurePlatform / resetPlatform', () => {
  it('force overrides detection regardless of globals', () => {
    vi.stubGlobal('window', { Capacitor: {} })
    configurePlatform({ force: 'telegram' })
    expect(detectPlatform()).toBe('telegram')
  })

  it('resetPlatform returns to real detection', () => {
    configurePlatform({ force: 'weapp' })
    expect(detectPlatform()).toBe('weapp')
    resetPlatform()
    expect(detectPlatform()).toBe('node')
  })

  it('configurePlatform({}) also clears a previous override', () => {
    configurePlatform({ force: 'tauri' })
    configurePlatform({})
    expect(detectPlatform()).toBe('node')
  })
})
