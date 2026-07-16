import type { EntityKind, Vec3 } from './types'

/**
 * All framework-level events, keyed by name.
 *
 * Games extend this map via declaration merging:
 *
 * ```ts
 * declare module '@overworld/core' {
 *   interface OverworldEventMap {
 *     'market:trade': { symbol: string; amount: number }
 *   }
 * }
 * ```
 */
export interface OverworldEventMap {
  'player:moved': { position: Vec3; distance: number }
  'scene:changed': { from: string | null; to: string }
  'proximity:enter': { kind: EntityKind; id: string }
  'proximity:leave': { kind: EntityKind; id: string }
  'entity:interact': { kind: EntityKind; id: string }
  /**
   * @deprecated Use `'entity:interact'` instead. This is the legacy,
   * unprefixed name; `@overworld/scene`'s `interact()` emits both during the
   * transition. The legacy emit (and this entry) will be removed in 2.0.
   */
  interact: { kind: EntityKind; id: string }
  'dialogue:started': { npcId: string; dialogueId: string }
  'dialogue:ended': { npcId: string; dialogueId: string; nodeId: string }
  'quest:started': { questId: string }
  'quest:objective-progress': {
    questId: string
    objectiveId: string
    current: number
    target: number
  }
  'quest:objective-completed': { questId: string; objectiveId: string }
  'quest:completed': { questId: string }
  'item:added': { itemId: string; quantity: number; total: number }
  'item:removed': { itemId: string; quantity: number; total: number }
  'item:used': { itemId: string }
  'achievement:unlocked': { achievementId: string }
  'tutorial:step-changed': { tutorialId: string; stepId: string; stepIndex: number }
  'tutorial:completed': { tutorialId: string }
}

type Listener<P> = (payload: P) => void
type AnyListener<M extends object> = <K extends keyof M>(event: K, payload: M[K]) => void

/**
 * Minimal typed pub/sub bus. All cross-system communication in Overworld
 * goes through a bus instead of direct store imports, so systems stay
 * independent and games can react to (or synthesize) any event.
 */
export class EventBus<M extends object> {
  private listeners = new Map<keyof M, Set<Listener<never>>>()
  private anyListeners = new Set<AnyListener<M>>()

  /** Subscribe. Returns an unsubscribe function. */
  on<K extends keyof M>(event: K, fn: Listener<M[K]>): () => void {
    let set = this.listeners.get(event)
    if (!set) {
      set = new Set()
      this.listeners.set(event, set)
    }
    set.add(fn as Listener<never>)
    return () => this.off(event, fn)
  }

  /** Subscribe for a single emission. Returns an unsubscribe function. */
  once<K extends keyof M>(event: K, fn: Listener<M[K]>): () => void {
    const wrapper: Listener<M[K]> = (payload) => {
      this.off(event, wrapper)
      fn(payload)
    }
    return this.on(event, wrapper)
  }

  off<K extends keyof M>(event: K, fn: Listener<M[K]>): void {
    this.listeners.get(event)?.delete(fn as Listener<never>)
  }

  /**
   * Subscribe to every event (debug overlays, analytics, replay recording).
   * Returns an unsubscribe function.
   */
  onAny(fn: AnyListener<M>): () => void {
    this.anyListeners.add(fn)
    return () => this.anyListeners.delete(fn)
  }

  emit<K extends keyof M>(event: K, payload: M[K]): void {
    const set = this.listeners.get(event)
    if (set) {
      // Copy so listeners that unsubscribe (or subscribe) mid-emit don't
      // affect this emission.
      for (const fn of [...set]) {
        try {
          ;(fn as Listener<M[K]>)(payload)
        } catch (error) {
          console.error(`[overworld] listener for "${String(event)}" threw`, error)
        }
      }
    }
    for (const fn of [...this.anyListeners]) {
      try {
        fn(event, payload)
      } catch (error) {
        console.error(`[overworld] onAny listener threw for "${String(event)}"`, error)
      }
    }
  }

  listenerCount(event: keyof M): number {
    return this.listeners.get(event)?.size ?? 0
  }

  /** Remove listeners for one event, or all listeners when omitted. */
  clear(event?: keyof M): void {
    if (event) {
      this.listeners.delete(event)
    } else {
      this.listeners.clear()
      this.anyListeners.clear()
    }
  }
}

/**
 * The default global bus shared by all Overworld systems. Engines accept a
 * custom bus in their config; this singleton is the zero-config default.
 */
export const gameEvents = new EventBus<OverworldEventMap>()

/** Name of any event on the (possibly game-extended) framework event map. */
export type OverworldEventName = keyof OverworldEventMap
