import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  EventBus,
  createConditionRegistry,
  createEffectRegistry,
  createMemoryStorage,
  type OverworldEventMap,
} from '@overworld/core'
import type { StateStorage } from 'zustand/middleware'
import { createQuestEngine } from '../engine'
import type { QuestDefinition } from '../types'

interface TestCtx {
  level: number
  gold: number
}

const WALK_QUEST: QuestDefinition = {
  id: 'walk-the-city',
  category: 'tutorial',
  title: 'quests.walk.title',
  objectives: [
    {
      id: 'distance',
      description: 'quests.walk.obj.distance',
      target: 20,
      trigger: { event: 'player:moved', amountFrom: 'distance' },
    },
  ],
  rewards: [{ type: 'grantGold', params: { amount: 100 } }],
}

const TALK_QUEST: QuestDefinition = {
  id: 'talk-to-guide',
  objectives: [
    {
      id: 'talk',
      target: 1,
      trigger: { event: 'dialogue:ended', filter: { npcId: 'guide' } },
    },
  ],
}

function setup(options?: {
  quests?: QuestDefinition[]
  persist?: false | { name?: string; storage?: () => StateStorage }
  level?: number
  bus?: EventBus<OverworldEventMap>
}) {
  const bus = options?.bus ?? new EventBus<OverworldEventMap>()
  const ctx: TestCtx = { level: options?.level ?? 1, gold: 0 }
  const conditions = createConditionRegistry<TestCtx>()
  const effects = createEffectRegistry<TestCtx>()
  conditions.register('minLevel', (params, c) => c.level >= (params.level as number))
  effects.register('grantGold', (params, c) => {
    c.gold += params.amount as number
  })
  const engine = createQuestEngine<TestCtx>({
    quests: options?.quests ?? [WALK_QUEST, TALK_QUEST],
    conditions,
    effects,
    context: () => ctx,
    events: bus,
    persist: options?.persist ?? false,
  })
  return { bus, ctx, conditions, effects, engine }
}

describe('createQuestEngine', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  it('starts a quest with zeroed objectives and emits quest:started', () => {
    const { bus, engine } = setup()
    const started: unknown[] = []
    bus.on('quest:started', (p) => started.push(p))

    expect(engine.getState().startQuest('walk-the-city')).toBe(true)

    const state = engine.getState()
    expect(state.isActive('walk-the-city')).toBe(true)
    expect(state.active['walk-the-city']?.objectives).toEqual({
      distance: { current: 0, completed: false },
    })
    expect(started).toEqual([{ questId: 'walk-the-city' }])
  })

  it('warns (without throwing) on unknown quest ids and rejects duplicates', () => {
    const { engine } = setup()
    expect(engine.getState().startQuest('nope')).toBe(false)
    expect(console.warn).toHaveBeenCalledWith('[overworld] unknown quest "nope"')

    engine.getState().startQuest('walk-the-city')
    expect(engine.getState().startQuest('walk-the-city')).toBe(false)
  })

  it('blocks starting until prerequisite quests are completed', () => {
    const gated: QuestDefinition = {
      id: 'gated',
      prerequisites: { quests: ['talk-to-guide'] },
      objectives: [{ id: 'o', target: 1 }],
    }
    const { bus, engine } = setup({ quests: [TALK_QUEST, gated] })

    expect(engine.getState().canStartQuest('gated')).toBe(false)
    expect(engine.getState().startQuest('gated')).toBe(false)

    engine.getState().startQuest('talk-to-guide')
    bus.emit('dialogue:ended', { npcId: 'guide', dialogueId: 'd', nodeId: 'n' })
    expect(engine.getState().isCompleted('talk-to-guide')).toBe(true)
    expect(engine.getState().startQuest('gated')).toBe(true)
  })

  it('evaluates prerequisite conditions through the registry', () => {
    const gated: QuestDefinition = {
      id: 'level-gated',
      prerequisites: { conditions: [{ type: 'minLevel', params: { level: 5 } }] },
      objectives: [{ id: 'o', target: 1 }],
    }
    const { ctx, engine } = setup({ quests: [gated] })

    expect(engine.getState().startQuest('level-gated')).toBe(false)
    ctx.level = 5
    expect(engine.getState().startQuest('level-gated')).toBe(true)
  })

  it('accumulates event-driven progress via amountFrom and clamps at target', () => {
    const { bus, engine } = setup()
    const progress: { current: number; target: number }[] = []
    const objectiveCompleted: unknown[] = []
    bus.on('quest:objective-progress', (p) => progress.push(p))
    bus.on('quest:objective-completed', (p) => objectiveCompleted.push(p))

    engine.getState().startQuest('walk-the-city')
    bus.emit('player:moved', { position: [0, 0, 0], distance: 8 })
    expect(engine.getState().active['walk-the-city']?.objectives['distance']?.current).toBe(8)

    bus.emit('player:moved', { position: [0, 0, 0], distance: 50 }) // overshoots
    expect(progress.map((p) => p.current)).toEqual([8, 20])
    expect(progress[1]?.target).toBe(20)
    expect(objectiveCompleted).toEqual([
      { questId: 'walk-the-city', objectiveId: 'distance' },
    ])
  })

  it('only counts events whose payload matches the trigger filter', () => {
    const { bus, engine } = setup()
    engine.getState().startQuest('talk-to-guide')

    bus.emit('dialogue:ended', { npcId: 'someone-else', dialogueId: 'd', nodeId: 'n' })
    expect(engine.getState().isActive('talk-to-guide')).toBe(true)

    bus.emit('dialogue:ended', { npcId: 'guide', dialogueId: 'd', nodeId: 'n' })
    expect(engine.getState().isCompleted('talk-to-guide')).toBe(true)
  })

  it('completes a quest: runs rewards, emits quest:completed, moves it to completed', () => {
    const { bus, ctx, engine } = setup()
    const completed: unknown[] = []
    bus.on('quest:completed', (p) => completed.push(p))

    engine.getState().startQuest('walk-the-city')
    bus.emit('player:moved', { position: [0, 0, 0], distance: 20 })

    const state = engine.getState()
    expect(state.isActive('walk-the-city')).toBe(false)
    expect(state.isCompleted('walk-the-city')).toBe(true)
    expect(ctx.gold).toBe(100)
    expect(completed).toEqual([{ questId: 'walk-the-city' }])
  })

  it('completeQuest refuses while objectives are incomplete', () => {
    const { ctx, engine } = setup()
    engine.getState().startQuest('walk-the-city')
    expect(engine.getState().completeQuest('walk-the-city')).toBe(false)
    expect(engine.getState().isActive('walk-the-city')).toBe(true)
    expect(ctx.gold).toBe(0)
  })

  it('auto-starts chainNext quests whose prerequisites pass', () => {
    const first: QuestDefinition = {
      id: 'first',
      objectives: [{ id: 'o', target: 1 }],
      chainNext: ['second', 'locked'],
    }
    const second: QuestDefinition = { id: 'second', objectives: [{ id: 'o', target: 1 }] }
    const locked: QuestDefinition = {
      id: 'locked',
      prerequisites: { conditions: [{ type: 'minLevel', params: { level: 99 } }] },
      objectives: [{ id: 'o', target: 1 }],
    }
    const { engine } = setup({ quests: [first, second, locked] })

    engine.getState().startQuest('first')
    engine.getState().reportProgress('first', 'o')

    expect(engine.getState().isCompleted('first')).toBe(true)
    expect(engine.getState().isActive('second')).toBe(true)
    expect(engine.getState().isActive('locked')).toBe(false)
  })

  it('starts autoStart quests on engine init, respecting prerequisites', () => {
    const auto: QuestDefinition = {
      id: 'auto',
      autoStart: true,
      objectives: [{ id: 'o', target: 1 }],
    }
    const autoLocked: QuestDefinition = {
      id: 'auto-locked',
      autoStart: true,
      prerequisites: { quests: ['auto'] },
      objectives: [{ id: 'o', target: 1 }],
    }
    const { engine } = setup({ quests: [auto, autoLocked] })

    expect(engine.getState().isActive('auto')).toBe(true)
    expect(engine.getState().isActive('auto-locked')).toBe(false)
  })

  it('reportProgress advances manually, defaults to +1, and ignores non-active quests', () => {
    const manual: QuestDefinition = {
      id: 'manual',
      objectives: [{ id: 'count', target: 3 }],
    }
    const { engine } = setup({ quests: [manual, WALK_QUEST] })

    engine.getState().reportProgress('manual', 'count') // not active yet — ignored
    expect(engine.getState().isActive('manual')).toBe(false)

    engine.getState().startQuest('manual')
    engine.getState().reportProgress('manual', 'count')
    engine.getState().reportProgress('manual', 'count', 5) // clamps at 3
    expect(engine.getState().isCompleted('manual')).toBe(true)

    // Non-active (already completed) quests ignore further progress.
    engine.getState().reportProgress('manual', 'count', 1)
    expect(console.warn).not.toHaveBeenCalledWith('[overworld] unknown quest "manual"')
  })

  it('reportProgress warns for unknown quests and objectives', () => {
    const { engine } = setup()
    engine.getState().reportProgress('nope', 'o')
    expect(console.warn).toHaveBeenCalledWith('[overworld] unknown quest "nope"')

    engine.getState().startQuest('walk-the-city')
    engine.getState().reportProgress('walk-the-city', 'ghost-objective')
    expect(console.warn).toHaveBeenCalledWith(
      '[overworld] quest "walk-the-city" has no objective "ghost-objective"'
    )
  })

  it('getAvailableQuests reflects prerequisites, active and completed sets', () => {
    const { bus, engine } = setup()
    expect(engine.getState().getAvailableQuests().map((q) => q.id)).toEqual([
      'walk-the-city',
      'talk-to-guide',
    ])

    engine.getState().startQuest('walk-the-city')
    expect(engine.getState().getAvailableQuests().map((q) => q.id)).toEqual(['talk-to-guide'])

    bus.emit('player:moved', { position: [0, 0, 0], distance: 20 })
    expect(engine.getState().getAvailableQuests().map((q) => q.id)).toEqual(['talk-to-guide'])
  })

  it('unsubscribes stale triggers once their quests complete', () => {
    const { bus, engine } = setup()
    engine.getState().startQuest('walk-the-city')
    expect(bus.listenerCount('player:moved')).toBe(1)

    bus.emit('player:moved', { position: [0, 0, 0], distance: 20 })
    expect(bus.listenerCount('player:moved')).toBe(0)
  })

  it('dispose() detaches all listeners; resubscribe() re-enables the engine', () => {
    const { bus, engine } = setup()
    engine.getState().startQuest('walk-the-city')

    engine.getState().dispose()
    expect(bus.listenerCount('player:moved')).toBe(0)
    bus.emit('player:moved', { position: [0, 0, 0], distance: 20 })
    expect(engine.getState().active['walk-the-city']?.objectives['distance']?.current).toBe(0)

    engine.getState().resubscribe()
    bus.emit('player:moved', { position: [0, 0, 0], distance: 20 })
    expect(engine.getState().isCompleted('walk-the-city')).toBe(true)
  })

  it('round-trips active progress and the completed list through persistence, resubscribing triggers', () => {
    const storage = createMemoryStorage()
    const bus = new EventBus<OverworldEventMap>()

    const first = setup({ persist: { storage: () => storage }, bus })
    first.engine.getState().startQuest('talk-to-guide')
    first.engine.getState().startQuest('walk-the-city')
    bus.emit('player:moved', { position: [0, 0, 0], distance: 12 })
    bus.emit('dialogue:ended', { npcId: 'guide', dialogueId: 'd', nodeId: 'n' })
    first.engine.getState().dispose()

    const raw = storage.getItem('overworld:quest') as string
    const saved = JSON.parse(raw).state
    expect(saved.completed).toEqual(['talk-to-guide'])
    expect(saved.active['walk-the-city'].objectives).toEqual({
      distance: { current: 12, completed: false },
    })
    expect(saved.definitions).toBeUndefined() // content is never persisted

    const second = setup({ persist: { storage: () => storage }, bus })
    expect(second.engine.getState().isCompleted('talk-to-guide')).toBe(true)
    expect(
      second.engine.getState().active['walk-the-city']?.objectives['distance']?.current
    ).toBe(12)

    // Rehydration re-attached the trigger subscription: finishing the walk works.
    bus.emit('player:moved', { position: [0, 0, 0], distance: 8 })
    expect(second.engine.getState().isCompleted('walk-the-city')).toBe(true)
    expect(second.ctx.gold).toBe(100)
  })

  it('does not re-run autoStart for quests the save already completed', () => {
    const storage = createMemoryStorage()
    const bus = new EventBus<OverworldEventMap>()
    const auto: QuestDefinition = {
      id: 'auto',
      autoStart: true,
      objectives: [{ id: 'o', target: 1 }],
    }

    const first = setup({ quests: [auto], persist: { storage: () => storage }, bus })
    first.engine.getState().reportProgress('auto', 'o')
    expect(first.engine.getState().isCompleted('auto')).toBe(true)
    first.engine.getState().dispose()

    const second = setup({ quests: [auto], persist: { storage: () => storage }, bus })
    expect(second.engine.getState().isActive('auto')).toBe(false)
    expect(second.engine.getState().isCompleted('auto')).toBe(true)
  })

  it('advances multiple active quests listening to the same event', () => {
    const walkA: QuestDefinition = {
      id: 'walk-a',
      objectives: [{ id: 'd', target: 10, trigger: { event: 'player:moved', amountFrom: 'distance' } }],
    }
    const walkB: QuestDefinition = {
      id: 'walk-b',
      objectives: [{ id: 'd', target: 30, trigger: { event: 'player:moved', amountFrom: 'distance' } }],
    }
    const { bus, engine } = setup({ quests: [walkA, walkB] })
    engine.getState().startQuest('walk-a')
    engine.getState().startQuest('walk-b')
    expect(bus.listenerCount('player:moved')).toBe(1) // one shared handler per event

    bus.emit('player:moved', { position: [0, 0, 0], distance: 10 })
    expect(engine.getState().isCompleted('walk-a')).toBe(true)
    expect(engine.getState().active['walk-b']?.objectives['d']?.current).toBe(10)
  })
})
