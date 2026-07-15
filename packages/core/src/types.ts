/** Shared primitive types used across Overworld packages. */

/** Position or rotation tuple on the X/Y/Z axes. */
export type Vec3 = [number, number, number]

/** The kinds of world entities the framework knows about. */
export type EntityKind = 'npc' | 'building' | 'item' | 'decoration'

/** A reference to a world entity. */
export interface EntityRef {
  kind: EntityKind
  id: string
}
