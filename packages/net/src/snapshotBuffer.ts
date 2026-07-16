/**
 * Classic delay-buffer snapshot interpolation. Instead of chasing the
 * latest received value (smooth on LAN, jittery under real network jitter),
 * received snapshots are timestamped and buffered, and rendering samples
 * the buffer a fixed `delayMs` in the past — where two bracketing snapshots
 * almost always exist to interpolate between. Value-type agnostic: the
 * caller supplies the interpolation function at sample time.
 */

/** Config for {@link createSnapshotBuffer}. */
export interface SnapshotBufferConfig {
  /**
   * How far in the past to sample, in ms. Larger values ride out more
   * jitter but add visible latency; ~1.5–2× the sender's packet interval
   * is a good starting point. @default 120
   */
  delayMs?: number
  /** Maximum retained snapshots; older ones are dropped. @default 32 */
  maxSnapshots?: number
  /**
   * Injectable clock returning milliseconds. Must be the same timebase for
   * `push` and `sample`. @default `performance.now`, falling back to `Date.now`
   */
  now?: () => number
}

/** A timestamped interpolation buffer over values of type `T`. */
export interface SnapshotBuffer<T> {
  /** Timestamp `value` with the clock and append it (trimming to `maxSnapshots`). */
  push(value: T): void
  /**
   * Sample the buffer at `now() - delayMs` using `interpolate` (called with
   * the bracketing snapshots and `t` in [0, 1]). Returns:
   * - `null` when the buffer is empty or the render time is still before
   *   the first snapshot (nothing to show yet),
   * - the single snapshot when only one exists,
   * - the last snapshot when the render time has passed it (stalled sender).
   */
  sample(interpolate: (a: T, b: T, t: number) => T): T | null
  /** Drop all snapshots. */
  clear(): void
  /** Number of currently buffered snapshots. */
  readonly size: number
}

interface TimedSnapshot<T> {
  time: number
  value: T
}

function defaultNow(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now()
}

/** Create a {@link SnapshotBuffer}. See {@link SnapshotBufferConfig} for knobs. */
export function createSnapshotBuffer<T>(config: SnapshotBufferConfig = {}): SnapshotBuffer<T> {
  const delayMs = config.delayMs ?? 120
  const maxSnapshots = config.maxSnapshots ?? 32
  const now = config.now ?? defaultNow

  const snapshots: TimedSnapshot<T>[] = []

  return {
    push(value: T) {
      snapshots.push({ time: now(), value })
      if (snapshots.length > maxSnapshots) {
        snapshots.splice(0, snapshots.length - maxSnapshots)
      }
    },
    sample(interpolate) {
      const count = snapshots.length
      if (count === 0) return null
      const first = snapshots[0]!
      const last = snapshots[count - 1]!
      if (count === 1) return first.value
      const renderTime = now() - delayMs
      if (renderTime < first.time) return null
      if (renderTime >= last.time) return last.value
      // Walk back from the end: the sample point is usually near the newest
      // snapshots, so this is O(1) amortized for a live stream.
      for (let i = count - 2; i >= 0; i -= 1) {
        const a = snapshots[i]!
        if (a.time <= renderTime) {
          const b = snapshots[i + 1]!
          const span = b.time - a.time
          const t = span > 0 ? (renderTime - a.time) / span : 1
          return interpolate(a.value, b.value, t)
        }
      }
      // Unreachable: renderTime >= first.time guarantees the loop returns.
      return last.value
    },
    clear() {
      snapshots.length = 0
    },
    get size() {
      return snapshots.length
    },
  }
}
