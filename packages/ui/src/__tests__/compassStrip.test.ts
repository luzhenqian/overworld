import { describe, expect, test } from 'vitest'
import { compassOffset, compassTicks, normalizeAngle } from '../compassStrip'

describe('normalizeAngle', () => {
  test('wraps into (-PI, PI]', () => {
    expect(normalizeAngle(0)).toBeCloseTo(0)
    expect(normalizeAngle(Math.PI)).toBeCloseTo(Math.PI)
    expect(normalizeAngle(-Math.PI)).toBeCloseTo(Math.PI)
    expect(normalizeAngle(1.5 * Math.PI)).toBeCloseTo(-0.5 * Math.PI)
    expect(normalizeAngle(-6)).toBeCloseTo(2 * Math.PI - 6)
  })
})

describe('compassOffset', () => {
  test('bearing straight ahead is centered', () => {
    expect(compassOffset(0, 0, Math.PI)).toBeCloseTo(0.5)
    expect(compassOffset(Math.PI / 2, Math.PI / 2, Math.PI)).toBeCloseTo(0.5)
  })
  test('right/left edges of the fov map to 1 and 0', () => {
    expect(compassOffset(Math.PI / 2, 0, Math.PI)).toBeCloseTo(1)
    expect(compassOffset(-Math.PI / 2, 0, Math.PI)).toBeCloseTo(0)
  })
  test('outside the fov returns null', () => {
    expect(compassOffset(Math.PI, 0, Math.PI)).toBeNull()
  })
  test('handles ±PI wraparound (near-opposite raw values are actually close)', () => {
    const off = compassOffset(-3.0, 3.0, Math.PI)
    expect(off).not.toBeNull()
    expect(off!).toBeCloseTo(0.5 + normalizeAngle(-3.0 - 3.0) / Math.PI)
  })
})

describe('compassTicks', () => {
  test('returns only visible cardinal/intercardinal ticks, left-to-right, with major flags', () => {
    const ticks = compassTicks(0, Math.PI)
    expect(ticks.map((t) => t.label)).toEqual(['W', 'NW', 'N', 'NE', 'E'])
    expect(ticks.map((t) => Number(t.offset.toFixed(2)))).toEqual([0, 0.25, 0.5, 0.75, 1])
    expect(ticks.filter((t) => t.major).map((t) => t.label)).toEqual(['W', 'N', 'E'])
  })
})
