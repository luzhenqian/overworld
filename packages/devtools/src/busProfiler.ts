import type { EventBus } from '@overworld-engine/core'

/** Accumulated timing stats for one event name. */
export interface EventStats {
  /** Number of emissions observed. */
  count: number
  /** Sum of synchronous emit durations, in ms. */
  totalMs: number
  /** Longest single emit, in ms. */
  maxMs: number
  /** Duration of the most recent emit, in ms. */
  lastMs: number
}

/** Options for {@link profileBus}. */
export interface BusProfilerOptions {
  /**
   * Clock used to measure durations, injectable for deterministic tests.
   * Defaults to `performance.now`.
   */
  now?: () => number
}

/** Handle returned by {@link profileBus}. */
export interface BusProfiler {
  /** Snapshot of the per-event stats (copies — safe to hold on to). */
  stats: () => Record<string, EventStats>
  /**
   * The `n` (default 5) most expensive events, sorted descending by
   * `totalMs` (default) or `count`.
   */
  top: (n?: number, by?: 'count' | 'totalMs') => Array<{ event: string } & EventStats>
  /** Discard all collected stats (profiling continues). */
  reset: () => void
  /**
   * Restore the bus's original `emit` and stop collecting. Idempotent —
   * calling it again is a no-op.
   *
   * When profilers are **chained** (see {@link profileBus}), stop them in
   * LIFO order: last profiler started, first stopped. An out-of-order stop
   * restores a stale `emit` and silently detaches the profilers layered on
   * top of it.
   */
  stop: () => void
  /**
   * Human-readable, column-aligned table of the stats, sorted by `totalMs`
   * descending (same console-report style as `formatReport`).
   */
  report: () => string
}

/** Buses currently profiled, for double-profiling detection. */
const profiledBuses = new WeakMap<object, number>()

function formatTable(entries: Array<{ event: string } & EventStats>): string {
  const header = { event: 'event', count: 'count', totalMs: 'total ms', maxMs: 'max ms', lastMs: 'last ms' }
  const rows = entries.map((e) => ({
    event: e.event,
    count: String(e.count),
    totalMs: e.totalMs.toFixed(2),
    maxMs: e.maxMs.toFixed(2),
    lastMs: e.lastMs.toFixed(2),
  }))
  const width = (col: keyof typeof header): number =>
    Math.max(header[col].length, ...rows.map((r) => r[col].length))
  const w = {
    event: width('event'),
    count: width('count'),
    totalMs: width('totalMs'),
    maxMs: width('maxMs'),
    lastMs: width('lastMs'),
  }
  const line = (r: typeof header): string =>
    `  ${r.event.padEnd(w.event)}  ${r.count.padStart(w.count)}  ${r.totalMs.padStart(w.totalMs)}  ${r.maxMs.padStart(w.maxMs)}  ${r.lastMs.padStart(w.lastMs)}`
  return [line(header), ...rows.map(line)].join('\n')
}

/**
 * Profile an event bus: wraps `bus.emit` (monkey-patch) to record, per event
 * name, how many times it was emitted and how long the synchronous listener
 * dispatch took ({@link EventStats}). Async work started by listeners is
 * **not** included — only the synchronous cost of the emit.
 *
 * ```ts
 * const profiler = profileBus(gameEvents)
 * // ... play ...
 * console.log(profiler.report())
 * profiler.top(3)      // worst offenders by total time
 * profiler.stop()      // restore the original emit
 * ```
 *
 * Profiling the same bus twice **chains**: the second profiler wraps the
 * first profiler's wrapped `emit` (a warning is logged), and both collect
 * stats — the outer profiler's timings include the inner one's small
 * bookkeeping overhead. `stop()` must then be called in LIFO order (last
 * started, first stopped); stopping out of order restores a stale `emit`
 * that detaches the profilers layered on top (see {@link BusProfiler.stop}).
 */
export function profileBus<M extends object>(
  bus: EventBus<M>,
  options: BusProfilerOptions = {}
): BusProfiler {
  const now = options.now ?? (() => performance.now())
  const stats = new Map<string, EventStats>()

  const activeCount = profiledBuses.get(bus) ?? 0
  if (activeCount > 0) {
    console.warn(
      '[overworld] profileBus: this bus is already being profiled; chaining a second profiler. Stop profilers in LIFO order (last started, first stopped).'
    )
  }
  profiledBuses.set(bus, activeCount + 1)

  // The emit in place right now — the original, or another profiler's wrapper.
  const previousEmit = bus.emit

  const wrappedEmit = function <K extends keyof M>(event: K, payload: M[K]): void {
    const start = now()
    previousEmit.call(bus, event, payload)
    const elapsed = now() - start
    const name = String(event)
    let entry = stats.get(name)
    if (!entry) {
      entry = { count: 0, totalMs: 0, maxMs: 0, lastMs: 0 }
      stats.set(name, entry)
    }
    entry.count += 1
    entry.totalMs += elapsed
    if (elapsed > entry.maxMs) entry.maxMs = elapsed
    entry.lastMs = elapsed
  }
  bus.emit = wrappedEmit

  let stopped = false

  const sorted = (by: 'count' | 'totalMs'): Array<{ event: string } & EventStats> =>
    [...stats.entries()]
      .map(([event, s]) => ({ event, ...s }))
      .sort((a, b) => b[by] - a[by])

  return {
    stats: () => {
      const out: Record<string, EventStats> = {}
      for (const [event, s] of stats) out[event] = { ...s }
      return out
    },

    top: (n = 5, by = 'totalMs') => sorted(by).slice(0, n),

    reset: () => {
      stats.clear()
    },

    stop: () => {
      if (stopped) return
      stopped = true
      if (bus.emit !== wrappedEmit) {
        console.warn(
          '[overworld] profileBus: stop() called out of order — bus.emit was wrapped again after this profiler attached; restoring anyway (profilers layered on top are detached).'
        )
      }
      bus.emit = previousEmit
      const count = profiledBuses.get(bus) ?? 1
      if (count <= 1) profiledBuses.delete(bus)
      else profiledBuses.set(bus, count - 1)
    },

    report: () => {
      const entries = sorted('totalMs')
      if (entries.length === 0) return '[overworld] bus profile: no emissions recorded'
      const emissions = entries.reduce((sum, e) => sum + e.count, 0)
      return [
        `[overworld] bus profile: ${entries.length} event(s), ${emissions} emission(s)`,
        formatTable(entries),
      ].join('\n')
    },
  }
}
