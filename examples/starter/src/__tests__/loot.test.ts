import { createSeededRng } from '@overworld-engine/core'
import { describe, expect, it } from 'vitest'
import { createLootTable } from '../game/loot'

describe('createLootTable', () => {
  it('throws when constructed without an rng — the exact failure mode this proves the harness catches', () => {
    const table = createLootTable([{ id: 'a', weight: 1 }])
    expect(() => table.roll()).toThrow(/missing rng/)
  })

  it('is deterministic for a given seed', () => {
    const pool = [
      { id: 'a', weight: 1 },
      { id: 'b', weight: 1 },
    ]
    const rollsWith = (seed: number) => {
      const table = createLootTable(pool, { rng: createSeededRng(seed) })
      return [table.roll(), table.roll(), table.roll(), table.roll(), table.roll()]
    }
    expect(rollsWith(42)).toEqual(rollsWith(42))
  })

  it('only returns ids present in the pool', () => {
    const pool = [
      { id: 'a', weight: 1 },
      { id: 'b', weight: 3 },
    ]
    const table = createLootTable(pool, { rng: createSeededRng(7) })
    for (let i = 0; i < 30; i++) {
      expect(['a', 'b']).toContain(table.roll())
    }
  })
})
