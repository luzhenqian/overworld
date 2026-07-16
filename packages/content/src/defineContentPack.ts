import type { ContentPack } from './types'

/**
 * Identity helper that anchors type inference for a {@link ContentPack} literal.
 *
 * Wrapping a pack literal in `defineContentPack` gives editor autocomplete and
 * type-checking on the section shapes without widening the value (it returns
 * the exact object passed in, unchanged). Purely a compile-time convenience —
 * no runtime cost, no cloning.
 *
 * ```ts
 * export const townPack = defineContentPack({
 *   id: 'town',
 *   version: 1,
 *   quests: [{ id: 'welcome', objectives: [{ id: 'talk', target: 1 }] }],
 * })
 * ```
 */
export function defineContentPack<T extends ContentPack>(pack: T): T {
  return pack
}
