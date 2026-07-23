import { invoke } from '@tauri-apps/api/core'
import { createSteamCloudStorage } from './cloudStorage'
import type { SteamBridge, SteamFlushableStorage } from './types'

/**
 * Invoke a command on the `overworld-steam` Tauri plugin. Every failure
 * (no Tauri context, plugin not registered, IPC error) is swallowed and
 * logged — callers treat `undefined` as "not available right now" rather
 * than propagating exceptions into game code.
 */
async function callInvoke<T>(
  command: string,
  args?: Record<string, unknown>
): Promise<T | undefined> {
  try {
    return await invoke<T>(`plugin:steam|${command}`, args)
  } catch (error) {
    console.error(`[overworld] adapters-steam: "${command}" failed`, error)
    return undefined
  }
}

/**
 * Create a Steam capability bridge. Call {@link SteamBridge.ready} once at
 * startup and await it before using the rest of the API — every method is a
 * silent no-op until then, and stays a no-op forever outside Steam.
 */
export function createSteamBridge(): SteamBridge {
  let available = false
  let cloudStorage: SteamFlushableStorage | undefined

  return {
    isAvailable: () => available,

    async ready() {
      const result = await callInvoke<boolean>('steam_is_available')
      available = result === true
      if (available) {
        cloudStorage = await createSteamCloudStorage(callInvoke)
      }
      return available
    },

    unlockAchievement(id) {
      if (!available) return
      void callInvoke('steam_unlock_achievement', { id })
    },

    clearAchievement(id) {
      if (!available) return
      void callInvoke('steam_clear_achievement', { id })
    },

    setStat(name, value) {
      if (!available) return
      void callInvoke('steam_set_stat', { name, value })
    },

    cloudStorage: () => cloudStorage,

    setRichPresence(key, value) {
      if (!available) return
      void callInvoke('steam_set_rich_presence', { key, value })
    },

    clearRichPresence() {
      if (!available) return
      void callInvoke('steam_clear_rich_presence')
    },
  }
}
