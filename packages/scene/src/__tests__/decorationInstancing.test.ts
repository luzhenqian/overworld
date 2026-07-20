import { describe, expect, it } from 'vitest'
import { instanceMatrix, decorationColliders, type DecorationSet } from '../decorationInstancing'

describe('decoration instancing', () => {
  it('builds a matrix with position, rotation, and scale', () => {
    const m = instanceMatrix({ position: [3, 0, 4], rotation: [0, 1, 0], scale: 2 })
    const p = m.elements
    expect(p[12]).toBeCloseTo(3) // translation x
    expect(p[14]).toBeCloseTo(4) // translation z
  })

  it('derives colliders from instances when collision is set', () => {
    const set: DecorationSet = {
      id: 'lamp',
      modelPath: 'lamp.glb',
      instances: [{ position: [1, 0, 2] }, { position: [3, 0, 4] }],
      collision: { radius: 0.5 },
    }
    const colliders = decorationColliders(set)
    expect(colliders).toHaveLength(2)
    expect(colliders[0]!.id).toBe('decoration-lamp-0')
    expect(colliders[0]!.radius).toBe(0.5)
    expect(colliders[0]!.type).toBe('decoration')
  })

  it('derives no colliders without a collision spec', () => {
    const set: DecorationSet = { id: 'grass', modelPath: 'g.glb', instances: [{ position: [0, 0, 0] }] }
    expect(decorationColliders(set)).toHaveLength(0)
  })
})
