import { describe, expect, test } from 'vitest'
import { advanceReveal } from '../typewriterLogic'

describe('advanceReveal', () => {
  test('advances by step and clamps at length', () => {
    expect(advanceReveal(0, 5)).toEqual({ revealed: 1, done: false })
    expect(advanceReveal(4, 5)).toEqual({ revealed: 5, done: true })
    expect(advanceReveal(4, 5, 3)).toEqual({ revealed: 5, done: true })
  })

  test('empty text is immediately done', () => {
    expect(advanceReveal(0, 0)).toEqual({ revealed: 0, done: true })
  })

  test('already-complete stays done', () => {
    expect(advanceReveal(5, 5)).toEqual({ revealed: 5, done: true })
  })
})
