import {
  createConditionRegistry,
  createEffectRegistry,
  EventBus,
} from '@overworld/core'
import { createQuestEngine } from '@overworld/quest'
import { bench } from '../lib.mjs'

const HUGE_TARGET = 1e9 // objectives never complete during the bench

function makeEngine(bus, questCount, { filtered }) {
  const quests = []
  for (let i = 0; i < questCount; i++) {
    quests.push({
      id: `quest-${i}`,
      objectives: [
        {
          id: 'collect',
          target: HUGE_TARGET,
          trigger: {
            event: 'item:added',
            ...(filtered ? { filter: { itemId: `item-${i}` } } : {}),
          },
        },
      ],
    })
  }
  const engine = createQuestEngine({
    quests,
    conditions: createConditionRegistry(),
    effects: createEffectRegistry(),
    events: bus,
  })
  for (const quest of quests) engine.getState().startQuest(quest.id)
  return engine
}

export function run() {
  const results = []

  // 50 active quests, filtered triggers: each event matches exactly 1 quest
  // (the engine still scans every active quest per event).
  {
    const bus = new EventBus()
    const engine = makeEngine(bus, 50, { filtered: true })
    results.push(
      bench('50 active quests, filtered trigger match', (i) => {
        bus.emit('item:added', { itemId: `item-${i % 50}`, quantity: 1, total: 1 })
      }, { iterations: 1000, meta: { quests: 50, eventsPerRun: 1000, matchesPerEvent: 1 } })
    )
    engine.getState().dispose()
  }

  // 50 active quests, unfiltered trigger: every event advances all 50.
  {
    const bus = new EventBus()
    const engine = makeEngine(bus, 50, { filtered: false })
    results.push(
      bench('50 active quests, unfiltered fan-out', () => {
        bus.emit('item:added', { itemId: 'gold', quantity: 1, total: 1 })
      }, { iterations: 1000, meta: { quests: 50, eventsPerRun: 1000, matchesPerEvent: 50 } })
    )
    engine.getState().dispose()
  }

  // Amount-driven progress (player:moved distance accumulation), 10 quests.
  {
    const bus = new EventBus()
    const quests = Array.from({ length: 10 }, (_, i) => ({
      id: `walk-${i}`,
      objectives: [
        {
          id: 'walk',
          target: HUGE_TARGET,
          trigger: { event: 'player:moved', amountFrom: 'distance' },
        },
      ],
    }))
    const engine = createQuestEngine({
      quests,
      conditions: createConditionRegistry(),
      effects: createEffectRegistry(),
      events: bus,
    })
    for (const quest of quests) engine.getState().startQuest(quest.id)
    const payload = { position: [0, 0, 0], distance: 0.12 }
    results.push(
      bench('10 active quests, amountFrom trigger', () => {
        bus.emit('player:moved', payload)
      }, { iterations: 1000, meta: { quests: 10, amountFrom: 'distance' } })
    )
    engine.getState().dispose()
  }

  return { name: 'quest', results }
}
