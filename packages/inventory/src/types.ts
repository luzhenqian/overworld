import type { EffectRef } from '@overworld-engine/core'
import type { StateStorage } from 'zustand/middleware'

/**
 * Static definition of an item. Definitions are content: they are injected
 * via `createInventory({ items })` or `registerItems()`, never hardcoded in
 * the framework. `name`/`description` are opaque strings — plain text or
 * i18n keys, the framework never interprets them.
 */
export interface ItemDefinition {
  id: string
  /** Display name (opaque: plain text or i18n key). */
  name: string
  /** Description (opaque: plain text or i18n key). */
  description?: string
  /** Icon hint for the UI (emoji, sprite id, URL — opaque). */
  icon?: string
  /** Free-form grouping key (e.g. 'consumable', 'material'). */
  category?: string
  /**
   * Whether multiple copies share a slot.
   * @default true
   */
  stackable?: boolean
  /**
   * Maximum quantity per slot. Defaults to unlimited for stackable items
   * and is always 1 for non-stackable items.
   */
  maxStack?: number
  /** Effects executed by `use()` through the effect registry. */
  useEffects?: EffectRef[]
  /**
   * Whether `use()` removes one copy from the inventory.
   * @default false
   */
  consumable?: boolean
  /** Arbitrary game-specific data carried along with the definition. */
  metadata?: Record<string, unknown>
}

/** One occupied inventory slot: an item id and how many copies it holds. */
export interface InventorySlot {
  itemId: string
  quantity: number
}

/** Aggregated view of all copies of one item across slots. */
export interface InventoryEntry {
  item: ItemDefinition
  quantity: number
}

/** Outcome of `add()`. `success` means the full requested quantity fit. */
export interface AddItemResult {
  /** True when the entire requested quantity was added. */
  success: boolean
  /** How many copies were actually added. */
  added: number
  /** How many copies did not fit (or were rejected). */
  overflow: number
  /** Why not everything was added. */
  reason?: 'unknown-item' | 'inventory-full'
}

/** Outcome of `use()`. */
export interface UseItemResult {
  success: boolean
  /** True when one copy was removed because the item is consumable. */
  consumed: boolean
  reason?: 'unknown-item' | 'not-owned'
}

/** The state held (and optionally persisted) by the inventory store. */
export interface InventoryState {
  slots: InventorySlot[]
}

/**
 * Persistence settings. Passing this object enables persistence through
 * zustand's `persist` middleware via `@overworld-engine/core`'s `persistOptions`.
 */
export interface InventoryPersistConfig {
  /** Storage key (namespaced by `prefix`). @default 'inventory' */
  name?: string
  /** Persisted-shape version, for migrations. @default 0 */
  version?: number
  /** Key prefix. @default 'overworld' */
  prefix?: string
  /** Storage backend factory. @default localStorage */
  storage?: () => StateStorage
}
