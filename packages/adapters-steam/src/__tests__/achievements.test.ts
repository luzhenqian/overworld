import { describe, expect, it, vi } from 'vitest'
import { EventBus, type OverworldEventMap } from '@overworld-engine/core'
import { bridgeSteamAchievements } from '../achievements'
import type { SteamBridge } from '../types'

function makeFakeSteamBridge(): SteamBridge {
  return {
    isAvailable: () => true,
    ready: vi.fn(async () => true),
    unlockAchievement: vi.fn(),
    clearAchievement: vi.fn(),
    setStat: vi.fn(),
    cloudStorage: () => undefined,
    setRichPresence: vi.fn(),
    clearRichPresence: vi.fn(),
  }
}

describe('bridgeSteamAchievements', () => {
  it('forwards achievement:unlocked to steam.unlockAchievement', () => {
    const bus = new EventBus<OverworldEventMap>()
    const steam = makeFakeSteamBridge()

    bridgeSteamAchievements(steam, bus)
    bus.emit('achievement:unlocked', { achievementId: 'FIRST_KILL' })

    expect(steam.unlockAchievement).toHaveBeenCalledWith('FIRST_KILL')
  })

  it('returns an unsubscribe function', () => {
    const bus = new EventBus<OverworldEventMap>()
    const steam = makeFakeSteamBridge()

    const unbind = bridgeSteamAchievements(steam, bus)
    unbind()
    bus.emit('achievement:unlocked', { achievementId: 'FIRST_KILL' })

    expect(steam.unlockAchievement).not.toHaveBeenCalled()
  })

  it('defaults to the global gameEvents bus when none is given', async () => {
    const { gameEvents } = await import('@overworld-engine/core')
    const steam = makeFakeSteamBridge()

    const unbind = bridgeSteamAchievements(steam)
    gameEvents.emit('achievement:unlocked', { achievementId: 'GLOBAL_BUS' })
    unbind()

    expect(steam.unlockAchievement).toHaveBeenCalledWith('GLOBAL_BUS')
  })
})
