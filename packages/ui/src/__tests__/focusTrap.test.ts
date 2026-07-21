import { describe, expect, test } from 'vitest'
import { FOCUSABLE_SELECTOR, nextTrapIndex } from '../focusTrap'

describe('nextTrapIndex', () => {
  test('advances forward and wraps at the end', () => {
    expect(nextTrapIndex(3, 0, true)).toBe(1)
    expect(nextTrapIndex(3, 2, true)).toBe(0)
  })
  test('goes backward and wraps at the start', () => {
    expect(nextTrapIndex(3, 0, false)).toBe(2)
    expect(nextTrapIndex(3, 1, false)).toBe(0)
  })
  test('current not in set (-1) starts at first (forward) or last (backward)', () => {
    expect(nextTrapIndex(3, -1, true)).toBe(0)
    expect(nextTrapIndex(3, -1, false)).toBe(2)
  })
  test('empty set returns -1', () => {
    expect(nextTrapIndex(0, 0, true)).toBe(-1)
    expect(nextTrapIndex(0, -1, false)).toBe(-1)
  })
})

describe('FOCUSABLE_SELECTOR', () => {
  test('includes enabled buttons and excludes tabindex="-1"', () => {
    expect(FOCUSABLE_SELECTOR).toContain('button:not([disabled])')
    expect(FOCUSABLE_SELECTOR).toContain('[tabindex]:not([tabindex="-1"])')
  })
})
