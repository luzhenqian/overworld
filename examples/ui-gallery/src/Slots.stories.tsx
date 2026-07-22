import { Hotbar, InventorySlot, SlotGrid, Tooltip } from '@overworld-engine/ui'

export default { title: 'Primitives / Slots' }

export const Rarities = () => (
  <SlotGrid columns={4}>
    <InventorySlot icon="🧪" quantity={3} rarity="common" />
    <InventorySlot icon="🗡️" rarity="rare" />
    <InventorySlot icon="🛡️" rarity="epic" />
    <InventorySlot icon="👑" rarity="legendary" selected />
  </SlotGrid>
)

export const HotbarStory = () => (
  <Hotbar>
    <Tooltip content="Health Potion">
      <InventorySlot icon="🧪" quantity={3} keybind="1" />
    </Tooltip>
    <InventorySlot icon="🗡️" keybind="2" rarity="rare" />
    <InventorySlot keybind="3" />
    <InventorySlot keybind="4" />
  </Hotbar>
)
HotbarStory.storyName = 'Hotbar'
