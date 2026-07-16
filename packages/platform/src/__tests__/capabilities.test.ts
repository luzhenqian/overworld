import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getCapabilities,
  recommendedQualityPreset,
  shouldShowTouchControls,
} from '../capabilities'
import { configurePlatform, resetPlatform } from '../detection'

/** Stub a desktop-strength browser (fine pointer, desktop UA, big hardware). */
function stubDesktop(windowExtras: Record<string, unknown> = {}): void {
  vi.stubGlobal('window', {
    matchMedia: () => ({ matches: false }),
    ...windowExtras,
  })
  vi.stubGlobal('navigator', {
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
    maxTouchPoints: 0,
    hardwareConcurrency: 16,
    deviceMemory: 16,
  })
  vi.stubGlobal('document', {})
  vi.stubGlobal('localStorage', {})
  vi.stubGlobal('WebGLRenderingContext', function WebGLRenderingContext() {})
}

/** Stub a strong phone (coarse pointer, mobile UA, touch). */
function stubMobile(windowExtras: Record<string, unknown> = {}): void {
  vi.stubGlobal('window', {
    matchMedia: (query: string) => ({ matches: query.includes('coarse') }),
    ontouchstart: null,
    ...windowExtras,
  })
  vi.stubGlobal('navigator', {
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
    maxTouchPoints: 5,
    hardwareConcurrency: 8,
    deviceMemory: 8,
  })
  vi.stubGlobal('document', {})
  vi.stubGlobal('localStorage', {})
  vi.stubGlobal('WebGLRenderingContext', function WebGLRenderingContext() {})
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  resetPlatform()
})

describe('getCapabilities', () => {
  it('node: nothing available, memory storage', () => {
    vi.stubGlobal('navigator', undefined)
    expect(getCapabilities()).toEqual({
      kind: 'node',
      hasDOM: false,
      hasWebGL: false,
      hasTouch: false,
      hasKeyboard: false,
      persistentStorage: 'memory',
    })
  })

  it('weapp: no DOM, WebGL + touch, wx storage', () => {
    vi.stubGlobal('wx', { getSystemInfoSync: () => ({}) })
    expect(getCapabilities()).toEqual({
      kind: 'weapp',
      hasDOM: false,
      hasWebGL: true,
      hasTouch: true,
      hasKeyboard: false,
      persistentStorage: 'wx',
    })
  })

  it('desktop web: DOM + WebGL + keyboard, no touch, localStorage', () => {
    stubDesktop()
    expect(getCapabilities()).toEqual({
      kind: 'web',
      hasDOM: true,
      hasWebGL: true,
      hasTouch: false,
      hasKeyboard: true,
      persistentStorage: 'localStorage',
    })
  })

  it('mobile web: touch without keyboard', () => {
    stubMobile()
    const caps = getCapabilities()
    expect(caps.kind).toBe('web')
    expect(caps.hasTouch).toBe(true)
    expect(caps.hasKeyboard).toBe(false)
  })

  it('capacitor: always touch, never keyboard-first', () => {
    stubDesktop({ Capacitor: {} })
    const caps = getCapabilities()
    expect(caps.kind).toBe('capacitor')
    expect(caps.hasTouch).toBe(true)
    expect(caps.hasKeyboard).toBe(false)
  })

  it('tauri: always keyboard (desktop shell)', () => {
    stubMobile({ __TAURI_INTERNALS__: {} })
    const caps = getCapabilities()
    expect(caps.kind).toBe('tauri')
    expect(caps.hasKeyboard).toBe(true)
  })

  it('telegram on a phone: touch, no keyboard', () => {
    stubMobile({ Telegram: { WebApp: { initData: 'query_id=1' } } })
    const caps = getCapabilities()
    expect(caps.kind).toBe('telegram')
    expect(caps.hasTouch).toBe(true)
    expect(caps.hasKeyboard).toBe(false)
  })

  it('falls back to memory storage when localStorage is unavailable', () => {
    stubDesktop()
    vi.stubGlobal('localStorage', undefined)
    expect(getCapabilities().persistentStorage).toBe('memory')
  })
})

describe('shouldShowTouchControls', () => {
  it('false on desktop web (keyboard present)', () => {
    stubDesktop()
    expect(shouldShowTouchControls()).toBe(false)
  })

  it('true on mobile web (touch, no keyboard)', () => {
    stubMobile()
    expect(shouldShowTouchControls()).toBe(true)
  })

  it('true on capacitor and weapp, false in node', () => {
    stubDesktop({ Capacitor: {} })
    expect(shouldShowTouchControls()).toBe(true)
    vi.unstubAllGlobals()

    vi.stubGlobal('wx', { getSystemInfoSync: () => ({}) })
    expect(shouldShowTouchControls()).toBe(true)
    vi.unstubAllGlobals()

    vi.stubGlobal('navigator', undefined)
    expect(shouldShowTouchControls()).toBe(false)
  })
})

describe('recommendedQualityPreset', () => {
  it('strong desktop web → high', () => {
    stubDesktop()
    expect(recommendedQualityPreset()).toBe('high')
  })

  it('strong hardware inside telegram is capped at medium', () => {
    stubDesktop({ Telegram: { WebApp: { initData: 'query_id=1' } } })
    expect(recommendedQualityPreset()).toBe('medium')
  })

  it('strong hardware inside capacitor is capped at medium', () => {
    stubDesktop({ Capacitor: {} })
    expect(recommendedQualityPreset()).toBe('medium')
  })

  it('weapp is capped at medium', () => {
    stubDesktop()
    vi.stubGlobal('wx', { getSystemInfoSync: () => ({}) })
    expect(recommendedQualityPreset()).toBe('medium')
  })

  it('weak mobile web → low (heuristic below the cap is untouched)', () => {
    stubMobile()
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (Linux; Android 10) Mobile',
      maxTouchPoints: 5,
      hardwareConcurrency: 4,
      deviceMemory: 2,
    })
    expect(recommendedQualityPreset()).toBe('low')
  })

  it('weak mobile telegram stays low (cap never raises)', () => {
    stubMobile({ Telegram: { WebApp: { initData: 'query_id=1' } } })
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (Linux; Android 10) Mobile',
      maxTouchPoints: 5,
      hardwareConcurrency: 2,
    })
    expect(recommendedQualityPreset()).toBe('low')
  })

  it('weak desktop → medium; tauri is not capped', () => {
    stubDesktop({ __TAURI_INTERNALS__: {} })
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (Macintosh)',
      maxTouchPoints: 0,
      hardwareConcurrency: 4,
    })
    expect(recommendedQualityPreset()).toBe('medium')
  })

  it('no navigator → high (SSR-safe default)', () => {
    vi.stubGlobal('navigator', undefined)
    configurePlatform({ force: 'node' })
    expect(recommendedQualityPreset()).toBe('high')
  })
})
