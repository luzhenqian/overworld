import type { EventBus } from '@overworld/core'

/** Options for {@link bindEventLogger}. */
export interface EventLoggerOptions {
  /** Only log events for which this returns `true`. Defaults to all events. */
  filter?: (event: string) => boolean
  /**
   * Sink for log lines. Defaults to `console.debug`. The line is already
   * prefixed with `[overworld]`; `payload` is `undefined` when
   * `includePayload` is `false`.
   */
  log?: (line: string, payload: unknown) => void
  /**
   * Pass the event payload to the sink.
   * @default true
   */
  includePayload?: boolean
}

/**
 * Log every event emitted on a bus — a dev-time tap using `bus.onAny`.
 *
 * ```ts
 * const unbind = bindEventLogger(gameEvents, { filter: (e) => e.startsWith('quest:') })
 * // ... later
 * unbind()
 * ```
 *
 * @returns an unbind function that removes the listener.
 */
export function bindEventLogger<M extends object>(
  bus: EventBus<M>,
  options: EventLoggerOptions = {}
): () => void {
  const includePayload = options.includePayload ?? true
  const log =
    options.log ??
    ((line: string, payload: unknown) => {
      if (payload === undefined) console.debug(line)
      else console.debug(line, payload)
    })

  return bus.onAny((event, payload) => {
    const name = String(event)
    if (options.filter && !options.filter(name)) return
    log(`[overworld] ${name}`, includePayload ? payload : undefined)
  })
}

/** One recorded emission. */
export interface RecordedEvent {
  event: string
  payload: unknown
  /**
   * Monotonically increasing sequence number (0, 1, 2, ...), **not** a
   * timestamp. A counter is used instead of `Date.now()` so ordering
   * assertions are deterministic in any environment (fake timers, fast
   * test runs where emissions share a millisecond, SSR, ...).
   */
  at: number
}

/** Handle returned by {@link createEventRecorder}. */
export interface EventRecorder {
  /** Recorded events in emission order (mutated in place as events arrive). */
  events: RecordedEvent[]
  /** Stop recording (unsubscribes from the bus). */
  stop: () => void
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
 */
export function createEventRecorder<M extends object>(bus: EventBus<M>): EventRecorder {
  const events: RecordedEvent[] = []
  let counter = 0
  const stop = bus.onAny((event, payload) => {
    events.push({ event: String(event), payload, at: counter++ })
  })
  return { events, stop }
}
