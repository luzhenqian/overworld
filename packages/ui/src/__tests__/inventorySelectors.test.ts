import { describe, expect, test } from 'vitest'
import { slotRows } from '../inventorySelectors'
import type { ItemLike } from '../engineTypes'

const items: Record<string, ItemLike> = {
  potion: { id: 'potion', name: 'Potion', icon: '🧪' },
}
const lookup = (id: string) => items[id]

describe('slotRows', () => {
  test('joins slots with definitions; unknown items keep undefined item', () => {
    const rows = slotRows(
      [
        { itemId: 'potion', quantity: 3 },
        { itemId: 'mystery', quantity: 1 },
      ],
      lookup,
    )
    expect(rows[0]).toEqual({ itemId: 'potion', quantity: 3, item: items.potion })
    expect(rows[1]).toEqual({ itemId: 'mystery', quantity: 1, item: undefined })
  })

  test('empty inventory produces no rows', () => {
    expect(slotRows([], lookup)).toEqual([])
  })
})
