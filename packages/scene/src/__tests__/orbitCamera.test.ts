import { describe, expect, it } from 'vitest'
import { applyOrbitDelta, orbitToOffset } from '../orbitCamera'

const limits = { minDistance: 5, maxDistance: 40, minPitch: 0.1, maxPitch: 1.4 }

describe('orbit camera', () => {
  it('clamps distance within limits', () => {
    const s = { distance: 20, yaw: 0, pitch: 0.5 }
    expect(applyOrbitDelta(s, { dYaw: 0, dPitch: 0, dZoom: -100 }, limits).distance).toBe(5)
    expect(applyOrbitDelta(s, { dYaw: 0, dPitch: 0, dZoom: 100 }, limits).distance).toBe(40)
  })
  it('clamps pitch within limits', () => {
    const s = { distance: 20, yaw: 0, pitch: 0.5 }
    expect(applyOrbitDelta(s, { dYaw: 0, dPitch: -5, dZoom: 0 }, limits).pitch).toBeCloseTo(0.1)
    expect(applyOrbitDelta(s, { dYaw: 0, dPitch: 5, dZoom: 0 }, limits).pitch).toBeCloseTo(1.4)
  })
  it('converts orbit state to a camera offset', () => {
    const offset = orbitToOffset({ distance: 10, yaw: 0, pitch: 0 })
    // yaw 0, pitch 0 → directly behind on +Z, at ground height
    expect(offset[2]).toBeCloseTo(10)
    expect(offset[1]).toBeCloseTo(0)
  })
})
