import type { EventBus } from '@overworld-engine/core'

/** One recorded emission. */
export interface RecordedEvent {
  event: string
  payload: unknown
  /**
   * Monotonically increasing sequence number (0, 1, 2, ...), not a
   * timestamp — keeps ordering assertions deterministic in any environment.
   */
  at: number
}

/** Handle returned by {@link createEventRecorder}. */
export interface EventRecorder {
  /** Recorded events in emission order (mutated in place as events arrive). */
  events: RecordedEvent[]
  /** Stop recording (unsubscribes from the bus). */
  stop(): void
}

/**
 * Record every event emitted on a bus, for test assertions:
 *
 * ```ts
 * const recorder = createEventRecorder(bus)
 * // ... exercise the game
 * expect(recorder.events.map((e) => e.event)).toEqual(['quest:started', 'quest:completed'])
 * recorder.stop()
 * ```
 *
 * A small, standalone implementation (not re-exported from `devtools`'s
 * `createEventRecorder` or `inspector`'s `createEventStream`, which do the
 * same thing) — the repo's zero-cross-package-import rule means `test-kit`
 * can only depend on `core`, not on sibling packages.
 */
export function createEventRecorder<M extends object>(bus: EventBus<M>): EventRecorder {
  const events: RecordedEvent[] = []
  let counter = 0
  const stop = bus.onAny((event, payload) => {
    events.push({ event: String(event), payload, at: counter++ })
  })
  return { events, stop }
}
