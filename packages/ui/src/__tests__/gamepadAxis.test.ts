import { describe, expect, test } from 'vitest'
import { axisToDirection } from '../gamepadAxis'

describe('axisToDirection', () => {
  test('inside the dead zone is null', () => {
    expect(axisToDirection(0, 0)).toBeNull()
    expect(axisToDirection(0.4, -0.4)).toBeNull()
  })
  test('cardinal pushes map to directions (screen y down = down)', () => {
    expect(axisToDirection(0.8, 0)).toBe('right')
    expect(axisToDirection(-0.8, 0)).toBe('left')
    expect(axisToDirection(0, 0.8)).toBe('down')
    expect(axisToDirection(0, -0.8)).toBe('up')
  })
  test('dominant axis wins; ties resolve horizontally', () => {
    expect(axisToDirection(0.9, 0.6)).toBe('right')
    expect(axisToDirection(0.6, 0.9)).toBe('down')
    expect(axisToDirection(0.7, 0.7)).toBe('right')
  })
  test('respects a custom dead zone', () => {
    expect(axisToDirection(0.3, 0, 0.2)).toBe('right')
    expect(axisToDirection(0.3, 0, 0.5)).toBeNull()
  })
})
