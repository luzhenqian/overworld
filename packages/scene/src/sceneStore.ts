/**
 * Generic scene state: which scene is active and which NPC/building the
 * player is currently near. Scene ids are plain strings owned by the game.
 *
 * `setScene` emits `scene:changed` on the global event bus so other systems
 * (audio, quests, analytics, ...) can react without importing this store.
 */
import { create } from 'zustand'
import { gameEvents } from '@overworld-engine/core'

export interface SceneState {
  /** Active scene id, or null before the first `setScene` call. */
  currentScene: string | null
  /** Id of the NPC the player is currently near, or null. */
  nearbyNpcId: string | null
  /** Id of the building the player is currently near, or null. */
  nearbyBuildingId: string | null

  /**
   * Switch to another scene. Clears nearby entities and emits
   * `scene:changed` on the bus. No-op when the scene is already active.
   */
  setScene: (id: string) => void
  setNearbyNpc: (id: string | null) => void
  setNearbyBuilding: (id: string | null) => void
}

export const useSceneStore = create<SceneState>((set, get) => ({
  currentScene: null,
  nearbyNpcId: null,
  nearbyBuildingId: null,

  setScene: (id) => {
    const from = get().currentScene
    if (from === id) return
    set({ currentScene: id, nearbyNpcId: null, nearbyBuildingId: null })
    gameEvents.emit('scene:changed', { from, to: id })
  },

  setNearbyNpc: (id) => set({ nearbyNpcId: id }),

  setNearbyBuilding: (id) => set({ nearbyBuildingId: id }),
}))
