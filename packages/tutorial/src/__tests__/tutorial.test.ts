import { EventBus, createMemoryStorage, type OverworldEventMap } from '@overworld-engine/core'
import { describe, expect, it, vi } from 'vitest'
import { createTutorial } from '../createTutorial'
import type { TutorialDefinition } from '../types'

const basics: TutorialDefinition = {
  id: 'basics',
  steps: [
    { id: 'welcome', content: 'tutorial.basics.welcome' },
    {
      id: 'move',
      content: 'tutorial.basics.move',
      advanceOn: { event: 'player:moved' },
    },
    {
      id: 'talk',
      content: 'tutorial.basics.talk',
      target: '#npc-bob',
      advanceOn: { event: 'dialogue:started', filter: { npcId: 'bob' } },
    },
  ],
}

const manualOnly: TutorialDefinition = {
  id: 'manual',
  steps: [{ id: 'one' }, { id: 'two' }],
}

function setup(tutorials: TutorialDefinition[] = [basics, manualOnly]) {
  const events = new EventBus<OverworldEventMap>()
  const tutorial = createTutorial({ tutorials, events })
  return { events, tutorial }
}

describe('createTutorial', () => {
  describe('start / next', () => {
    it('starts at the first step and emits tutorial:step-changed', () => {
      const { events, tutorial } = setup()
      const stepChanged = vi.fn()
      events.on('tutorial:step-changed', stepChanged)

      expect(tutorial.start('basics')).toBe(true)
      expect(tutorial.activeTutorial()?.id).toBe('basics')
      expect(tutorial.stepIndex()).toBe(0)
      expect(tutorial.currentStep()?.id).toBe('welcome')
      expect(stepChanged).toHaveBeenCalledExactlyOnceWith({
        tutorialId: 'basics',
        stepId: 'welcome',
        stepIndex: 0,
      })
    })

    it('rejects unknown tutorial ids', () => {
      const { tutorial } = setup()
      expect(tutorial.start('nope')).toBe(false)
      expect(tutorial.activeTutorial()).toBeNull()
    })

    it('advances manually and completes from the last step', () => {
      const { events, tutorial } = setup()
      const completed = vi.fn()
      events.on('tutorial:completed', completed)

      tutorial.start('manual')
      tutorial.next()
      expect(tutorial.currentStep()?.id).toBe('two')
      expect(completed).not.toHaveBeenCalled()

      tutorial.next()
      expect(tutorial.activeTutorial()).toBeNull()
      expect(tutorial.currentStep()).toBeNull()
      expect(tutorial.isCompleted('manual')).toBe(true)
      expect(tutorial.getStatus('manual')).toBe('completed')
      expect(completed).toHaveBeenCalledExactlyOnceWith({ tutorialId: 'manual' })
    })

    it('next() is a no-op while idle', () => {
      const { tutorial } = setup()
      expect(() => tutorial.next()).not.toThrow()
      expect(tutorial.stepIndex()).toBe(0)
    })

    it('completes an empty tutorial immediately', () => {
      const { events, tutorial } = setup([{ id: 'empty', steps: [] }])
      const completed = vi.fn()
      events.on('tutorial:completed', completed)
      expect(tutorial.start('empty')).toBe(true)
      expect(tutorial.activeTutorial()).toBeNull()
      expect(tutorial.isCompleted('empty')).toBe(true)
      expect(completed).toHaveBeenCalledExactlyOnceWith({ tutorialId: 'empty' })
    })
  })

  describe('auto-advance', () => {
    it('advances when the advanceOn event matches the filter', () => {
      const { events, tutorial } = setup()
      tutorial.start('basics')
      tutorial.next() // -> 'move' (advanceOn player:moved)

      events.emit('player:moved', { position: [1, 0, 0], distance: 1 })
      expect(tutorial.currentStep()?.id).toBe('talk')

      // Filtered: the wrong NPC does not advance.
      events.emit('dialogue:started', { npcId: 'alice', dialogueId: 'hello' })
      expect(tutorial.currentStep()?.id).toBe('talk')

      events.emit('dialogue:started', { npcId: 'bob', dialogueId: 'hello' })
      expect(tutorial.activeTutorial()).toBeNull()
      expect(tutorial.isCompleted('basics')).toBe(true)
    })

    it('subscribes only while a step with advanceOn is active', () => {
      const { events, tutorial } = setup()
      expect(events.listenerCount('player:moved')).toBe(0)

      tutorial.start('basics') // 'welcome' has no advanceOn
      expect(events.listenerCount('player:moved')).toBe(0)

      tutorial.next() // 'move' listens to player:moved
      expect(events.listenerCount('player:moved')).toBe(1)

      tutorial.next() // 'talk' listens to dialogue:started instead
      expect(events.listenerCount('player:moved')).toBe(0)
      expect(events.listenerCount('dialogue:started')).toBe(1)

      tutorial.next() // completed — everything released
      expect(events.listenerCount('dialogue:started')).toBe(0)
    })

    it('ignores stale events for steps advanced past manually', () => {
      const { events, tutorial } = setup()
      tutorial.start('basics')
      tutorial.next() // 'move'
      tutorial.next() // 'talk' — player:moved listener must be gone

      events.emit('player:moved', { position: [0, 0, 0], distance: 5 })
      expect(tutorial.currentStep()?.id).toBe('talk')
    })
  })

  describe('skip', () => {
    it('aborts, marks skipped, and does not count as completed', () => {
      const { events, tutorial } = setup()
      const completed = vi.fn()
      events.on('tutorial:completed', completed)

      tutorial.start('basics')
      tutorial.next() // 'move' — has an active listener
      tutorial.skip()

      expect(tutorial.activeTutorial()).toBeNull()
      expect(tutorial.getStatus('basics')).toBe('skipped')
      expect(tutorial.isCompleted('basics')).toBe(false)
      expect(completed).not.toHaveBeenCalled()
      // The advanceOn listener was released.
      expect(events.listenerCount('player:moved')).toBe(0)
    })

    it('a later full run upgrades a skipped tutorial to completed', () => {
      const { tutorial } = setup()
      tutorial.start('manual')
      tutorial.skip()
      expect(tutorial.getStatus('manual')).toBe('skipped')

      tutorial.start('manual')
      tutorial.next()
      tutorial.next()
      expect(tutorial.getStatus('manual')).toBe('completed')
    })
  })

  describe('persistence', () => {
    it('round-trips completion states (but not the running session)', () => {
      const storage = createMemoryStorage()
      const persistConfig = { name: 'tut-test', storage: () => storage }

      const firstBus = new EventBus<OverworldEventMap>()
      const first = createTutorial({
        tutorials: [basics, manualOnly],
        events: firstBus,
        persist: persistConfig,
      })
      first.start('manual')
      first.next()
      first.next() // completed
      first.start('basics')
      first.skip()
      first.start('basics') // left running — must not be persisted
      first.dispose()

      const second = createTutorial({
        tutorials: [basics, manualOnly],
        events: new EventBus<OverworldEventMap>(),
        persist: persistConfig,
      })
      expect(second.isCompleted('manual')).toBe(true)
      expect(second.getStatus('basics')).toBe('skipped')
      expect(second.activeTutorial()).toBeNull()
      expect(second.stepIndex()).toBe(0)
    })
  })

  describe('registration and dispose', () => {
    it('registers tutorials at runtime', () => {
      const { tutorial } = setup([])
      expect(tutorial.start('basics')).toBe(false)
      tutorial.registerTutorials([basics])
      expect(tutorial.getDefinition('basics')?.steps).toHaveLength(3)
      expect(tutorial.start('basics')).toBe(true)
    })

    it('dispose releases the active advanceOn subscription', () => {
      const { events, tutorial } = setup()
      tutorial.start('basics')
      tutorial.next() // 'move' subscribes to player:moved
      expect(events.listenerCount('player:moved')).toBe(1)

      tutorial.dispose()
      expect(events.listenerCount('player:moved')).toBe(0)
      events.emit('player:moved', { position: [0, 0, 0], distance: 1 })
      expect(tutorial.currentStep()?.id).toBe('move')
    })
  })
})
