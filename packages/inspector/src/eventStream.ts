/**
 * Headless event-bus tap for the inspector overlay — a ring buffer of recent
 * emissions plus per-event counts, built on `bus.onAny`. No React, no DOM:
 * usable from any code and testable in isolation (feed it a fresh
 * {@link EventBus}, emit a scripted sequence, assert the buffer).
 *
 * This is the data layer the `<EventBusInspector>` renders; it deliberately
 * mirrors `@overworld-engine/devtools`'s `createEventRecorder` (same `onAny`
 * tap, same monotonic-counter-not-`Date.now` discipline) but adds a bounded
 * ring buffer and cumulative counts suited to a live, long-running overlay.
 */
import { gameEvents, type EventBus, type OverworldEventMap } from '@overworld-engine/core'

/** One recorded emission held in the {@link EventStream} ring buffer. */
export interface EventEntry {
  /**
   * Monotonically increasing sequence number (0, 1, 2, …) assigned when the
   * event was recorded. Survives ring-buffer eviction, so gaps at the front
   * of `entries()` mean older events scrolled off.
   */
  readonly seq: number
  /** Event name (`String(event)`). */
  readonly event: string
  /** The emitted payload, held by reference (not cloned). */
  readonly payload: unknown
  /**
   * Monotonic tick when recorded — a counter, **not** `Date.now()`, so
   * ordering is deterministic under fake timers, same-millisecond bursts and
   * SSR. Equal to {@link EventEntry.seq}.
   */
  readonly at: number
}

/** Options for {@link createEventStream}. */
export interface EventStreamOptions {
  /**
   * Ring-buffer capacity: only the most recent `max` emissions are kept in
   * `entries()`. Counts are cumulative and unaffected by eviction.
   * @default 200
   */
  max?: number
}

/** Live view over a bus, returned by {@link createEventStream}. */
export interface EventStream {
  /** The buffered entries, oldest first (a fresh copy — safe to hold). */
  entries(): EventEntry[]
  /**
   * Cumulative per-event emission counts since the last `clear()` (or since
   * creation), including events already evicted from the ring buffer.
   */
  counts(): Record<string, number>
  /** Empty the ring buffer and reset counts. The seq counter keeps climbing. */
  clear(): void
  /**
   * Unsubscribe from the bus (idempotent) and return the unsubscribe function.
   * After `stop()`, later emissions are no longer recorded.
   */
  stop(): () => void
}

/** Default ring-buffer capacity for {@link createEventStream}. */
export const DEFAULT_EVENT_STREAM_MAX = 200

/**
 * Subscribe to every event on `bus` (default: the global `gameEvents`) and
 * keep a bounded, deterministic record of recent emissions.
 *
 * ```ts
 * const stream = createEventStream(gameEvents, { max: 100 })
 * gameEvents.emit('quest:started', { questId: 'welcome' })
 * stream.entries()  // [{ seq: 0, event: 'quest:started', payload: {…}, at: 0 }]
 * stream.counts()   // { 'quest:started': 1 }
 * stream.stop()     // unsubscribe
 * ```
 */
export function createEventStream<M extends object = OverworldEventMap>(
  bus: EventBus<M> = gameEvents as unknown as EventBus<M>,
  options: EventStreamOptions = {}
): EventStream {
  const max = Math.max(1, Math.floor(options.max ?? DEFAULT_EVENT_STREAM_MAX))
  let buffer: EventEntry[] = []
  const counts = new Map<string, number>()
  let counter = 0

  const unsubscribe = bus.onAny((event, payload) => {
    const name = String(event)
    const n = counter++
    buffer.push({ seq: n, event: name, payload, at: n })
    if (buffer.length > max) buffer.splice(0, buffer.length - max)
    counts.set(name, (counts.get(name) ?? 0) + 1)
  })

  let stopped = false
  const stop = (): (() => void) => {
    if (!stopped) {
      stopped = true
      unsubscribe()
    }
    return unsubscribe
  }

  return {
    entries: () => buffer.slice(),
    counts: () => {
      const out: Record<string, number> = {}
      for (const [event, count] of counts) out[event] = count
      return out
    },
    clear: () => {
      buffer = []
      counts.clear()
    },
    stop,
  }
}
