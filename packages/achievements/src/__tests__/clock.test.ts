import { EventBus, type OverworldEventMap } from '@overworld-engine/core'
import { describe, expect, it } from 'vitest'
import { createAchievements } from '../createAchievements'

describe('clock injection', () => {
  it('stamps unlockedAt from the injected clock', () => {
    let t = 1000
    const events = new EventBus<OverworldEventMap>()
    const achievements = createAchievements({
      definitions: [
        { id: 'manual', trigger: null },
        { id: 'triggered', trigger: { event: 'dialogue:started' } },
      ],
      events,
      clock: () => t,
    })

    achievements.unlock('manual')
    expect(achievements.progress('manual').unlockedAt).toBe(1000)
    expect(achievements.store.getState().unlocked['manual']).toBe(1000)

    t = 2500
    events.emit('dialogue:started', { npcId: 'bob', dialogueId: 'intro' })
    expect(achievements.progress('triggered').unlockedAt).toBe(2500)
  })

  it('replaying the same events with the same clock yields identical state', () => {
    const run = () => {
      let t = 1000
      const events = new EventBus<OverworldEventMap>()
      const achievements = createAchievements({
        definitions: [{ id: 'chatty', trigger: { event: 'dialogue:started', count: 2 } }],
        events,
        clock: () => t,
      })
      events.emit('dialogue:started', { npcId: 'a', dialogueId: 'x' })
      t = 1100
      events.emit('dialogue:started', { npcId: 'a', dialogueId: 'x' })
      return achievements.store.getState()
    }
    expect(JSON.stringify(run())).toBe(JSON.stringify(run()))
  })
})
