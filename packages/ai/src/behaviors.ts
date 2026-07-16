/**
 * Headless NPC steering agent: patrol / wander / follow / idle behaviors on
 * the X/Z plane, driven by `update(deltaMs)`. When constructed with a
 * {@link NavGrid} the agent routes every leg through {@link findPath};
 * otherwise it walks straight lines.
 *
 * Conventions:
 * - `speed` is in **world units per second** (not per frame).
 * - `heading` is `Math.atan2(dx, dz)` of the movement direction — the same
 *   convention as the scene Player: `0` faces **+Z**, `π/2` faces **+X**.
 *   Assignable directly to a three.js `rotation.y` for models that face +Z.
 */
import type { Vec3 } from '@overworld/core'
import { findPath, type PathPoint } from './astar'
import type { NavGrid } from './grid'

/** The active behavior mode of an {@link Agent}. */
export type AgentBehaviorName = 'idle' | 'patrol' | 'wander' | 'follow'

/** Snapshot returned by {@link Agent.update} after each tick. */
export interface AgentStatus {
  /** Active behavior mode. */
  behavior: AgentBehaviorName
  /** Copy of the agent position after this update. */
  position: [number, number]
  /** Facing angle in radians (`atan2(dx, dz)`, 0 = +Z). */
  heading: number
  /** Whether the agent covered distance during this update. */
  isMoving: boolean
  /**
   * Set on the update in which a behavior-level destination was reached:
   * the patrol waypoint index, or `0` for wander/follow arrivals.
   */
  arrived?: number
}

/** Options for {@link Agent.patrol}. */
export interface PatrolOptions {
  /** `true` = cycle 0→1→…→n→0; `false` = ping-pong 0→…→n→…→0. @default true */
  loop?: boolean
  /** Pause at each waypoint, in ms. @default 0 */
  pauseMs?: number
}

/** Options for {@link Agent.wander}. */
export interface WanderOptions {
  /** Center of the wander area. */
  center: [number, number]
  /** Maximum distance from `center` for picked targets. */
  radius: number
  /** Random pause `[min, max]` ms between legs. @default no pause */
  pauseMsRange?: [number, number]
  /**
   * Random source, injectable for determinism. Consumed in order: angle,
   * distance (per target pick — up to 5 picks per leg when the grid rejects
   * targets), then pause duration when `pauseMsRange` is set.
   * @default the agent's `config.random` (or `Math.random`)
   */
  random?: () => number
}

/**
 * A follow target: either a mutable position ref shaped like the scene
 * player's `{ current: [x, y, z] }`, or a function returning `[x, z]`.
 */
export type FollowTarget = { current: Vec3 } | (() => [number, number])

/** Options for {@link Agent.follow}. */
export interface FollowOptions {
  /** Stop once within this distance of the target. @default 1 */
  stopDistance?: number
  /**
   * Recompute the path at most every `repathMs` (and only when the target
   * moved more than ~0.1 world units since the last plan). @default 500
   */
  repathMs?: number
}

/** Configuration for {@link createAgent}. */
export interface AgentConfig {
  /** Starting position `[x, z]`. @default [0, 0] */
  position?: [number, number]
  /** Movement speed in world units **per second**. @default 2 */
  speed?: number
  /** Route legs through this grid via A*; omit to walk straight lines. */
  grid?: NavGrid
  /** Default random source for `wander`. @default Math.random */
  random?: () => number
}

/** The headless steering agent returned by {@link createAgent}. */
export interface Agent {
  /** Current position `[x, z]` — mutable; teleport by writing to it. */
  position: [number, number]
  /** Movement speed in world units per second — mutable at runtime. */
  speed: number
  /** Facing angle in radians (`atan2(dx, dz)`, 0 = +Z); persists when idle. */
  readonly heading: number
  /** Whether the last `update` covered distance. */
  readonly isMoving: boolean
  /** Active behavior mode. */
  readonly behavior: AgentBehaviorName
  /**
   * Advance the simulation by `deltaMs` milliseconds. Leftover time carries
   * across waypoint arrivals and pauses within the same call.
   */
  update(deltaMs: number): AgentStatus
  /** Walk `waypoints` in order, looping or ping-ponging forever. */
  patrol(waypoints: [number, number][], options?: PatrolOptions): void
  /** Walk to random points within `radius` of `center`, pausing between legs. */
  wander(options: WanderOptions): void
  /** Chase `target`, repathing at a throttled interval, stopping at `stopDistance`. */
  follow(target: FollowTarget, options?: FollowOptions): void
  /** Stop and hold position (heading is kept). */
  idle(): void
}

const EPSILON = 1e-6
/** Target must move at least this far before follow replans. */
const REPATH_MIN_MOVE = 0.1
/** Retry delay after a failed wander/patrol plan, ms. */
const PLAN_RETRY_MS = 500
/** Safety cap on arrival/pause transitions handled inside one update. */
const MAX_TRANSITIONS = 32

interface PatrolState {
  waypoints: [number, number][]
  loop: boolean
  pauseMs: number
  index: number
  direction: 1 | -1
}

interface WanderState {
  center: [number, number]
  radius: number
  pauseMsRange: [number, number] | null
  random: () => number
}

interface FollowState {
  target: FollowTarget
  stopDistance: number
  repathMs: number
  timerMs: number
  goal: [number, number] | null
}

/**
 * Create a headless steering agent. Drive it with `update(deltaMs)` — from
 * `<NPCWalker>` / `useAgentDriver` inside a R3F canvas, or any game loop.
 */
export function createAgent(config: AgentConfig = {}): Agent {
  const grid = config.grid
  const defaultRandom = config.random ?? Math.random

  let mode: AgentBehaviorName = 'idle'
  let heading = 0
  let moving = false
  let path: PathPoint[] | null = null
  let pathIndex = 0
  let pauseRemainingMs = 0

  let patrolState: PatrolState | null = null
  let wanderState: WanderState | null = null
  let followState: FollowState | null = null

  const position: [number, number] = [
    config.position?.[0] ?? 0,
    config.position?.[1] ?? 0,
  ]

  const clearMovement = (): void => {
    path = null
    pathIndex = 0
    pauseRemainingMs = 0
    moving = false
  }

  /** Plan a leg to `target` — A* when a grid is configured, else a straight line. */
  const plan = (target: PathPoint): boolean => {
    const planned = grid
      ? findPath(grid, [position[0], position[1]], target)
      : [[position[0], position[1]], [target[0], target[1]]] as PathPoint[]
    if (!planned) return false
    path = planned
    pathIndex = 0
    return true
  }

  const resolveFollowTarget = (state: FollowState): [number, number] => {
    if (typeof state.target === 'function') return state.target()
    const [x, , z] = state.target.current
    return [x, z]
  }

  const distanceTo = (point: [number, number]): number =>
    Math.hypot(point[0] - position[0], point[1] - position[1])

  /**
   * Consume up to `budget` world units of movement along the current path.
   * Updates position/heading; clears `path` when its end is reached.
   * Returns the unspent budget.
   */
  const advance = (budget: number): number => {
    let remaining = budget
    while (remaining > EPSILON && path) {
      const target = path[pathIndex]
      if (!target) {
        path = null
        break
      }
      const dx = target[0] - position[0]
      const dz = target[1] - position[1]
      const distance = Math.hypot(dx, dz)
      if (distance <= EPSILON) {
        pathIndex++
        if (pathIndex >= path.length) path = null
        continue
      }
      heading = Math.atan2(dx, dz)
      if (distance <= remaining) {
        position[0] = target[0]
        position[1] = target[1]
        remaining -= distance
        pathIndex++
        if (pathIndex >= path.length) path = null
      } else {
        position[0] += (dx / distance) * remaining
        position[1] += (dz / distance) * remaining
        remaining = 0
      }
    }
    return remaining
  }

  /** Acquire the next destination for the active mode. False = nothing to do. */
  const acquirePath = (): boolean => {
    switch (mode) {
      case 'patrol': {
        const state = patrolState
        if (!state || state.waypoints.length === 0) return false
        const target = state.waypoints[state.index]
        if (!target) return false
        if (plan(target)) return true
        // Unreachable waypoint: skip it after a short pause instead of stalling.
        advancePatrolIndex(state)
        pauseRemainingMs = PLAN_RETRY_MS
        return true
      }
      case 'wander': {
        const state = wanderState
        if (!state) return false
        for (let attempt = 0; attempt < 5; attempt++) {
          const angle = state.random() * Math.PI * 2
          const distance = state.random() * state.radius
          const target: PathPoint = [
            state.center[0] + Math.cos(angle) * distance,
            state.center[1] + Math.sin(angle) * distance,
          ]
          if (plan(target)) return true
        }
        pauseRemainingMs = PLAN_RETRY_MS
        return true
      }
      case 'follow': {
        const state = followState
        if (!state) return false
        const target = resolveFollowTarget(state)
        if (distanceTo(target) <= state.stopDistance) return false
        if (!plan(target)) return false
        state.goal = target
        state.timerMs = 0
        return true
      }
      case 'idle':
        return false
    }
  }

  const advancePatrolIndex = (state: PatrolState): void => {
    const count = state.waypoints.length
    if (count <= 1) return
    if (state.loop) {
      state.index = (state.index + 1) % count
      return
    }
    let next = state.index + state.direction
    if (next >= count) {
      state.direction = -1
      next = count - 2
    } else if (next < 0) {
      state.direction = 1
      next = 1
    }
    state.index = next
  }

  /** Handle reaching the end of the current path; returns the arrived index. */
  const onDestinationReached = (): number => {
    switch (mode) {
      case 'patrol': {
        const state = patrolState
        if (!state) return 0
        const arrivedIndex = state.index
        pauseRemainingMs = state.pauseMs
        advancePatrolIndex(state)
        return arrivedIndex
      }
      case 'wander': {
        const state = wanderState
        if (state?.pauseMsRange) {
          const [min, max] = state.pauseMsRange
          pauseRemainingMs = min + state.random() * (max - min)
        }
        return 0
      }
      default:
        return 0
    }
  }

  const agent: Agent = {
    position,
    speed: config.speed ?? 2,

    get heading() {
      return heading
    },
    get isMoving() {
      return moving
    },
    get behavior() {
      return mode
    },

    update(deltaMs) {
      let arrived: number | undefined
      let movedAny = false
      let dt = Math.max(0, deltaMs)

      // Throttled follow repath, at most once per update.
      if (mode === 'follow' && followState && path) {
        const state = followState
        state.timerMs += dt
        if (state.timerMs >= state.repathMs) {
          state.timerMs = 0
          const target = resolveFollowTarget(state)
          const goalMoved =
            !state.goal ||
            Math.hypot(target[0] - state.goal[0], target[1] - state.goal[1]) > REPATH_MIN_MOVE
          if (goalMoved && plan(target)) state.goal = target
        }
      }

      for (let guard = 0; guard < MAX_TRANSITIONS && dt > EPSILON; guard++) {
        if (pauseRemainingMs > 0) {
          const used = Math.min(pauseRemainingMs, dt)
          pauseRemainingMs -= used
          dt -= used
          continue
        }
        if (!path && !acquirePath()) break
        if (!path) continue // acquire consumed the slice (retry pause)

        if (agent.speed <= 0) break
        const budget = (agent.speed * dt) / 1000
        const leftover = advance(budget)
        if (leftover < budget - EPSILON) movedAny = true
        dt = (leftover / agent.speed) * 1000

        if (mode === 'follow' && followState) {
          const state = followState
          if (path && distanceTo(resolveFollowTarget(state)) <= state.stopDistance) {
            path = null
            arrived = 0
          } else if (!path) {
            arrived = 0
          }
          if (!path) break // hold until the target moves away again
        } else if (!path) {
          arrived = onDestinationReached()
        }
      }

      moving = movedAny
      return {
        behavior: mode,
        position: [position[0], position[1]],
        heading,
        isMoving: moving,
        ...(arrived !== undefined && { arrived }),
      }
    },

    patrol(waypoints, options = {}) {
      mode = 'patrol'
      clearMovement()
      wanderState = null
      followState = null
      patrolState = {
        waypoints: waypoints.map((w) => [w[0], w[1]]),
        loop: options.loop ?? true,
        pauseMs: options.pauseMs ?? 0,
        index: 0,
        direction: 1,
      }
    },

    wander(options) {
      mode = 'wander'
      clearMovement()
      patrolState = null
      followState = null
      wanderState = {
        center: [options.center[0], options.center[1]],
        radius: options.radius,
        pauseMsRange: options.pauseMsRange ?? null,
        random: options.random ?? defaultRandom,
      }
    },

    follow(target, options = {}) {
      mode = 'follow'
      clearMovement()
      patrolState = null
      wanderState = null
      followState = {
        target,
        stopDistance: options.stopDistance ?? 1,
        repathMs: options.repathMs ?? 500,
        timerMs: 0,
        goal: null,
      }
    },

    idle() {
      mode = 'idle'
      clearMovement()
      patrolState = null
      wanderState = null
      followState = null
    },
  }

  return agent
}
