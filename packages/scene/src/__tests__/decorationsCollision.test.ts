import { describe, expect, it } from 'vitest'
import { collidersForSets } from '../decorationInstancing'
import type { DecorationSet } from '../decorationInstancing'

const sets: DecorationSet[] = [
  { id: 'lamp', modelPath: 'lamp.glb', instances: [{ position: [1, 0, 2] }, { position: [3, 0, 4] }], collision: { radius: 0.5 } },
  { id: 'grass', modelPath: 'g.glb', instances: [{ position: [0, 0, 0] }] }, // no collision
]

describe('collidersForSets', () => {
  it('flattens colliders across all sets that declare collision', () => {
    const colliders = collidersForSets(sets)
    expect(colliders.map((c) => c.id)).toEqual(['decoration-lamp-0', 'decoration-lamp-1'])
    expect(colliders.every((c) => c.type === 'decoration')).toBe(true)
  })

  it('returns an empty list when no set declares collision', () => {
    expect(collidersForSets([{ id: 'g', modelPath: 'g.glb', instances: [{ position: [0, 0, 0] }] }])).toEqual([])
  })
})
