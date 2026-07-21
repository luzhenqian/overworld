import type { ItemLike } from './engineTypes'

export interface SlotRow {
  itemId: string
  quantity: number
  item?: ItemLike
}

/** Join inventory slots with item definitions for display. */
export function slotRows(
  slots: readonly { itemId: string; quantity: number }[],
  lookup: (itemId: string) => ItemLike | undefined,
): SlotRow[] {
  return slots.map((slot) => ({ itemId: slot.itemId, quantity: slot.quantity, item: lookup(slot.itemId) }))
}
