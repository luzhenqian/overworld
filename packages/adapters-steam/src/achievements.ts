import { gameEvents, type EventBus, type OverworldEventMap } from '@overworld-engine/core'
import type { SteamBridge } from './types'

/**
 * Subscribe a Steam bridge to `achievement:unlocked` on the given bus
 * (default: the global `gameEvents`) and forward every unlock to
 * `steam.unlockAchievement`. Returns an unsubscribe function.
 *
 * Optional glue — this package never imports `@overworld-engine/achievements`;
 * call this yourself after wiring up that package, if your game uses it.
 */
export function bridgeSteamAchievements(
  steam: SteamBridge,
  bus: EventBus<OverworldEventMap> = gameEvents
): () => void {
  return bus.on('achievement:unlocked', ({ achievementId }) => {
    steam.unlockAchievement(achievementId)
  })
}
