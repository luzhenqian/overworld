/**
 * Save-migration toolkit. Pairs with {@link persistOptions}'s `version` /
 * `migrate` so an engine's persisted state can evolve across releases without
 * breaking existing saves.
 *
 * zustand's `persist` middleware calls `migrate(persistedState, fromVersion)`
 * exactly once during rehydration, where `fromVersion` is the version stamped
 * into the stored payload. {@link defineMigrations} turns a map of per-version
 * upgrade steps into that `migrate` function: it runs every step whose key is
 * greater than `fromVersion`, in ascending numeric order, threading the state
 * through each. Steps at or below `fromVersion` are skipped (already applied).
 *
 * Keys are the **target** version each step produces — a step keyed `2` upgrades
 * a v1 payload to v2. Keep them in sync with the `version` you pass to
 * `persistOptions`.
 *
 * ```ts
 * import { create } from 'zustand'
 * import { persist } from 'zustand/middleware'
 * import { defineMigrations, persistOptions } from '@overworld-engine/core'
 *
 * const migrate = defineMigrations({
 *   1: (state) => ({ ...state, gold: state.coins ?? 0 }), // v0 → v1: rename coins → gold
 *   2: (state) => ({ ...state, gold: Number(state.gold) }), // v1 → v2: coerce to number
 * })
 *
 * const useStore = create<State>()(
 *   persist(initializer, persistOptions({ name: 'wallet', version: 2, migrate }))
 * )
 * ```
 *
 * A save stamped v0 runs steps `1` then `2`; a save already at v1 runs only
 * `2`; a save at v2 runs nothing (identity passthrough). Keys need not be
 * contiguous — `{ 2, 5 }` on a v0 save runs `2` then `5`.
 */

/**
 * One migration step: transforms the persisted state from the previous version
 * to the version it is keyed under. Kept intentionally loose (`any`) because
 * the persisted shape changes across versions and is untyped at rest — narrow
 * inside the step body as needed.
 */
export type Migration = (state: any) => any

/**
 * Build a zustand-`persist`-compatible `migrate(persistedState, fromVersion)`
 * from a map of per-version upgrade steps. Pure: the returned function has no
 * side effects and never mutates its input (each step decides that).
 *
 * @param migrations Map of *target version* → upgrade step. A step keyed `n`
 *   upgrades a payload from version `n - 1` (or any version `< n`) toward `n`.
 * @returns A `migrate` function that applies every step whose key is greater
 *   than `fromVersion`, in ascending numeric order, and returns the final
 *   state. Directly assignable to `persistOptions({ migrate })`.
 */
export function defineMigrations(
  migrations: Record<number, (state: any) => any>
): (persistedState: unknown, fromVersion: number) => any {
  // Snapshot the steps once, sorted ascending — Object key order is not
  // guaranteed to be numeric-ascending for all key sets, so sort explicitly.
  const steps = Object.keys(migrations)
    .map((key) => Number(key))
    .sort((a, b) => a - b)
    .map((version) => ({ version, run: migrations[version]! }))

  return (persistedState: unknown, fromVersion: number) => {
    let state: unknown = persistedState
    for (const step of steps) {
      if (step.version > fromVersion) {
        state = step.run(state)
      }
    }
    return state
  }
}
