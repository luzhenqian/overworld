import {
  EventBus,
  createEffectRegistry,
  createMemoryStorage,
  type OverworldEventMap,
} from '@overworld/core'
import { describe, expect, it, vi } from 'vitest'
import { createInventory } from '../createInventory'
import type { ItemDefinition } from '../types'

const potion: ItemDefinition = {
  id: 'potion',
  name: 'item.potion',
  category: 'consumable',
  stackable: true,
  maxStack: 5,
  consumable: true,
  useEffects: [{ type: 'player.heal', params: { amount: 10 } }],
}

const sword: ItemDefinition = {
  id: 'sword',
  name: 'item.sword',
  category: 'equipment',
  stackable: false,
}

const coin: ItemDefinition = {
  id: 'coin',
  name: 'item.coin',
  category: 'currency',
  stackable: true,
}

function setup(overrides: Parameters<typeof createInventory>[0] = {}) {
  const events = new EventBus<OverworldEventMap>()
  const inventory = createInventory({ items: [potion, sword, coin], events, ...overrides })
  return { events, inventory }
}

describe('createInventory', () => {
  describe('stacking', () => {
    it('stacks copies of a stackable item into one slot up to maxStack', () => {
      const { inventory } = setup()
      expect(inventory.add('potion', 3)).toEqual({ success: true, added: 3, overflow: 0 })
      expect(inventory.add('potion', 2)).toEqual({ success: true, added: 2, overflow: 0 })
      expect(inventory.slots()).toEqual([{ itemId: 'potion', quantity: 5 }])
      expect(inventory.count('potion')).toBe(5)
    })

    it('opens a new slot once a stack reaches maxStack', () => {
      const { inventory } = setup()
      inventory.add('potion', 7)
      expect(inventory.slots()).toEqual([
        { itemId: 'potion', quantity: 5 },
        { itemId: 'potion', quantity: 2 },
      ])
    })

    it('stacks without limit when maxStack is omitted', () => {
      const { inventory } = setup()
      inventory.add('coin', 100000)
      expect(inventory.slots()).toEqual([{ itemId: 'coin', quantity: 100000 }])
    })

    it('gives non-stackable items one slot each', () => {
      const { inventory } = setup()
      inventory.add('sword', 2)
      expect(inventory.slots()).toEqual([
        { itemId: 'sword', quantity: 1 },
        { itemId: 'sword', quantity: 1 },
      ])
    })

    it('rejects unknown items', () => {
      const { inventory } = setup()
      expect(inventory.add('mystery', 2)).toEqual({
        success: false,
        added: 0,
        overflow: 2,
        reason: 'unknown-item',
      })
      expect(inventory.slots()).toEqual([])
    })
  })

  describe('capacity', () => {
    it('reports overflow when slots run out', () => {
      const { inventory, events } = setup({ capacity: 2 })
      const added = vi.fn()
      events.on('item:added', added)

      expect(inventory.add('potion', 12)).toEqual({
        success: false,
        added: 10,
        overflow: 2,
        reason: 'inventory-full',
      })
      expect(inventory.isFull()).toBe(true)
      // The partial add is still announced with the actually added quantity.
      expect(added).toHaveBeenCalledWith({ itemId: 'potion', quantity: 10, total: 10 })
    })

    it('still fills existing stacks when full', () => {
      const { inventory } = setup({ capacity: 1 })
      inventory.add('potion', 2)
      expect(inventory.add('potion', 2)).toEqual({ success: true, added: 2, overflow: 0 })
      expect(inventory.slots()).toEqual([{ itemId: 'potion', quantity: 4 }])
    })

    it('emits nothing when nothing fits', () => {
      const { inventory, events } = setup({ capacity: 1 })
      const added = vi.fn()
      events.on('item:added', added)
      inventory.add('potion', 5)
      added.mockClear()

      expect(inventory.add('sword')).toEqual({
        success: false,
        added: 0,
        overflow: 1,
        reason: 'inventory-full',
      })
      expect(added).not.toHaveBeenCalled()
    })

    it('is unlimited when capacity is omitted', () => {
      const { inventory } = setup()
      for (let i = 0; i < 50; i++) inventory.add('sword')
      expect(inventory.slots()).toHaveLength(50)
      expect(inventory.isFull()).toBe(false)
    })
  })

  describe('remove / has / count', () => {
    it('removes across slots and drops emptied ones', () => {
      const { inventory } = setup()
      inventory.add('potion', 7) // slots: [5, 2]
      expect(inventory.remove('potion', 3)).toBe(true) // takes 2 from last, 1 from first
      expect(inventory.slots()).toEqual([{ itemId: 'potion', quantity: 4 }])
    })

    it('is all-or-nothing when not enough copies are owned', () => {
      const { inventory } = setup()
      inventory.add('potion', 2)
      expect(inventory.remove('potion', 3)).toBe(false)
      expect(inventory.count('potion')).toBe(2)
    })

    it('answers has() with an optional quantity', () => {
      const { inventory } = setup()
      inventory.add('potion', 2)
      expect(inventory.has('potion')).toBe(true)
      expect(inventory.has('potion', 2)).toBe(true)
      expect(inventory.has('potion', 3)).toBe(false)
      expect(inventory.has('sword')).toBe(false)
    })
  })

  describe('use effects', () => {
    it('runs useEffects through the effect registry with the configured context', () => {
      const heal = vi.fn()
      const context = { hp: 50 }
      const effects = createEffectRegistry<typeof context>()
      effects.register('player.heal', heal)
      const inventory = createInventory({
        items: [potion],
        events: new EventBus<OverworldEventMap>(),
        effects,
        context,
      })
      inventory.add('potion')

      const result = inventory.use('potion')
      expect(result).toEqual({ success: true, consumed: true })
      expect(heal).toHaveBeenCalledWith({ amount: 10 }, context)
      expect(inventory.count('potion')).toBe(0)
    })

    it('does not consume non-consumable items', () => {
      const { inventory } = setup()
      inventory.add('sword')
      expect(inventory.use('sword')).toEqual({ success: true, consumed: false })
      expect(inventory.count('sword')).toBe(1)
    })

    it('fails when the item is not owned or unknown', () => {
      const { inventory } = setup()
      expect(inventory.use('potion')).toEqual({
        success: false,
        consumed: false,
        reason: 'not-owned',
      })
      expect(inventory.use('mystery')).toEqual({
        success: false,
        consumed: false,
        reason: 'unknown-item',
      })
    })

    it('survives an unregistered effect type (warns, does not throw)', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const { inventory } = setup()
      inventory.add('potion')
      expect(inventory.use('potion').success).toBe(true)
      expect(warn).toHaveBeenCalled()
      warn.mockRestore()
    })
  })

  describe('events', () => {
    it('emits item:added, item:removed and item:used with running totals', () => {
      const { inventory, events } = setup()
      const log: unknown[] = []
      events.on('item:added', (p) => log.push(['added', p]))
      events.on('item:removed', (p) => log.push(['removed', p]))
      events.on('item:used', (p) => log.push(['used', p]))

      inventory.add('potion', 3)
      inventory.remove('potion', 1)
      inventory.use('potion')

      expect(log).toEqual([
        ['added', { itemId: 'potion', quantity: 3, total: 3 }],
        ['removed', { itemId: 'potion', quantity: 1, total: 2 }],
        // use() consumes one copy…
        ['removed', { itemId: 'potion', quantity: 1, total: 1 }],
        // …then announces the use.
        ['used', { itemId: 'potion' }],
      ])
    })

    it('emits no remove event on failed removals', () => {
      const { inventory, events } = setup()
      const removed = vi.fn()
      events.on('item:removed', removed)
      inventory.remove('potion', 1)
      expect(removed).not.toHaveBeenCalled()
    })
  })

  describe('selectors and helpers', () => {
    it('aggregates entries per item id', () => {
      const { inventory } = setup()
      inventory.add('potion', 7)
      inventory.add('sword')
      expect(inventory.entries()).toEqual([
        { item: potion, quantity: 7 },
        { item: sword, quantity: 1 },
      ])
      expect(inventory.entriesByCategory('equipment')).toEqual([{ item: sword, quantity: 1 }])
    })

    it('sorts slots by category then item id by default', () => {
      const { inventory } = setup()
      inventory.add('sword')
      inventory.add('coin', 3)
      inventory.add('potion', 1)
      inventory.sortSlots()
      expect(inventory.slots().map((s) => s.itemId)).toEqual(['potion', 'coin', 'sword'])
    })

    it('registers additional items at runtime and clears everything', () => {
      const { inventory } = setup()
      inventory.registerItems([{ id: 'gem', name: 'item.gem' }])
      expect(inventory.getDefinition('gem')?.name).toBe('item.gem')
      expect(inventory.definitions()).toHaveLength(4)

      inventory.add('gem', 2)
      inventory.clear()
      expect(inventory.slots()).toEqual([])
    })
  })

  describe('persistence', () => {
    it('round-trips slots through a storage backend', () => {
      const storage = createMemoryStorage()
      const events = new EventBus<OverworldEventMap>()
      const first = createInventory({
        items: [potion],
        events,
        persist: { name: 'inv-test', storage: () => storage },
      })
      first.add('potion', 4)

      const second = createInventory({
        items: [potion],
        events,
        persist: { name: 'inv-test', storage: () => storage },
      })
      expect(second.count('potion')).toBe(4)
      expect(second.slots()).toEqual([{ itemId: 'potion', quantity: 4 }])
    })
  })
})
