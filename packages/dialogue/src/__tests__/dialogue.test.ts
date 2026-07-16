import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  EventBus,
  createConditionRegistry,
  createEffectRegistry,
  createMemoryStorage,
  type OverworldEventMap,
} from '@overworld/core'
import type { StateStorage } from 'zustand/middleware'
import { createDialogueEngine, type DialogueEngine } from '../engine'
import { relationshipEffects } from '../effects'
import type { DialogueTree } from '../types'

interface TestCtx {
  level: number
  log: string[]
}

const GUIDE_TREE: DialogueTree = {
  id: 'guide-intro',
  startNodeId: 'greeting',
  nodes: [
    {
      id: 'greeting',
      speaker: 'guide',
      text: 'dialogues.guide.greeting',
      effects: [{ type: 'log', params: { tag: 'enter-greeting' } }],
      responses: [
        { id: 'ask', text: 'dialogues.guide.ask', next: 'about' },
        {
          id: 'vip',
          text: 'dialogues.guide.vip',
          conditions: [{ type: 'minLevel', params: { level: 5 } }],
          next: 'vip-room',
        },
        {
          id: 'bye',
          text: 'dialogues.guide.bye',
          effects: [{ type: 'log', params: { tag: 'bye' } }],
        },
      ],
    },
    { id: 'about', text: 'dialogues.guide.about', next: 'outro' },
    { id: 'outro', text: 'dialogues.guide.outro', endsDialogue: true },
    { id: 'vip-room', text: 'dialogues.guide.vip_room' },
  ],
}

function setup(options?: {
  persist?: false | { name?: string; storage?: () => StateStorage }
  level?: number
}) {
  const bus = new EventBus<OverworldEventMap>()
  const ctx: TestCtx = { level: options?.level ?? 1, log: [] }
  const conditions = createConditionRegistry<TestCtx>()
  const effects = createEffectRegistry<TestCtx>()
  conditions.register('minLevel', (params, c) => c.level >= (params.level as number))
  effects.register('log', (params, c) => {
    c.log.push(params.tag as string)
  })
  const engine = createDialogueEngine<TestCtx>({
    dialogues: [GUIDE_TREE],
    conditions,
    effects,
    context: () => ctx,
    events: bus,
    persist: options?.persist ?? false,
  })
  return { bus, ctx, conditions, effects, engine }
}

describe('createDialogueEngine', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  it('starts a dialogue: sets state, emits dialogue:started, marks seen, runs node effects', () => {
    const { bus, ctx, engine } = setup()
    const started: unknown[] = []
    bus.on('dialogue:started', (p) => started.push(p))

    expect(engine.start('guide-intro', 'guide')).toBe(true)

    const state = engine.getState()
    expect(state.activeDialogue).toEqual({
      dialogueId: 'guide-intro',
      npcId: 'guide',
      nodeId: 'greeting',
      history: [],
    })
    expect(state.currentNode?.id).toBe('greeting')
    expect(started).toEqual([{ npcId: 'guide', dialogueId: 'guide-intro' }])
    expect(engine.hasSeen('guide-intro')).toBe(true)
    expect(engine.hasCompleted('guide-intro')).toBe(false)
    expect(ctx.log).toEqual(['enter-greeting'])
  })

  it('returns false (and warns) for an unknown dialogue id', () => {
    const { engine } = setup()
    expect(engine.start('nope')).toBe(false)
    expect(console.warn).toHaveBeenCalledWith('[overworld] unknown dialogue "nope"')
    expect(engine.getState().activeDialogue).toBeNull()
  })

  it('filters availableResponses by conditions against the resolved context', () => {
    const { ctx, engine } = setup({ level: 1 })
    engine.start('guide-intro')
    expect(engine.getState().availableResponses.map((r) => r.id)).toEqual(['ask', 'bye'])

    // Context is resolved lazily — leveling up before re-entering the node
    // makes the gated response appear.
    ctx.level = 5
    engine.end()
    engine.start('guide-intro')
    expect(engine.getState().availableResponses.map((r) => r.id)).toEqual(['ask', 'vip', 'bye'])
  })

  it('choose() follows next and records history', () => {
    const { engine } = setup()
    engine.start('guide-intro', 'guide')
    expect(engine.choose('ask')).toBe(true)

    const state = engine.getState()
    expect(state.currentNode?.id).toBe('about')
    expect(state.activeDialogue?.history).toEqual(['greeting'])
    expect(state.availableResponses).toEqual([])
  })

  it('choose() without next runs effects and ends the dialogue as completed', () => {
    const { bus, ctx, engine } = setup()
    const ended: unknown[] = []
    bus.on('dialogue:ended', (p) => ended.push(p))

    engine.start('guide-intro', 'guide')
    expect(engine.choose('bye')).toBe(true)

    const state = engine.getState()
    expect(ctx.log).toEqual(['enter-greeting', 'bye'])
    expect(state.activeDialogue).toBeNull()
    expect(state.currentNode).toBeNull()
    expect(engine.hasCompleted('guide-intro')).toBe(true)
    expect(ended).toEqual([{ npcId: 'guide', dialogueId: 'guide-intro', nodeId: 'greeting' }])
  })

  it('rejects choosing a response that conditions filtered out', () => {
    const { engine } = setup({ level: 1 })
    engine.start('guide-intro')
    expect(engine.choose('vip')).toBe(false)
    expect(engine.getState().currentNode?.id).toBe('greeting')
    expect(engine.choose('unknown-response')).toBe(false)
  })

  it('advance() walks linear nodes and completes on terminal nodes', () => {
    const { bus, engine } = setup()
    const ended: { nodeId: string }[] = []
    bus.on('dialogue:ended', (p) => ended.push(p))

    engine.start('guide-intro')
    // advance() is a no-op while a choice is pending
    expect(engine.advance()).toBe(false)

    engine.choose('ask')
    expect(engine.advance()).toBe(true) // about -> outro
    expect(engine.getState().currentNode?.id).toBe('outro')
    expect(engine.advance()).toBe(true) // outro endsDialogue

    expect(engine.getState().activeDialogue).toBeNull()
    expect(engine.hasCompleted('guide-intro')).toBe(true)
    expect(ended[0]?.nodeId).toBe('outro')
    expect(engine.getState().activeDialogue?.history).toBeUndefined()
  })

  it('end() mid-dialogue emits dialogue:ended without marking completion', () => {
    const { bus, engine } = setup()
    const ended: unknown[] = []
    bus.on('dialogue:ended', (p) => ended.push(p))

    engine.start('guide-intro', 'guide')
    engine.end()

    expect(ended).toEqual([{ npcId: 'guide', dialogueId: 'guide-intro', nodeId: 'greeting' }])
    expect(engine.hasCompleted('guide-intro')).toBe(false)
    expect(engine.hasSeen('guide-intro')).toBe(true)
  })

  it('end() on a terminal node still counts as completing the dialogue', () => {
    const { engine } = setup()
    engine.start('guide-intro')
    engine.choose('ask')
    engine.advance() // -> outro (endsDialogue)
    engine.end()
    expect(engine.hasCompleted('guide-intro')).toBe(true)
  })

  it('starting a new dialogue while one is active ends the previous one first', () => {
    const { bus, engine } = setup()
    const ended: { dialogueId: string }[] = []
    bus.on('dialogue:ended', (p) => ended.push(p))

    engine.registerDialogues({
      id: 'other',
      startNodeId: 'a',
      nodes: [{ id: 'a', text: 'hi' }],
    })
    engine.start('guide-intro', 'guide')
    engine.start('other')

    expect(ended.map((e) => e.dialogueId)).toEqual(['guide-intro'])
    expect(engine.getState().activeDialogue?.dialogueId).toBe('other')
  })

  it('adjustRelationship accumulates and relationshipEffects wires it into the registry', () => {
    const bus = new EventBus<OverworldEventMap>()
    const conditions = createConditionRegistry()
    const effects = createEffectRegistry()
    const tree: DialogueTree = {
      id: 'affinity',
      startNodeId: 'a',
      nodes: [
        {
          id: 'a',
          text: 'hello',
          responses: [
            {
              id: 'flatter',
              text: 'nice hat',
              effects: [
                { type: 'dialogue.adjustRelationship', params: { npcId: 'guide', delta: 5 } },
              ],
            },
          ],
        },
      ],
    }
    const engine: DialogueEngine = createDialogueEngine({
      dialogues: [tree],
      conditions,
      effects,
      events: bus,
      persist: false,
    })
    effects.registerAll(relationshipEffects(engine))

    engine.adjustRelationship('guide', 2)
    engine.start('affinity', 'guide')
    engine.choose('flatter')

    expect(engine.getState().relationships['guide']).toBe(7)
  })

  it('relationshipEffects warns on malformed params instead of throwing', () => {
    const { engine } = setup()
    const handlers = relationshipEffects(engine)
    handlers['dialogue.adjustRelationship']({ npcId: 42 }, undefined)
    expect(console.warn).toHaveBeenCalled()
    expect(engine.getState().relationships).toEqual({})
  })

  it('exposes the vanilla store: getState() matches and subscribe() sees transitions', () => {
    const { engine } = setup()
    const nodeIds: (string | null)[] = []
    const unsubscribe = engine.store.subscribe((state) => {
      nodeIds.push(state.currentNode?.id ?? null)
    })

    engine.start('guide-intro')
    expect(engine.store.getState()).toBe(engine.getState())
    expect(engine.store.getState().currentNode?.id).toBe('greeting')

    engine.choose('ask')
    unsubscribe()
    engine.advance()

    // seen-flag update + node entry, then the transition to 'about'.
    expect(nodeIds).toEqual([null, 'greeting', 'about'])
  })

  it('persists relationships and seen/completed flags but never the active conversation', () => {
    const storage = createMemoryStorage()
    const first = setup({ persist: { storage: () => storage } })
    first.engine.adjustRelationship('guide', 3)
    first.engine.start('guide-intro', 'guide')
    first.engine.choose('bye') // completes guide-intro
    first.engine.start('guide-intro', 'guide') // leave a conversation in flight

    const raw = storage.getItem('overworld:dialogue') as string
    expect(JSON.parse(raw).state).toEqual({
      relationships: { guide: 3 },
      seenDialogues: ['guide-intro'],
      completedDialogues: ['guide-intro'],
    })

    const second = setup({ persist: { storage: () => storage } })
    const state = second.engine.getState()
    expect(state.relationships).toEqual({ guide: 3 })
    expect(second.engine.hasSeen('guide-intro')).toBe(true)
    expect(second.engine.hasCompleted('guide-intro')).toBe(true)
    expect(state.activeDialogue).toBeNull()
    expect(state.currentNode).toBeNull()
  })

  it('supports a custom persist name', () => {
    const storage = createMemoryStorage()
    setup({ persist: { name: 'npc-talk', storage: () => storage } }).engine.adjustRelationship(
      'x',
      1
    )
    expect(storage.getItem('overworld:npc-talk')).not.toBeNull()
  })
})
