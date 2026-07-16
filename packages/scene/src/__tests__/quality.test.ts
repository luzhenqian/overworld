import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QUALITY_PRESETS, detectQualityPreset, useQualityStore } from '../quality'

describe('QUALITY_PRESETS', () => {
  it('exposes the documented high/medium/low tiers', () => {
    expect(QUALITY_PRESETS.high).toEqual({
      dpr: [1, 2],
      shadows: true,
      shadowMapSize: 2048,
      particleMultiplier: 1,
    })
    expect(QUALITY_PRESETS.medium).toEqual({
      dpr: [1, 1.5],
      shadows: true,
      shadowMapSize: 1024,
      particleMultiplier: 0.6,
    })
    expect(QUALITY_PRESETS.low).toEqual({
      dpr: [0.75, 1],
      shadows: false,
      shadowMapSize: 512,
      particleMultiplier: 0.3,
    })
  })

  it('tiers degrade monotonically', () => {
    const { high, medium, low } = QUALITY_PRESETS
    expect(high.dpr[1]).toBeGreaterThan(medium.dpr[1])
    expect(medium.dpr[1]).toBeGreaterThan(low.dpr[1])
    expect(high.shadowMapSize).toBeGreaterThan(medium.shadowMapSize)
    expect(medium.shadowMapSize).toBeGreaterThan(low.shadowMapSize)
    expect(high.particleMultiplier).toBeGreaterThan(medium.particleMultiplier)
    expect(medium.particleMultiplier).toBeGreaterThan(low.particleMultiplier)
  })
})

describe('useQualityStore', () => {
  beforeEach(() => {
    useQualityStore.setState({ preset: 'high', settings: { ...QUALITY_PRESETS.high } })
  })

  it('defaults to the high preset', () => {
    const state = useQualityStore.getState()
    expect(state.preset).toBe('high')
    expect(state.settings).toEqual(QUALITY_PRESETS.high)
  })

  it('setPreset replaces settings wholesale', () => {
    useQualityStore.getState().setPreset('low')
    const state = useQualityStore.getState()
    expect(state.preset).toBe('low')
    expect(state.settings).toEqual(QUALITY_PRESETS.low)
  })

  it('setSettings merges a partial override and marks the preset custom', () => {
    useQualityStore.getState().setPreset('medium')
    useQualityStore.getState().setSettings({ particleMultiplier: 0.5 })

    const state = useQualityStore.getState()
    expect(state.preset).toBe('custom')
    expect(state.settings.particleMultiplier).toBe(0.5)
    // Untouched fields keep the medium values.
    expect(state.settings.dpr).toEqual(QUALITY_PRESETS.medium.dpr)
    expect(state.settings.shadows).toBe(QUALITY_PRESETS.medium.shadows)
    expect(state.settings.shadowMapSize).toBe(QUALITY_PRESETS.medium.shadowMapSize)
  })

  it('setSettings never mutates the preset table', () => {
    useQualityStore.getState().setPreset('high')
    useQualityStore.getState().setSettings({ shadows: false, shadowMapSize: 256 })
    expect(QUALITY_PRESETS.high.shadows).toBe(true)
    expect(QUALITY_PRESETS.high.shadowMapSize).toBe(2048)
  })

  it('setPreset after a custom override restores the full preset', () => {
    useQualityStore.getState().setSettings({ dpr: [0.5, 0.5], shadows: false })
    useQualityStore.getState().setPreset('high')

    const state = useQualityStore.getState()
    expect(state.preset).toBe('high')
    expect(state.settings).toEqual(QUALITY_PRESETS.high)
  })
})

describe('detectQualityPreset', () => {
  const stubEnvironment = (
    navigatorStub: Record<string, unknown> | undefined,
    coarsePointer = false
  ): void => {
    vi.stubGlobal('navigator', navigatorStub)
    vi.stubGlobal('window', {
      matchMedia: (query: string) => ({ matches: coarsePointer && query.includes('coarse') }),
    })
  }

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns high outside the browser', () => {
    vi.stubGlobal('navigator', undefined)
    vi.stubGlobal('window', undefined)
    expect(detectQualityPreset()).toBe('high')
  })

  it('returns high for a strong desktop', () => {
    stubEnvironment({
      hardwareConcurrency: 12,
      deviceMemory: 16,
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/125.0',
    })
    expect(detectQualityPreset()).toBe('high')
  })

  it('returns medium for a weak desktop (few cores)', () => {
    stubEnvironment({
      hardwareConcurrency: 4,
      deviceMemory: 16,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/125.0',
    })
    expect(detectQualityPreset()).toBe('medium')
  })

  it('returns medium for a weak desktop (low memory)', () => {
    stubEnvironment({
      hardwareConcurrency: 8,
      deviceMemory: 4,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/125.0',
    })
    expect(detectQualityPreset()).toBe('medium')
  })

  it('returns medium for a strong mobile device (UA hint)', () => {
    stubEnvironment({
      hardwareConcurrency: 8,
      deviceMemory: 8,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148',
    })
    expect(detectQualityPreset()).toBe('medium')
  })

  it('returns medium for a strong device with a coarse pointer', () => {
    stubEnvironment(
      { hardwareConcurrency: 8, deviceMemory: 8, userAgent: 'Mozilla/5.0 (X11; Linux)' },
      true
    )
    expect(detectQualityPreset()).toBe('medium')
  })

  it('returns low for a weak mobile device', () => {
    stubEnvironment({
      hardwareConcurrency: 4,
      deviceMemory: 2,
      userAgent: 'Mozilla/5.0 (Linux; Android 12) Mobile Safari/537.36',
    })
    expect(detectQualityPreset()).toBe('low')
  })

  it('treats missing hardware hints as not-weak', () => {
    // Safari exposes neither deviceMemory nor (on some versions) hardwareConcurrency.
    stubEnvironment({ userAgent: 'Mozilla/5.0 (Macintosh) Safari/605.1.15' })
    expect(detectQualityPreset()).toBe('high')
  })
})
