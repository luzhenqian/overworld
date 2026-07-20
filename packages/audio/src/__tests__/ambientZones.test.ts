import { describe, expect, it } from 'vitest'
import { zoneWeight, mixBuses } from '../ambientZones'

const zone = { id: 'z', trackId: 't', center: [0, 0, 0] as [number, number, number], innerRadius: 5, outerRadius: 15 }

describe('ambient zone falloff', () => {
  it('is full volume inside inner radius', () => {
    expect(zoneWeight(zone, [3, 0, 0])).toBe(1)
  })
  it('is silent beyond outer radius', () => {
    expect(zoneWeight(zone, [30, 0, 0])).toBe(0)
  })
  it('falls off linearly between inner and outer', () => {
    expect(zoneWeight(zone, [10, 0, 0])).toBeCloseTo(0.5) // halfway across the 5..15 band
  })
  it('respects maxVolume', () => {
    expect(zoneWeight({ ...zone, maxVolume: 0.4 }, [0, 0, 0])).toBeCloseTo(0.4)
  })
})

describe('mixBuses', () => {
  it('multiplies bus by master', () => {
    expect(mixBuses({ master: 0.5, music: 0.8, ambience: 1, sfx: 1 }, 'music')).toBeCloseTo(0.4)
  })
})
