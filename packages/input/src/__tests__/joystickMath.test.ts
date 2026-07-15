import { describe, expect, it } from 'vitest'
import {
  DEFAULT_DEAD_ZONE,
  DEFAULT_RUN_THRESHOLD,
  computeJoystickVector,
  computeThumbOffset,
  shouldRun,
} from '../joystickMath'

describe('computeJoystickVector', () => {
  it('maps a pointer offset to a proportional vector inside the radius', () => {
    const v = computeJoystickVector(30, -30, 60)

    expect(v.x).toBeCloseTo(0.5)
    expect(v.z).toBeCloseTo(-0.5)
    expect(v.magnitude).toBeCloseTo(Math.hypot(0.5, 0.5))
  })

  it('maps screen-down (positive dy) to world +z, backward', () => {
    const v = computeJoystickVector(0, 60, 60)

    expect(v.x).toBeCloseTo(0)
    expect(v.z).toBeCloseTo(1)
  })

  it('clamps offsets beyond the radius to the unit circle', () => {
    const v = computeJoystickVector(300, 400, 60)

    expect(v.magnitude).toBeCloseTo(1)
    expect(Math.hypot(v.x, v.z)).toBeCloseTo(1)
    // Direction is preserved (3-4-5 triangle).
    expect(v.x).toBeCloseTo(0.6)
    expect(v.z).toBeCloseTo(0.8)
  })

  it('caps magnitude at exactly 1 on the rim', () => {
    const v = computeJoystickVector(60, 0, 60)

    expect(v).toEqual({ x: 1, z: 0, magnitude: 1 })
  })

  it('collapses to zero inside the dead zone', () => {
    const v = computeJoystickVector(5, 3, 60, 0.15)

    expect(v).toEqual({ x: 0, z: 0, magnitude: 0 })
  })

  it('passes through at exactly the dead-zone boundary', () => {
    // magnitude 0.15 is not below the dead zone.
    const v = computeJoystickVector(9, 0, 60, 0.15)

    expect(v.x).toBeCloseTo(0.15)
    expect(v.magnitude).toBeCloseTo(0.15)
  })

  it('uses the default dead zone when none is given', () => {
    const below = computeJoystickVector(60 * (DEFAULT_DEAD_ZONE - 0.01), 0, 60)
    const above = computeJoystickVector(60 * (DEFAULT_DEAD_ZONE + 0.01), 0, 60)

    expect(below.magnitude).toBe(0)
    expect(above.magnitude).toBeGreaterThan(0)
  })

  it('supports a zero dead zone', () => {
    const v = computeJoystickVector(1, 0, 100, 0)

    expect(v.x).toBeCloseTo(0.01)
    expect(v.magnitude).toBeCloseTo(0.01)
  })

  it('returns zero for a zero offset', () => {
    expect(computeJoystickVector(0, 0, 60)).toEqual({ x: 0, z: 0, magnitude: 0 })
  })

  it('returns zero for a non-positive radius', () => {
    expect(computeJoystickVector(10, 10, 0)).toEqual({ x: 0, z: 0, magnitude: 0 })
    expect(computeJoystickVector(10, 10, -5)).toEqual({ x: 0, z: 0, magnitude: 0 })
  })
})

describe('shouldRun', () => {
  it('is false below the threshold and true at/above it', () => {
    expect(shouldRun(0.84, 0.85)).toBe(false)
    expect(shouldRun(0.85, 0.85)).toBe(true)
    expect(shouldRun(1, 0.85)).toBe(true)
  })

  it('uses the default run threshold when none is given', () => {
    expect(shouldRun(DEFAULT_RUN_THRESHOLD - 0.01)).toBe(false)
    expect(shouldRun(DEFAULT_RUN_THRESHOLD)).toBe(true)
  })

  it('never runs at zero magnitude, even with a zero threshold', () => {
    expect(shouldRun(0, 0)).toBe(false)
  })
})

describe('computeThumbOffset', () => {
  it('passes offsets within range through unchanged', () => {
    expect(computeThumbOffset(10, -20, 60)).toEqual({ x: 10, y: -20 })
  })

  it('clamps longer offsets to maxDistance, preserving direction', () => {
    const offset = computeThumbOffset(300, 400, 60)

    expect(Math.hypot(offset.x, offset.y)).toBeCloseTo(60)
    expect(offset.x).toBeCloseTo(36)
    expect(offset.y).toBeCloseTo(48)
  })

  it('returns zero for a non-positive maxDistance', () => {
    expect(computeThumbOffset(10, 10, 0)).toEqual({ x: 0, y: 0 })
  })
})
