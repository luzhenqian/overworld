import { describe, expect, it } from 'vitest'
import {
  instanceMatrix,
  decorationColliders,
  setCentroid,
  selectDecorationModel,
  type DecorationSet,
} from '../decorationInstancing'

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

const lodSet: DecorationSet = {
  id: 'lamps',
  modelPath: 'lamp_hi.glb',
  instances: [
    { position: [0, 0, 0] },
    { position: [10, 0, 0] },
    { position: [0, 0, 10] },
  ],
  lod: [
    { distance: 30, modelPath: 'lamp_mid.glb' },
    { distance: 80, modelPath: 'lamp_lo.glb' },
  ],
}

describe('setCentroid', () => {
  it('averages instance X/Z positions', () => {
    expect(setCentroid(lodSet)).toEqual({ x: 10 / 3, z: 10 / 3 })
  })
})

describe('selectDecorationModel', () => {
  it('renders the base model when the player is near the centroid', () => {
    expect(selectDecorationModel(lodSet, { x: 3, z: 3 }).modelPath).toBe('lamp_hi.glb')
  })
  it('switches to a farther LOD model with distance', () => {
    expect(selectDecorationModel(lodSet, { x: 500, z: 500 }).modelPath).toBe('lamp_lo.glb')
  })
  it('returns the base model when no lod is configured', () => {
    const plain: DecorationSet = { id: 'x', modelPath: 'x.glb', instances: [{ position: [0, 0, 0] }] }
    expect(selectDecorationModel(plain, { x: 999, z: 999 }).modelPath).toBe('x.glb')
  })
  it('caps to deviceCap index for low-tier devices even when near the centroid', () => {
    expect(selectDecorationModel(lodSet, { x: 3, z: 3 }, 0, 1).index).toBe(1)
  })
})
