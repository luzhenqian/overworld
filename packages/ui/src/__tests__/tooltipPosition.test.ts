import { describe, expect, test } from 'vitest'
import { positionTooltip } from '../tooltipPosition'

const viewport = { width: 800, height: 600 }

describe('positionTooltip', () => {
  test('prefers centered above the anchor', () => {
    const p = positionTooltip({ x: 400, y: 300, width: 40, height: 40 }, { width: 100, height: 50 }, viewport, 8)
    expect(p).toEqual({ x: 370, y: 242, placement: 'above' })
  })

  test('flips below when clipped at the top', () => {
    const p = positionTooltip({ x: 400, y: 20, width: 40, height: 40 }, { width: 100, height: 50 }, viewport, 8)
    expect(p.placement).toBe('below')
    expect(p.y).toBe(68)
  })

  test('clamps x to the viewport with 4px margin', () => {
    const left = positionTooltip({ x: 0, y: 300, width: 20, height: 20 }, { width: 100, height: 40 }, viewport)
    expect(left.x).toBe(4)
    const right = positionTooltip({ x: 790, y: 300, width: 20, height: 20 }, { width: 100, height: 40 }, viewport)
    expect(right.x).toBe(800 - 100 - 4)
  })
})
