import {
  EventBus,
  createEffectRegistry,
  createMemoryStorage,
  type OverworldEventMap,
} from '@overworld-engine/core'
import { describe, expect, it, vi } from 'vitest'
import { createAchievements } from '../createAchievements'
import type { AchievementDefinition } from '../types'

const firstSteps: AchievementDefinition = {
  id: 'first-steps',
  title: 'ach.first_steps',
  trigger: { event: 'player:moved', amountFrom: 'distance', count: 20 },
}

const collector: AchievementDefinition = {
  id: 'potion-collector',
  trigger: { event: 'item:added', filter: { itemId: 'potion' }, count: 3 },
}

const storyteller: AchievementDefinition = {
  id: 'storyteller',
  hidden: true,
  trigger: null,
  rewards: [{ type: 'wallet.addGold', params: { amount: 100 } }],
}

function setup(definitions: AchievementDefinition[] = [firstSteps, collector, storyteller]) {
  const events = new EventBus<OverworldEventMap>()
  const achievements = createAchievements({ definitions, events })
  return { events, achievements }
}

describe('createAchievements', () => {
  describe('event triggers', () => {
    it('unlocks after `count` matching events (default count 1)', () => {
      const events = new EventBus<OverworldEventMap>()
      const achievements = createAchievements({
        definitions: [{ id: 'chatty', trigger: { event: 'dialogue:started' } }],
        events,
      })
      const unlocked = vi.fn()
      events.on('achievement:unlocked', unlocked)

      events.emit('dialogue:started', { npcId: 'bob', dialogueId: 'intro' })
      expect(achievements.isUnlocked('chatty')).toBe(true)
      expect(unlocked).toHaveBeenCalledExactlyOnceWith({ achievementId: 'chatty' })
    })

    it('applies the shallow payload filter', () => {
      const { events, achievements } = setup()

      events.emit('item:added', { itemId: 'sword', quantity: 1, total: 1 })
      expect(achievements.progress('potion-collector').current).toBe(0)

      events.emit('item:added', { itemId: 'potion', quantity: 1, total: 1 })
      events.emit('item:added', { itemId: 'potion', quantity: 1, total: 2 })
      expect(achievements.progress('potion-collector')).toEqual({
        current: 2,
        target: 3,
        unlocked: false,
      })

      events.emit('item:added', { itemId: 'potion', quantity: 1, total: 3 })
      expect(achievements.isUnlocked('potion-collector')).toBe(true)
    })

    it('accumulates numeric progress from amountFrom', () => {
      const { events, achievements } = setup()

      events.emit('player:moved', { position: [0, 0, 0], distance: 8 })
      events.emit('player:moved', { position: [0, 0, 8], distance: 7 })
      expect(achievements.progress('first-steps')).toEqual({
        current: 15,
        target: 20,
        unlocked: false,
      })

      events.emit('player:moved', { position: [0, 0, 15], distance: 5 })
      const progress = achievements.progress('first-steps')
      expect(progress.unlocked).toBe(true)
      expect(progress.current).toBe(20)
      expect(progress.unlockedAt).toBeTypeOf('number')
    })

    it('ignores events with a missing or non-numeric amountFrom value', () => {
      const events = new EventBus<Record<string, unknown>>()
      const achievements = createAchievements({
        definitions: [{ id: 'a', trigger: { event: 'custom', amountFrom: 'value', count: 5 } }],
        events: events as unknown as EventBus<OverworldEventMap>,
      })
      events.emit('custom', { value: 'lots' })
      events.emit('custom', {})
      expect(achievements.progress('a').current).toBe(0)
    })

    it('stops counting once unlocked and never unlocks twice', () => {
      const { events, achievements } = setup()
      const unlocked = vi.fn()
      events.on('achievement:unlocked', unlocked)

      for (let i = 0; i < 5; i++) {
        events.emit('item:added', { itemId: 'potion', quantity: 1, total: i + 1 })
      }
      expect(unlocked).toHaveBeenCalledTimes(1)
      expect(achievements.progress('potion-collector').current).toBe(3)
      expect(achievements.unlock('potion-collector')).toBe(false)
    })
  })

  describe('manual unlock', () => {
    it('unlocks trigger-less achievements and emits the event', () => {
      const { events, achievements } = setup()
      const unlocked = vi.fn()
      events.on('achievement:unlocked', unlocked)

      expect(achievements.unlock('storyteller')).toBe(true)
      expect(achievements.isUnlocked('storyteller')).toBe(true)
      expect(achievements.unlockedIds()).toEqual(['storyteller'])
      expect(unlocked).toHaveBeenCalledExactlyOnceWith({ achievementId: 'storyteller' })
      // Second unlock is a no-op.
      expect(achievements.unlock('storyteller')).toBe(false)
      expect(unlocked).toHaveBeenCalledTimes(1)
    })

    it('rejects unknown ids', () => {
      const { achievements } = setup()
      expect(achievements.unlock('nope')).toBe(false)
    })

    it('reports trigger-less progress as 0/1 then 1/1', () => {
      const { achievements } = setup()
      expect(achievements.progress('storyteller')).toEqual({
        current: 0,
        target: 1,
        unlocked: false,
      })
      achievements.unlock('storyteller')
      expect(achievements.progress('storyteller')).toMatchObject({
        current: 1,
        target: 1,
        unlocked: true,
      })
    })
  })

  describe('rewards', () => {
    it('runs reward effects through the registry with the configured context', () => {
      const addGold = vi.fn()
      const context = { save: 'slot-1' }
      const effects = createEffectRegistry<typeof context>()
      effects.register('wallet.addGold', addGold)
      const events = new EventBus<OverworldEventMap>()
      const achievements = createAchievements({
        definitions: [storyteller],
        effects,
        context,
        events,
      })

      achievements.unlock('storyteller')
      expect(addGold).toHaveBeenCalledExactlyOnceWith({ amount: 100 }, context)
    })

    it('survives an unregistered reward type (warns, does not throw)', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const { achievements } = setup()
      expect(achievements.unlock('storyteller')).toBe(true)
      expect(warn).toHaveBeenCalled()
      warn.mockRestore()
    })
  })

  describe('registration', () => {
    it('registers new achievements at runtime with live triggers', () => {
      const { events, achievements } = setup([])
      achievements.registerAchievements([collector])
      expect(achievements.definitions()).toHaveLength(1)
      expect(achievements.getDefinition('potion-collector')?.trigger?.count).toBe(3)

      for (let i = 0; i < 3; i++) {
        events.emit('item:added', { itemId: 'potion', quantity: 1, total: i + 1 })
      }
      expect(achievements.isUnlocked('potion-collector')).toBe(true)
    })

    it('rewires the trigger when a definition is replaced', () => {
      const { events, achievements } = setup([collector])
      achievements.registerAchievements([
        { ...collector, trigger: { event: 'item:used', count: 1 } },
      ])
      // Old subscription must be gone: item:added no longer counts.
      events.emit('item:added', { itemId: 'potion', quantity: 1, total: 1 })
      expect(achievements.progress('potion-collector').current).toBe(0)

      events.emit('item:used', { itemId: 'potion' })
      expect(achievements.isUnlocked('potion-collector')).toBe(true)
    })
  })

  describe('persistence', () => {
    it('round-trips progress and unlocks, and keeps counting after rehydration', () => {
      const storage = createMemoryStorage()
      const persistConfig = { name: 'ach-test', storage: () => storage }

      const firstBus = new EventBus<OverworldEventMap>()
      const first = createAchievements({
        definitions: [firstSteps, collector, storyteller],
        events: firstBus,
        persist: persistConfig,
      })
      firstBus.emit('player:moved', { position: [0, 0, 0], distance: 12 })
      first.unlock('storyteller')
      first.dispose()

      const secondBus = new EventBus<OverworldEventMap>()
      const second = createAchievements({
        definitions: [firstSteps, collector, storyteller],
        events: secondBus,
        persist: persistConfig,
      })
      // State survived the round-trip.
      expect(second.isUnlocked('storyteller')).toBe(true)
      expect(second.progress('first-steps').current).toBe(12)

      // Subscriptions still work: progress continues from the restored value.
      secondBus.emit('player:moved', { position: [0, 0, 12], distance: 8 })
      expect(second.isUnlocked('first-steps')).toBe(true)
    })
  })

  describe('dispose', () => {
    it('unsubscribes every trigger from the bus', () => {
      const { events, achievements } = setup()
      expect(events.listenerCount('player:moved')).toBe(1)
      expect(events.listenerCount('item:added')).toBe(1)

      achievements.dispose()
      expect(events.listenerCount('player:moved')).toBe(0)
      expect(events.listenerCount('item:added')).toBe(0)

      events.emit('player:moved', { position: [0, 0, 0], distance: 999 })
      expect(achievements.progress('first-steps').current).toBe(0)
    })
  })
})
