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

    expect(engine.startQuest('walk-the-city')).toBe(true)

    expect(engine.isActive('walk-the-city')).toBe(true)
    expect(engine.getState().active['walk-the-city']?.objectives).toEqual({
      distance: { current: 0, completed: false },
    })
    expect(started).toEqual([{ questId: 'walk-the-city' }])
  })

  it('warns (without throwing) on unknown quest ids and rejects duplicates', () => {
    const { engine } = setup()
    expect(engine.startQuest('nope')).toBe(false)
    expect(console.warn).toHaveBeenCalledWith('[overworld] unknown quest "nope"')

    engine.startQuest('walk-the-city')
    expect(engine.startQuest('walk-the-city')).toBe(false)
  })

  it('blocks starting until prerequisite quests are completed', () => {
    const gated: QuestDefinition = {
      id: 'gated',
      prerequisites: { quests: ['talk-to-guide'] },
      objectives: [{ id: 'o', target: 1 }],
    }
    const { bus, engine } = setup({ quests: [TALK_QUEST, gated] })

    expect(engine.canStartQuest('gated')).toBe(false)
    expect(engine.startQuest('gated')).toBe(false)

    engine.startQuest('talk-to-guide')
    bus.emit('dialogue:ended', { npcId: 'guide', dialogueId: 'd', nodeId: 'n' })
    expect(engine.isCompleted('talk-to-guide')).toBe(true)
    expect(engine.startQuest('gated')).toBe(true)
  })

  it('evaluates prerequisite conditions through the registry', () => {
    const gated: QuestDefinition = {
      id: 'level-gated',
      prerequisites: { conditions: [{ type: 'minLevel', params: { level: 5 } }] },
      objectives: [{ id: 'o', target: 1 }],
    }
    const { ctx, engine } = setup({ quests: [gated] })

    expect(engine.startQuest('level-gated')).toBe(false)
    ctx.level = 5
    expect(engine.startQuest('level-gated')).toBe(true)
  })

  it('accumulates event-driven progress via amountFrom and clamps at target', () => {
    const { bus, engine } = setup()
    const progress: { current: number; target: number }[] = []
    const objectiveCompleted: unknown[] = []
    bus.on('quest:objective-progress', (p) => progress.push(p))
    bus.on('quest:objective-completed', (p) => objectiveCompleted.push(p))

    engine.startQuest('walk-the-city')
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
    engine.startQuest('talk-to-guide')

    bus.emit('dialogue:ended', { npcId: 'someone-else', dialogueId: 'd', nodeId: 'n' })
    expect(engine.isActive('talk-to-guide')).toBe(true)

    bus.emit('dialogue:ended', { npcId: 'guide', dialogueId: 'd', nodeId: 'n' })
    expect(engine.isCompleted('talk-to-guide')).toBe(true)
  })

  it('completes a quest: runs rewards, emits quest:completed, moves it to completed', () => {
    const { bus, ctx, engine } = setup()
    const completed: unknown[] = []
    bus.on('quest:completed', (p) => completed.push(p))

    engine.startQuest('walk-the-city')
    bus.emit('player:moved', { position: [0, 0, 0], distance: 20 })

    expect(engine.isActive('walk-the-city')).toBe(false)
    expect(engine.isCompleted('walk-the-city')).toBe(true)
    expect(ctx.gold).toBe(100)
    expect(completed).toEqual([{ questId: 'walk-the-city' }])
  })

  it('completeQuest refuses while objectives are incomplete', () => {
    const { ctx, engine } = setup()
    engine.startQuest('walk-the-city')
    expect(engine.completeQuest('walk-the-city')).toBe(false)
    expect(engine.isActive('walk-the-city')).toBe(true)
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

    engine.startQuest('first')
    engine.reportProgress('first', 'o')

    expect(engine.isCompleted('first')).toBe(true)
    expect(engine.isActive('second')).toBe(true)
    expect(engine.isActive('locked')).toBe(false)
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

    expect(engine.isActive('auto')).toBe(true)
    expect(engine.isActive('auto-locked')).toBe(false)
  })

  it('reportProgress advances manually, defaults to +1, and ignores non-active quests', () => {
    const manual: QuestDefinition = {
      id: 'manual',
      objectives: [{ id: 'count', target: 3 }],
    }
    const { engine } = setup({ quests: [manual, WALK_QUEST] })

    engine.reportProgress('manual', 'count') // not active yet — ignored
    expect(engine.isActive('manual')).toBe(false)

    engine.startQuest('manual')
    engine.reportProgress('manual', 'count')
    engine.reportProgress('manual', 'count', 5) // clamps at 3
    expect(engine.isCompleted('manual')).toBe(true)

    // Non-active (already completed) quests ignore further progress.
    engine.reportProgress('manual', 'count', 1)
    expect(console.warn).not.toHaveBeenCalledWith('[overworld] unknown quest "manual"')
  })

  it('reportProgress warns for unknown quests and objectives', () => {
    const { engine } = setup()
    engine.reportProgress('nope', 'o')
    expect(console.warn).toHaveBeenCalledWith('[overworld] unknown quest "nope"')

    engine.startQuest('walk-the-city')
    engine.reportProgress('walk-the-city', 'ghost-objective')
    expect(console.warn).toHaveBeenCalledWith(
      '[overworld] quest "walk-the-city" has no objective "ghost-objective"'
    )
  })

  it('getAvailableQuests reflects prerequisites, active and completed sets', () => {
    const { bus, engine } = setup()
    expect(engine.getAvailableQuests().map((q) => q.id)).toEqual([
      'walk-the-city',
      'talk-to-guide',
    ])

    engine.startQuest('walk-the-city')
    expect(engine.getAvailableQuests().map((q) => q.id)).toEqual(['talk-to-guide'])

    bus.emit('player:moved', { position: [0, 0, 0], distance: 20 })
    expect(engine.getAvailableQuests().map((q) => q.id)).toEqual(['talk-to-guide'])
  })

  it('unsubscribes stale triggers once their quests complete', () => {
    const { bus, engine } = setup()
    engine.startQuest('walk-the-city')
    expect(bus.listenerCount('player:moved')).toBe(1)

    bus.emit('player:moved', { position: [0, 0, 0], distance: 20 })
    expect(bus.listenerCount('player:moved')).toBe(0)
  })

  it('dispose() detaches all listeners; resubscribe() re-enables the engine', () => {
    const { bus, engine } = setup()
    engine.startQuest('walk-the-city')

    engine.dispose()
    expect(bus.listenerCount('player:moved')).toBe(0)
    bus.emit('player:moved', { position: [0, 0, 0], distance: 20 })
    expect(engine.getState().active['walk-the-city']?.objectives['distance']?.current).toBe(0)

    engine.resubscribe()
    bus.emit('player:moved', { position: [0, 0, 0], distance: 20 })
    expect(engine.isCompleted('walk-the-city')).toBe(true)
  })

  it('exposes the vanilla store: getState() matches and subscribe() sees progress', () => {
    const { bus, engine } = setup()
    const snapshots: number[] = []
    const unsubscribe = engine.store.subscribe((state) => {
      const current = state.active['walk-the-city']?.objectives['distance']?.current
      if (current !== undefined) snapshots.push(current)
    })

    engine.startQuest('walk-the-city')
    expect(engine.store.getState()).toBe(engine.getState())

    bus.emit('player:moved', { position: [0, 0, 0], distance: 8 })
    unsubscribe()
    bus.emit('player:moved', { position: [0, 0, 0], distance: 4 })

    expect(snapshots).toEqual([0, 8])
    expect(engine.getState().active['walk-the-city']?.objectives['distance']?.current).toBe(12)
  })

  it('round-trips active progress and the completed list through persistence, resubscribing triggers', () => {
    const storage = createMemoryStorage()
    const bus = new EventBus<OverworldEventMap>()

    const first = setup({ persist: { storage: () => storage }, bus })
    first.engine.startQuest('talk-to-guide')
    first.engine.startQuest('walk-the-city')
    bus.emit('player:moved', { position: [0, 0, 0], distance: 12 })
    bus.emit('dialogue:ended', { npcId: 'guide', dialogueId: 'd', nodeId: 'n' })
    first.engine.dispose()

    const raw = storage.getItem('overworld:quest') as string
    const saved = JSON.parse(raw).state
    expect(saved.completed).toEqual(['talk-to-guide'])
    expect(saved.active['walk-the-city'].objectives).toEqual({
      distance: { current: 12, completed: false },
    })
    expect(saved.definitions).toBeUndefined() // content is never persisted

    const second = setup({ persist: { storage: () => storage }, bus })
    expect(second.engine.isCompleted('talk-to-guide')).toBe(true)
    expect(
      second.engine.getState().active['walk-the-city']?.objectives['distance']?.current
    ).toBe(12)

    // Rehydration re-attached the trigger subscription: finishing the walk works.
    bus.emit('player:moved', { position: [0, 0, 0], distance: 8 })
    expect(second.engine.isCompleted('walk-the-city')).toBe(true)
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
    first.engine.reportProgress('auto', 'o')
    expect(first.engine.isCompleted('auto')).toBe(true)
    first.engine.dispose()

    const second = setup({ quests: [auto], persist: { storage: () => storage }, bus })
    expect(second.engine.isActive('auto')).toBe(false)
    expect(second.engine.isCompleted('auto')).toBe(true)
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
    engine.startQuest('walk-a')
    engine.startQuest('walk-b')
    expect(bus.listenerCount('player:moved')).toBe(1) // one shared handler per event

    bus.emit('player:moved', { position: [0, 0, 0], distance: 10 })
    expect(engine.isCompleted('walk-a')).toBe(true)
    expect(engine.getState().active['walk-b']?.objectives['d']?.current).toBe(10)
  })
})

describe('persist config convention', () => {
  it('is disabled when omitted and enabled via persist: true', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const bus = new EventBus<OverworldEventMap>()
    // omitted -> no persist wrapper -> no `persist` API on the store
    const off = createQuestEngine({
      quests: [],
      conditions: createConditionRegistry(),
      effects: createEffectRegistry(),
      events: bus,
    })
    expect((off.store as unknown as { persist?: unknown }).persist).toBeUndefined()
    const on = createQuestEngine({
      quests: [],
      conditions: createConditionRegistry(),
      effects: createEffectRegistry(),
      events: bus,
      persist: true,
    })
    // In Node the default storage is unavailable — the engine must still be
    // fully functional with the `true` shorthand (normalized to defaults).
    on.registerQuests({ id: 'q', objectives: [{ id: 'o', target: 1 }] })
    expect(on.startQuest('q')).toBe(true)
    on.dispose()
    off.dispose()
    warn.mockRestore()
  })
})
