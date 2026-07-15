import { create } from 'zustand'

/**
 * Keyboard priority system.
 *
 * Higher priority layers block lower priority key handling. When a
 * modal/overlay is active, it registers a layer at its priority level and
 * lower-priority handlers stop receiving (blocked) keys.
 *
 * Default priority levels (highest to lowest):
 * - 100: System modals (alerts, confirmations)
 * - 90:  Tutorial overlay
 * - 80:  Event notifications
 * - 75:  Quiz/assessment overlays
 * - 70:  NPC dialogue
 * - 60:  Side panels
 * - 50:  Quick actions
 * - 10:  Game controls (movement, interactions)
 * - 0:   Default (no special handling)
 *
 * These are defaults — games may use any numeric priority.
 */
export const KEYBOARD_PRIORITY = {
  SYSTEM_MODAL: 100,
  TUTORIAL: 90,
  EVENT_NOTIFICATION: 80,
  QUIZ: 75,
  NPC_DIALOGUE: 70,
  SIDE_PANEL: 60,
  QUICK_ACTION: 50,
  GAME_CONTROLS: 10,
  DEFAULT: 0,
} as const

/** An active keyboard layer. */
export type KeyboardLayer = {
  /** Unique layer id; re-registering the same id replaces the layer. */
  id: string
  /** Layers with higher priority block handlers running at lower priority. */
  priority: number
  /**
   * If specified, only these keys (lowercase) are blocked for lower-priority
   * handlers. If not specified, all keys are blocked.
   */
  blockedKeys?: string[]
}

interface KeyboardState {
  /** Active layers, sorted by priority descending. */
  activeLayers: KeyboardLayer[]

  /** Register (or replace) a layer. */
  registerLayer: (layer: KeyboardLayer) => void
  /** Remove a layer by id. */
  unregisterLayer: (id: string) => void
  /** Whether `key` is blocked for a handler running at `forPriority`. */
  isKeyBlocked: (key: string, forPriority?: number) => boolean
  /** Highest priority among active layers (DEFAULT when none). */
  getActiveMaxPriority: () => number
  /** Whether a handler at `handlerPriority` should handle `key`. */
  shouldHandleKey: (key: string, handlerPriority: number) => boolean
}

/**
 * Global keyboard layer store. UI overlays register layers while mounted;
 * key handlers consult `shouldHandleKey` before acting.
 */
export const useKeyboardStore = create<KeyboardState>()((set, get) => ({
  activeLayers: [],

  registerLayer: (layer) => {
    set((state) => ({
      activeLayers: [...state.activeLayers.filter((l) => l.id !== layer.id), layer].sort(
        (a, b) => b.priority - a.priority
      ),
    }))
  },

  unregisterLayer: (id) => {
    set((state) => ({
      activeLayers: state.activeLayers.filter((l) => l.id !== id),
    }))
  },

  isKeyBlocked: (key, forPriority = KEYBOARD_PRIORITY.DEFAULT) => {
    const { activeLayers } = get()

    // Check if any higher priority layer blocks this key. Layers are sorted
    // by priority descending, so we can stop at the first non-higher layer.
    for (const layer of activeLayers) {
      if (layer.priority <= forPriority) break

      // If blockedKeys is not specified, all keys are blocked.
      if (!layer.blockedKeys) return true

      // If blockedKeys is specified, check if this key is in the list.
      if (layer.blockedKeys.includes(key.toLowerCase())) return true
    }

    return false
  },

  getActiveMaxPriority: () => {
    const { activeLayers } = get()
    return activeLayers.length > 0 ? activeLayers[0]!.priority : KEYBOARD_PRIORITY.DEFAULT
  },

  shouldHandleKey: (key, handlerPriority) => {
    const { isKeyBlocked } = get()
    return !isKeyBlocked(key, handlerPriority)
  },
}))
