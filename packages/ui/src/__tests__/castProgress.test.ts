import { describe, expect, test } from 'vitest'
import { castProgress } from '../castProgress'

describe('castProgress', () => {
  test('normal cast fills proportionally and reports remaining', () => {
    expect(castProgress(1, 4)).toEqual({ fillPct: 25, remainingSeconds: 3 })
  })

  test('channel inverts the fill (drains from full) but remaining is unchanged', () => {
    expect(castProgress(1, 4, { channel: true })).toEqual({ fillPct: 75, remainingSeconds: 3 })
  })

  test('clamps overshoot to 100% fill / 0 remaining', () => {
    expect(castProgress(5, 4)).toEqual({ fillPct: 100, remainingSeconds: 0 })
  })

  test('clamps negative value to 0% fill', () => {
    expect(castProgress(-2, 4).fillPct).toBe(0)
  })

  test('max <= 0 is a safe zero', () => {
    expect(castProgress(1, 0)).toEqual({ fillPct: 0, remainingSeconds: 0 })
  })
})
