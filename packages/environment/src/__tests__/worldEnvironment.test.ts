import { describe, expect, it } from 'vitest'
import {
  WORLD_ENV_PRESETS,
  resolvePreset,
  resolveLight,
  lerpColor,
  resolveExposure,
} from '../worldEnvironment'

describe('WorldEnvironment presets', () => {
  it('ships the four named presets', () => {
    expect(Object.keys(WORLD_ENV_PRESETS).sort()).toEqual([
      'clear-noon',
      'foggy-dusk',
      'night',
      'overcast',
    ])
  })

  it('resolvePreset accepts a name', () => {
    expect(resolvePreset('night')).toBe(WORLD_ENV_PRESETS.night)
  })

  it('resolvePreset accepts a custom object unchanged', () => {
    const custom = { fog: { color: '#000', near: 1, far: 2 } }
    expect(resolvePreset(custom)).toBe(custom)
  })

  it('resolveLight lerps ambient intensity between night and day by daylight factor', () => {
    const preset = {
      lighting: {
        ambient: { day: { color: '#fff', intensity: 1 }, night: { color: '#001', intensity: 0.1 } },
      },
    }
    const atDay = resolveLight(preset, 1)
    const atNight = resolveLight(preset, 0)
    expect(atDay.ambient.intensity).toBeCloseTo(1)
    expect(atNight.ambient.intensity).toBeCloseTo(0.1)
    expect(resolveLight(preset, 0.5).ambient.intensity).toBeCloseTo(0.55)
  })
})

describe('lerpColor', () => {
  it('returns endpoints at t=0 and t=1', () => {
    expect(lerpColor('#000000', '#ffffff', 0)).toBe('#000000')
    expect(lerpColor('#000000', '#ffffff', 1)).toBe('#ffffff')
  })
  it('interpolates the midpoint', () => {
    expect(lerpColor('#000000', '#ffffff', 0.5)).toBe('#808080')
  })
})

describe('resolveExposure', () => {
  it('defaults to 1 when no exposure set', () => {
    expect(resolveExposure({ lighting: { ambient: undefined, sun: undefined } } as any, 1)).toBe(1)
  })
  it('interpolates a day/night exposure by daylight', () => {
    const preset = { exposure: { day: 1.2, night: 0.6 } } as any
    expect(resolveExposure(preset, 1)).toBeCloseTo(1.2)
    expect(resolveExposure(preset, 0)).toBeCloseTo(0.6)
    expect(resolveExposure(preset, 0.5)).toBeCloseTo(0.9)
  })
  it('accepts a scalar exposure', () => {
    expect(resolveExposure({ exposure: 1.5 } as any, 0.3)).toBe(1.5)
  })
})

describe('resolveLight color interpolation', () => {
  it('interpolates sun color across daylight instead of hard-switching at 0.5', () => {
    const preset = {
      lighting: {
        sun: { day: { color: '#ffffff', intensity: 1 }, night: { color: '#000000', intensity: 0 } },
      },
    } as any
    // At exactly 0.5 the color must be the blend, not either endpoint.
    expect(resolveLight(preset, 0.5).sun.color).toBe('#808080')
  })
})
