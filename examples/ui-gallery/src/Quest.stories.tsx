import { createConditionRegistry, createEffectRegistry } from '@overworld-engine/core'
import { createQuestEngine } from '@overworld-engine/quest'
import { Button, QuestLogWindow, QuestTracker, useUiStore } from '@overworld-engine/ui'

export default { title: 'Engines / Quest' }

const quests = createQuestEngine({
  quests: [],
  conditions: createConditionRegistry(),
  effects: createEffectRegistry(),
})
quests.registerQuests({
  id: 'herbs',
  title: 'Moonlit Harvest',
  objectives: [{ id: 'gather', description: 'Gather moon herbs', target: 3 }],
})

export const Quest = () => {
  const toggleWindow = useUiStore((s) => s.toggleWindow)
  return (
    <div style={{ position: 'relative', minHeight: '50vh', display: 'grid', gap: 16, alignContent: 'start', justifyItems: 'start' }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <Button onClick={() => quests.startQuest('herbs')}>Start quest</Button>
        <Button onClick={() => quests.reportProgress('herbs', 'gather')}>+1 herb</Button>
        <Button onClick={() => toggleWindow('quest-log')}>Quest log</Button>
      </div>
      <QuestTracker engine={quests} />
      <QuestLogWindow engine={quests} />
    </div>
  )
}
