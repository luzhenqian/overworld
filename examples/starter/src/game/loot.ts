import type { RngSource } from '@overworld-engine/core'

/** One weighted entry in a loot table (game content). */
export interface LootEntry {
  id: string
  weight: number
}

export interface LootTable {
  /** Roll once, returning the id of the entry drawn (weighted by `weight`). */
  roll(): string
}

/**
 * A tiny weighted-random picker — deliberately generic (not a battle
 * system), used to demonstrate the "constructed without a required
 * dependency, crashes the first time it's used" failure class the test-kit
 * is meant to catch. `options.rng` is optional at the type level on
 * purpose: the real incident this mirrors wasn't a TypeScript compile
 * error, it was a runtime crash from an implicitly-omitted dependency.
 */
export function createLootTable(pool: LootEntry[], options?: { rng?: RngSource }): LootTable {
  return {
    roll(): string {
      if (!options?.rng) {
        throw new Error('[loot] createLootTable: missing rng — pass { rng } at construction time')
      }
      const total = pool.reduce((sum, entry) => sum + entry.weight, 0)
      let r = options.rng.next() * total
      for (const entry of pool) {
        r -= entry.weight
        if (r < 0) return entry.id
      }
      return pool[pool.length - 1]!.id
    },
  }
}
