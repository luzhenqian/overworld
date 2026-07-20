import { describe, expect, it } from 'vitest'
import {
  WORLD_ENV_PRESETS,
  resolvePreset,
  resolveLight,
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
