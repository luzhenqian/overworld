import { useContext, useState } from 'react'
import { createConditionRegistry, createEffectRegistry } from '@overworld-engine/core'
import { createDialogueEngine } from '@overworld-engine/dialogue'
import { createInventory } from '@overworld-engine/inventory'
import { createQuestEngine } from '@overworld-engine/quest'
import { useToastStore } from '@overworld-engine/notifications'
import {
  Bar,
  Button,
  DialogueBox,
  Hotbar,
  Hud,
  InventoryWindow,
  QuestLogWindow,
  QuestTracker,
  Slot,
  ToastViewport,
  useUiStore,
} from '@overworld-engine/ui'
import { ThemeContext } from '../.ladle/components'

export default { title: 'Integrated / Full HUD' }

const dialogue = createDialogueEngine({
  dialogues: [],
  conditions: createConditionRegistry(),
  effects: createEffectRegistry(),
})
dialogue.registerDialogues({
  id: 'guide',
  startNodeId: 'hi',
  nodes: [{ id: 'hi', speaker: 'Guide', text: 'This is the full HUD, wired to real engines.' }],
})

const quests = createQuestEngine({
  quests: [],
  conditions: createConditionRegistry(),
  effects: createEffectRegistry(),
})
quests.registerQuests({
  id: 'tour',
  title: 'Grand Tour',
  objectives: [{ id: 'look', description: 'Look around', target: 1 }],
})

const inventory = createInventory()
inventory.registerItems([{ id: 'potion', name: 'Health Potion', icon: '🧪' }])
inventory.add('potion', 5)

export const FullHud = () => {
  const theme = useContext(ThemeContext)
  const [hp, setHp] = useState(80)
  const toggleWindow = useUiStore((s) => s.toggleWindow)
  return (
    <div style={{ position: 'relative', height: '80vh', background: '#151822', overflow: 'hidden' }}>
      <Hud theme={theme === 'base' ? undefined : theme}>
        <Hud.Anchor anchor="top-left">
          <Bar value={hp} max={100} variant="hp" label="HP" showValue />
          <Bar value={40} max={100} variant="mp" label="MP" showValue />
          <QuestTracker engine={quests} />
        </Hud.Anchor>
        <Hud.Anchor anchor="bottom">
          <div style={{ display: 'flex', gap: 8 }}>
            <Button onClick={() => dialogue.start('guide')}>Talk</Button>
            <Button onClick={() => quests.startQuest('tour')}>Quest</Button>
            <Button onClick={() => toggleWindow('inventory')}>Bag</Button>
            <Button onClick={() => setHp((h) => Math.max(h - 15, 0))}>Damage</Button>
            <Button onClick={() => useToastStore.getState().show({ message: 'Saved.', variant: 'info' })}>
              Toast
            </Button>
          </div>
          <Hotbar>
            <Slot icon="🧪" quantity={5} keybind="1" onClick={() => inventory.use('potion')} />
            <Slot keybind="2" />
          </Hotbar>
        </Hud.Anchor>
        <Hud.Anchor anchor="bottom">
          <DialogueBox engine={dialogue} portrait={() => <span>🧭</span>} />
        </Hud.Anchor>
        <InventoryWindow engine={inventory} />
        <QuestLogWindow engine={quests} />
        <ToastViewport store={useToastStore} />
      </Hud>
    </div>
  )
}
