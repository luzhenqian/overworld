import { Hotbar, Slot, SlotGrid, Tooltip } from '@overworld-engine/ui'

export default { title: 'Primitives / Slots' }

export const Rarities = () => (
  <SlotGrid columns={4}>
    <Slot icon="🧪" quantity={3} rarity="common" />
    <Slot icon="🗡️" rarity="rare" />
    <Slot icon="🛡️" rarity="epic" />
    <Slot icon="👑" rarity="legendary" selected />
  </SlotGrid>
)

export const HotbarStory = () => (
  <Hotbar>
    <Tooltip content="Health Potion">
      <Slot icon="🧪" quantity={3} keybind="1" />
    </Tooltip>
    <Slot icon="🗡️" keybind="2" rarity="rare" />
    <Slot keybind="3" />
    <Slot keybind="4" />
  </Hotbar>
)
HotbarStory.storyName = 'Hotbar'
