import { createInventory } from '@overworld-engine/inventory'
import { Button, InventoryWindow, useUiStore } from '@overworld-engine/ui'

export default { title: 'Engines / Inventory' }

const inventory = createInventory()
inventory.registerItems([
  { id: 'potion', name: 'Health Potion', description: 'Restores 50 HP.', icon: '🧪', category: 'consumable' },
  { id: 'herb', name: 'Moon Herb', description: 'Glows faintly at night.', icon: '🌿', category: 'material' },
  { id: 'sword', name: 'Iron Sword', description: 'A dependable blade.', icon: '🗡️', stackable: false },
])
inventory.add('potion', 3)
inventory.add('herb', 2)
inventory.add('sword', 1)

export const Inventory = () => {
  const toggleWindow = useUiStore((s) => s.toggleWindow)
  return (
    <div style={{ position: 'relative', minHeight: '60vh' }}>
      <Button onClick={() => toggleWindow('inventory')}>Toggle inventory</Button>
      <InventoryWindow
        engine={inventory}
        rarityOf={(item) => (item.category === 'material' ? 'rare' : undefined)}
      />
    </div>
  )
}
