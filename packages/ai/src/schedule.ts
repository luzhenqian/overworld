/**
 * NPC schedules: map phase names (plain strings — e.g. the day-night phases
 * emitted by `@overworld-engine/environment`) to declarative agent behaviors, and
 * optionally drive them from an event bus.
 *
 * Deliberately decoupled: phases are untyped strings and the bus binding
 * goes through `onAny`, so this package never imports the environment
 * package (or any event map types) — any bus and any phase vocabulary work.
 */
import type { Agent } from './behaviors'

/**
 * Declarative behavior applied when a schedule phase activates — mirrors the
 * imperative {@link Agent} methods one-to-one.
 */
export type ScheduleBehavior =
  | { type: 'patrol'; waypoints: [number, number][]; loop?: boolean; pauseMs?: number }
  | { type: 'wander'; center: [number, number]; radius: number; pauseMsRange?: [number, number] }
  | {
      type: 'follow'
      target: { current: [number, number, number] } | (() => [number, number])
      stopDistance?: number
    }
  | { type: 'goTo'; point: [number, number] }
  | { type: 'idle' }

/** Configuration for {@link createSchedule}. */
export interface ScheduleConfig {
  /** The agent driven by this schedule. */
  agent: Agent
  /**
   * Behavior per phase name. Keys are plain strings (e.g. `'day'`,
   * `'night'`) — deliberately not typed against any environment package.
   */
  entries: Record<string, ScheduleBehavior>
  /** Phase applied immediately at creation. Omit to wait for the first `applyPhase`. */
  initialPhase?: string
}

/** The schedule returned by {@link createSchedule}. */
export interface Schedule {
  /** The last successfully applied phase, or `null` before the first one. */
  readonly currentPhase: string | null
  /**
   * Apply the entry registered for `phase` to the agent (re-applying the
   * current phase restarts its behavior). Unknown phases are a no-op and
   * warn once per phase name; after {@link Schedule.dispose} all calls are
   * silent no-ops.
   */
  applyPhase(phase: string): void
  /** Detach the schedule from its agent: every later `applyPhase` is ignored. */
  dispose(): void
}

/** Options for {@link bindScheduleToBus}. */
export interface BindScheduleOptions {
  /** Bus event name to react to. @default 'environment:phase-changed' */
  event?: string
  /**
   * Extract the phase name from the event payload.
   * @default `(payload) => payload.phase` (non-string results are ignored)
   */
  phaseFrom?: (payload: unknown) => string
}

/**
 * The slice of `@overworld-engine/core`'s `EventBus` the schedule binding needs.
 * Structural on purpose: any bus with a compatible `onAny` works, keeping
 * the binding free of event-map type coupling.
 */
export interface ScheduleBusLike {
  onAny(fn: (event: PropertyKey, payload: unknown) => void): () => void
}

/** Apply one declarative entry to the agent. */
function applyBehavior(agent: Agent, behavior: ScheduleBehavior): void {
  switch (behavior.type) {
    case 'patrol':
      agent.patrol(behavior.waypoints, { loop: behavior.loop, pauseMs: behavior.pauseMs })
      break
    case 'wander':
      agent.wander({
        center: behavior.center,
        radius: behavior.radius,
        pauseMsRange: behavior.pauseMsRange,
      })
      break
    case 'follow':
      agent.follow(behavior.target, { stopDistance: behavior.stopDistance })
      break
    case 'goTo':
      agent.goTo(behavior.point)
      break
    case 'idle':
      agent.idle()
      break
  }
}

/**
 * Create a {@link Schedule} switching `config.agent` between the behaviors
 * in `config.entries` as phases are applied — manually via `applyPhase`, or
 * from a bus via {@link bindScheduleToBus}. When `initialPhase` is set its
 * entry is applied immediately; otherwise the agent is left untouched until
 * the first phase arrives.
 */
export function createSchedule(config: ScheduleConfig): Schedule {
  const { agent, entries } = config
  const warnedPhases = new Set<string>()
  let currentPhase: string | null = null
  let disposed = false

  const schedule: Schedule = {
    get currentPhase() {
      return currentPhase
    },

    applyPhase(phase) {
      if (disposed) return
      const entry = entries[phase]
      if (!entry) {
        if (!warnedPhases.has(phase)) {
          warnedPhases.add(phase)
          console.warn(`[overworld/ai] schedule has no entry for phase "${phase}"`)
        }
        return
      }
      currentPhase = phase
      applyBehavior(agent, entry)
    },

    dispose() {
      disposed = true
    },
  }

  if (config.initialPhase !== undefined) schedule.applyPhase(config.initialPhase)
  return schedule
}

/**
 * Drive `schedule` from `bus`: on every `options.event` (default
 * `'environment:phase-changed'`) extract the phase via `options.phaseFrom`
 * (default: the payload's `phase` property) and `applyPhase` it. Non-string
 * phases are ignored. Binds generically through `onAny`, so the emitting
 * package's event types are never imported.
 *
 * @returns an unbind function — after calling it, events are ignored.
 */
export function bindScheduleToBus(
  schedule: Schedule,
  bus: ScheduleBusLike,
  options: BindScheduleOptions = {}
): () => void {
  const eventName = options.event ?? 'environment:phase-changed'
  const phaseFrom = options.phaseFrom

  return bus.onAny((event, payload) => {
    if (event !== eventName) return
    const phase = phaseFrom
      ? phaseFrom(payload)
      : (payload as { phase?: unknown } | null | undefined)?.phase
    if (typeof phase === 'string') schedule.applyPhase(phase)
  })
}
