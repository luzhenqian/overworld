import { describe, expect, test } from 'vitest'
import { edgeAnchor } from '../edgeAnchor'

describe('edgeAnchor', () => {
  test('cardinal bearings anchor to the middle of each edge (inset 0.06)', () => {
    const up = edgeAnchor(0)
    expect(up.xPct).toBeCloseTo(0.5)
    expect(up.yPct).toBeCloseTo(0.06)
    expect(up.rotationDeg).toBeCloseTo(0)

    const right = edgeAnchor(Math.PI / 2)
    expect(right.xPct).toBeCloseTo(0.94)
    expect(right.yPct).toBeCloseTo(0.5)
    expect(right.rotationDeg).toBeCloseTo(90)

    const down = edgeAnchor(Math.PI)
    expect(down.xPct).toBeCloseTo(0.5)
    expect(down.yPct).toBeCloseTo(0.94)

    const left = edgeAnchor(-Math.PI / 2)
    expect(left.xPct).toBeCloseTo(0.06)
    expect(left.yPct).toBeCloseTo(0.5)
    expect(left.rotationDeg).toBeCloseTo(-90)
  })

  test('a diagonal bearing clamps toward a corner', () => {
    const tr = edgeAnchor(Math.PI / 4)
    expect(tr.xPct).toBeCloseTo(0.94)
    expect(tr.yPct).toBeCloseTo(0.06)
    expect(tr.rotationDeg).toBeCloseTo(45)
  })

  test('inset option controls the margin', () => {
    const up = edgeAnchor(0, { inset: 0.1 })
    expect(up.yPct).toBeCloseTo(0.1)
  })
})
