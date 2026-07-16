import {
  EventBus,
  createConditionRegistry,
  createEffectRegistry,
  type OverworldEventMap,
} from '@overworld-engine/core'
import { describe, expect, it } from 'vitest'
import { createQuestEngine } from '../engine'
import type { QuestDefinition } from '../types'

const QUEST: QuestDefinition = {
  id: 'walk',
  objectives: [{ id: 'distance', target: 5, trigger: { event: 'player:moved' } }],
}

describe('clock injection', () => {
  it('stamps startedAt from the injected clock', () => {
    let t = 1000
    const engine = createQuestEngine({
      quests: [QUEST],
      conditions: createConditionRegistry(),
      effects: createEffectRegistry(),
      events: new EventBus<OverworldEventMap>(),
      clock: () => t,
    })

    t = 4242
    expect(engine.startQuest('walk')).toBe(true)
    expect(engine.getState().active['walk']?.startedAt).toBe(4242)
  })

  it('replaying the same ops with the same clock yields identical persisted state', () => {
    const run = () => {
      let t = 1000
      const engine = createQuestEngine({
        quests: [QUEST],
        conditions: createConditionRegistry(),
        effects: createEffectRegistry(),
        events: new EventBus<OverworldEventMap>(),
        clock: () => t,
      })
      engine.startQuest('walk')
      t = 2000
      engine.reportProgress('walk', 'distance', 3)
      const { active, completed } = engine.getState()
      return JSON.stringify({ active, completed })
    }
    expect(run()).toBe(run())
  })
})
