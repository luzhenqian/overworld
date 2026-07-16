import {
  createEffectRegistry,
  gameEvents,
  persistOptions,
  runEffects,
  type EffectRegistry,
  type EventBus,
  type OverworldEventMap,
} from '@overworld-engine/core'
import { persist } from 'zustand/middleware'
import { createStore, type StoreApi } from 'zustand/vanilla'
import type {
  AddItemResult,
  InventoryEntry,
  InventoryPersistConfig,
  InventorySlot,
  InventoryState,
  ItemDefinition,
  UseItemResult,
} from './types'

/** Configuration for {@link createInventory}. */
export interface InventoryConfig<Ctx = unknown> {
  /** Item definitions available from the start. More can be added later via `registerItems`. */
  items?: ItemDefinition[]
  /** Maximum number of slots. Omit for an unlimited inventory. */
  capacity?: number
  /** Effect registry used to resolve `useEffects`. Defaults to an empty registry. */
  effects?: EffectRegistry<Ctx>
  /** Context passed to every effect handler. */
  context?: Ctx
  /** Event bus to emit `item:*` events on. Defaults to the global `gameEvents`. */
  events?: EventBus<OverworldEventMap>
  /**
   * Persist the slots. Framework convention: omitted or `false` = disabled;
   * `true` = enabled with defaults; object = custom.
   */
  persist?: boolean | InventoryPersistConfig
}

/** The headless inventory engine returned by {@link createInventory}. */
export interface Inventory {
  /** Underlying zustand vanilla store — subscribe directly or via `useStore` in React. */
  store: StoreApi<InventoryState>
  /** Add or replace item definitions at runtime. */
  registerItems(items: ItemDefinition[]): void
  /** Look up a single item definition. */
  getDefinition(itemId: string): ItemDefinition | undefined
  /** All registered item definitions. */
  definitions(): ItemDefinition[]
  /**
   * Add copies of an item. Existing stacks are filled first, then new slots
   * are opened while capacity allows. Emits `item:added` when anything was
   * added. Copies that do not fit are reported as `overflow`.
   */
  add(itemId: string, quantity?: number): AddItemResult
  /**
   * Remove copies of an item (all-or-nothing). Returns false when fewer
   * copies are owned than requested. Emits `item:removed` on success.
   */
  remove(itemId: string, quantity?: number): boolean
  /** Whether at least `quantity` (default 1) copies are owned. */
  has(itemId: string, quantity?: number): boolean
  /** Total owned copies of an item across all slots. */
  count(itemId: string): number
  /**
   * Use an item: runs its `useEffects` through the effect registry, then
   * removes one copy when the item is `consumable`. Emits `item:used`.
   */
  use(itemId: string): UseItemResult
  /** Current slots, in slot order. */
  slots(): InventorySlot[]
  /** Owned items aggregated per item id (unknown definitions are skipped). */
  entries(): InventoryEntry[]
  /** `entries()` filtered to one category. */
  entriesByCategory(category: string): InventoryEntry[]
  /**
   * Reorder slots in place. The default comparator sorts by category, then
   * by item id.
   */
  sortSlots(comparator?: (a: InventorySlot, b: InventorySlot) => number): void
  /** True when a capacity is set and every slot is occupied. */
  isFull(): boolean
  /** Remove everything. */
  clear(): void
}

/**
 * Create a headless inventory engine.
 *
 * Content (item definitions) is injected, side effects of using items go
 * through the effect registry, and every mutation is announced on the event
 * bus — the engine never imports game code.
 */
export function createInventory<Ctx = unknown>(config: InventoryConfig<Ctx> = {}): Inventory {
  const defs = new Map<string, ItemDefinition>()
  const effects = config.effects ?? createEffectRegistry<Ctx>()
  const events = config.events ?? gameEvents
  const capacity = config.capacity
  const context = config.context as Ctx

  const initializer = (): InventoryState => ({ slots: [] })
  const persistCfg = config.persist === true ? {} : config.persist
  const store: StoreApi<InventoryState> = persistCfg
    ? createStore<InventoryState>()(
        persist(initializer, {
          ...persistOptions<InventoryState>({
            name: persistCfg.name ?? 'inventory',
            ...(persistCfg.version !== undefined && { version: persistCfg.version }),
            ...(persistCfg.prefix !== undefined && { prefix: persistCfg.prefix }),
            ...(persistCfg.storage !== undefined && { storage: persistCfg.storage }),
          }),
        })
      )
    : createStore<InventoryState>()(initializer)

  const maxStackOf = (def: ItemDefinition): number => {
    if (def.stackable === false) return 1
    return def.maxStack ?? Number.POSITIVE_INFINITY
  }

  const count = (itemId: string): number =>
    store
      .getState()
      .slots.reduce((sum, slot) => (slot.itemId === itemId ? sum + slot.quantity : sum), 0)

  const defaultComparator = (a: InventorySlot, b: InventorySlot): number => {
    // Items without a category sort last.
    const categoryA = defs.get(a.itemId)?.category ?? '￿'
    const categoryB = defs.get(b.itemId)?.category ?? '￿'
    if (categoryA !== categoryB) return categoryA < categoryB ? -1 : 1
    if (a.itemId !== b.itemId) return a.itemId < b.itemId ? -1 : 1
    return 0
  }

  const entries = (): InventoryEntry[] => {
    const totals = new Map<string, number>()
    for (const slot of store.getState().slots) {
      totals.set(slot.itemId, (totals.get(slot.itemId) ?? 0) + slot.quantity)
    }
    const result: InventoryEntry[] = []
    for (const [itemId, quantity] of totals) {
      const item = defs.get(itemId)
      if (item) result.push({ item, quantity })
    }
    return result
  }

  const inventory: Inventory = {
    store,

    registerItems(items) {
      for (const item of items) defs.set(item.id, item)
    },

    getDefinition(itemId) {
      return defs.get(itemId)
    },

    definitions() {
      return [...defs.values()]
    },

    add(itemId, quantity = 1) {
      const def = defs.get(itemId)
      if (!def) return { success: false, added: 0, overflow: quantity, reason: 'unknown-item' }
      if (quantity <= 0) return { success: true, added: 0, overflow: 0 }

      const maxStack = maxStackOf(def)
      const slots = store.getState().slots.map((slot) => ({ ...slot }))
      let remaining = quantity

      // Fill existing stacks first.
      for (const slot of slots) {
        if (remaining === 0) break
        if (slot.itemId !== itemId || slot.quantity >= maxStack) continue
        const take = Math.min(maxStack - slot.quantity, remaining)
        slot.quantity += take
        remaining -= take
      }

      // Then open new slots while capacity allows.
      while (remaining > 0 && (capacity === undefined || slots.length < capacity)) {
        const take = Math.min(maxStack, remaining)
        slots.push({ itemId, quantity: take })
        remaining -= take
      }

      const added = quantity - remaining
      if (added > 0) {
        store.setState({ slots })
        events.emit('item:added', { itemId, quantity: added, total: count(itemId) })
      }
      if (remaining > 0) {
        return { success: false, added, overflow: remaining, reason: 'inventory-full' }
      }
      return { success: true, added, overflow: 0 }
    },

    remove(itemId, quantity = 1) {
      if (quantity <= 0) return true
      if (count(itemId) < quantity) return false

      let remaining = quantity
      const slots: InventorySlot[] = []
      // Drain from the last slots first so partially filled stacks go away
      // before full ones.
      for (let i = store.getState().slots.length - 1; i >= 0; i--) {
        const slot = store.getState().slots[i]
        if (!slot) continue
        if (slot.itemId !== itemId || remaining === 0) {
          slots.unshift(slot)
          continue
        }
        const take = Math.min(slot.quantity, remaining)
        remaining -= take
        if (slot.quantity > take) slots.unshift({ ...slot, quantity: slot.quantity - take })
      }
      store.setState({ slots })
      events.emit('item:removed', { itemId, quantity, total: count(itemId) })
      return true
    },

    has(itemId, quantity = 1) {
      return count(itemId) >= quantity
    },

    count,

    use(itemId) {
      const def = defs.get(itemId)
      if (!def) return { success: false, consumed: false, reason: 'unknown-item' }
      if (count(itemId) < 1) return { success: false, consumed: false, reason: 'not-owned' }

      runEffects(effects, def.useEffects, context)
      const consumed = def.consumable === true
      if (consumed) inventory.remove(itemId, 1)
      events.emit('item:used', { itemId })
      return { success: true, consumed }
    },

    slots() {
      return store.getState().slots
    },

    entries,

    entriesByCategory(category) {
      return entries().filter((entry) => entry.item.category === category)
    },

    sortSlots(comparator = defaultComparator) {
      store.setState({ slots: [...store.getState().slots].sort(comparator) })
    },

    isFull() {
      return capacity !== undefined && store.getState().slots.length >= capacity
    },

    clear() {
      store.setState({ slots: [] })
    },
  }

  if (config.items) inventory.registerItems(config.items)

  return inventory
}
