import type { EventBus } from '@overworld-engine/core'
import { track, type AnalyticsParams } from './analytics'

/** Options for {@link bindAnalyticsToBus}. */
export interface BindAnalyticsOptions<M extends object> {
  /** Only forward these events. Omit to forward every event on the bus. */
  events?: (keyof M)[]
}

/**
 * Auto-track framework events: every (optionally filtered) event emitted on
 * the bus is forwarded to `track(eventName, payload)`. Returns an
 * unsubscribe function.
 *
 * ```ts
 * const unbind = bindAnalyticsToBus(gameEvents, {
 *   events: ['quest:completed', 'achievement:unlocked'],
 * })
 * ```
 */
export function bindAnalyticsToBus<M extends object>(
  bus: EventBus<M>,
  options: BindAnalyticsOptions<M> = {}
): () => void {
  const filter = options.events ? new Set<keyof M>(options.events) : null

  return bus.onAny((event, payload) => {
    if (filter && !filter.has(event)) return
    track(String(event), payload as AnalyticsParams | undefined)
  })
}
