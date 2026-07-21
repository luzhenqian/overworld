import { useState } from 'react'
import { useStore } from 'zustand'
import { Button } from './Button'
import { GameWindow } from './GameWindow'
import { Slot, SlotGrid } from './SlotGrid'
import { Tooltip } from './Tooltip'
import { slotRows } from '../inventorySelectors'
import type { InventoryEngineLike, ItemLike } from '../engineTypes'

export interface InventoryWindowProps {
  engine: InventoryEngineLike
  /** Window registry id. @default 'inventory' */
  id?: string
  /** @default 5 */
  columns?: number
  title?: string
  /** Map an item to a rarity key for `data-ow-rarity` styling. */
  rarityOf?: (item: ItemLike) => string | undefined
}

/** Inventory window: slot grid with tooltips and a use/drop detail footer. */
export function InventoryWindow({
  engine,
  id = 'inventory',
  columns = 5,
  title = 'Inventory',
  rarityOf,
}: InventoryWindowProps) {
  const slots = useStore(engine.store, (s) => s.slots)
  const [selected, setSelected] = useState<number | null>(null)
  const rows = slotRows(slots, (itemId) => engine.getDefinition(itemId))
  const selectedRow = selected != null ? rows[selected] : undefined

  return (
    <GameWindow id={id} title={title}>
      <SlotGrid columns={columns}>
        {rows.map((row, i) => (
          <Tooltip key={`${row.itemId}-${i}`} content={row.item?.name ?? row.itemId}>
            <Slot
              icon={row.item?.icon}
              quantity={row.quantity}
              rarity={row.item && rarityOf ? rarityOf(row.item) : undefined}
              selected={selected === i}
              onClick={() => setSelected(selected === i ? null : i)}
            />
          </Tooltip>
        ))}
        {rows.length === 0 && <p className="ow-inventory-empty">Empty</p>}
      </SlotGrid>
      {selectedRow && (
        <footer className="ow-inventory-detail">
          <div className="ow-inventory-detail-text">
            <strong>{selectedRow.item?.name ?? selectedRow.itemId}</strong>
            {selectedRow.item?.description && <p>{selectedRow.item.description}</p>}
          </div>
          <div className="ow-inventory-actions">
            <Button
              onClick={() => {
                engine.use(selectedRow.itemId)
                setSelected(null)
              }}
            >
              Use
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                engine.remove(selectedRow.itemId, 1)
                setSelected(null)
              }}
            >
              Drop
            </Button>
          </div>
        </footer>
      )}
    </GameWindow>
  )
}
