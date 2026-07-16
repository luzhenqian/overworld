import { describe, expect, it } from 'vitest'
import {
  npcVisualHeights,
  buildingVisualHeights,
  DEFAULT_NPC_SCALE,
  DEFAULT_BUILDING_SCALE,
} from '../visualHeights'

describe('npcVisualHeights', () => {
  it('reproduces the historical constants at the default scale (2.5)', () => {
    const h = npcVisualHeights(DEFAULT_NPC_SCALE)
    expect(h.fallbackScale).toBe(1)
    expect(h.labelY).toBeCloseTo(4.2)
    expect(h.indicatorY).toBeCloseTo(5)
    expect(h.glowY).toBeCloseTo(3)
    expect(h.bubbleY).toBeCloseTo(5.5)
  })

  it('defaults to the default NPC scale when scale is omitted', () => {
    expect(npcVisualHeights()).toEqual(npcVisualHeights(DEFAULT_NPC_SCALE))
  })

  it('scales everything proportionally for smaller scales', () => {
    const h = npcVisualHeights(1.25) // half the default
    expect(h.fallbackScale).toBeCloseTo(0.5)
    expect(h.labelY).toBeCloseTo(2.1)
    expect(h.indicatorY).toBeCloseTo(2.5)
    expect(h.glowY).toBeCloseTo(1.5)
    expect(h.bubbleY).toBeCloseTo(2.75)
  })

  it('scales everything proportionally for larger scales', () => {
    const h = npcVisualHeights(5) // double the default
    expect(h.fallbackScale).toBeCloseTo(2)
    expect(h.labelY).toBeCloseTo(8.4)
    expect(h.indicatorY).toBeCloseTo(10)
    expect(h.bubbleY).toBeCloseTo(11)
  })

  it('labelHeight overrides the label Y and lifts indicator/bubble with it', () => {
    const h = npcVisualHeights(DEFAULT_NPC_SCALE, 6)
    expect(h.labelY).toBe(6)
    expect(h.indicatorY).toBeCloseTo(6.8) // label + 0.8 * factor
    expect(h.bubbleY).toBeCloseTo(7.3) // label + 1.3 * factor
    expect(h.glowY).toBeCloseTo(3) // glow stays scale-proportional
    expect(h.fallbackScale).toBe(1)
  })
})

describe('buildingVisualHeights', () => {
  it('reproduces the historical constants at the reference scale (1)', () => {
    const h = buildingVisualHeights(DEFAULT_BUILDING_SCALE)
    expect(h.fallbackScale).toBe(1)
    expect(h.labelY).toBeCloseTo(6)
    expect(h.glowY).toBeCloseTo(4)
    expect(h.bubbleY).toBeCloseTo(7.5)
  })

  it('defaults to the reference building scale when scale is omitted', () => {
    expect(buildingVisualHeights()).toEqual(buildingVisualHeights(DEFAULT_BUILDING_SCALE))
  })

  it('scales everything proportionally with scale', () => {
    const h = buildingVisualHeights(2)
    expect(h.fallbackScale).toBe(2)
    expect(h.labelY).toBeCloseTo(12)
    expect(h.glowY).toBeCloseTo(8)
    expect(h.bubbleY).toBeCloseTo(15)
  })

  it('labelHeight overrides the label Y and lifts the bubble with it', () => {
    const h = buildingVisualHeights(2, 9)
    expect(h.labelY).toBe(9)
    expect(h.bubbleY).toBeCloseTo(12) // label + 1.5 * factor
    expect(h.glowY).toBeCloseTo(8)
    expect(h.fallbackScale).toBe(2)
  })
})
