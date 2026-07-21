import { describe, expect, test } from 'vitest'
import { highlightBox } from '../highlightBox'

describe('highlightBox', () => {
  test('pads the target rect on all sides', () => {
    expect(highlightBox({ x: 100, y: 50, width: 40, height: 20 }, 6)).toEqual({
      left: 94,
      top: 44,
      width: 52,
      height: 32,
    })
  })

  test('default padding is 6', () => {
    expect(highlightBox({ x: 10, y: 10, width: 10, height: 10 }).width).toBe(22)
  })
})
