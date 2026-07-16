/**
 * Behavior trees: composable, tick-driven decision logic with a shared
 * mutable blackboard. Pure factories — no three.js, no React, no globals;
 * every node instance owns its own state, so build a fresh tree per agent.
 *
 * Memory semantics: {@link sequence} and {@link selector} have **memory** —
 * while a child returns `'running'` the composite resumes at that child on
 * the next tick without re-ticking earlier children. Memory only spans
 * `'running'`: the moment a composite completes (success or failure) it
 * resets its cursor and children, so the next tick starts from the first
 * child again. {@link parallel} has **no** memory: every child is re-ticked
 * every tick (monitor pattern — conditions are re-evaluated continuously),
 * and all children are reset when the parallel completes.
 *
 * Agent integration is explicit — nothing monkey-patches the agent. Drive
 * both from your game loop with {@link tickTreeWithAgent} (tick the tree,
 * then `agent.update(deltaMs)`), and use the agent-flavored leaves
 * ({@link goToAction}, {@link patrolAction}, {@link idleAction},
 * {@link isNearCondition}) which capture the agent by closure.
 */
import type { Agent, AgentStatus, PatrolOptions } from './behaviors'

/** Result of ticking a node: terminal success/failure, or still running. */
export type BTStatus = 'success' | 'failure' | 'running'

/** Context passed to every node on each tick. */
export interface BTContext<B> {
  /** Shared mutable state, visible to (and mutable by) every node. */
  blackboard: B
  /** Milliseconds elapsed since the previous tick. */
  deltaMs: number
}

/** A behavior-tree node: tick it, and reset its internal state recursively. */
export interface BTNode<B = unknown> {
  tick(ctx: BTContext<B>): BTStatus
  /** Clear internal state (cursors, timers, child state) recursively. */
  reset(): void
}

/** The tree handle returned by {@link createBehaviorTree}. */
export interface BehaviorTree<B = unknown> {
  /**
   * Tick the root once. After the root completes (success or failure) the
   * **next** tick auto-resets the whole tree first, so a finished tree
   * restarts from scratch instead of replaying latched results.
   */
  tick(deltaMs: number): BTStatus
  /** Reset the whole tree immediately. */
  reset(): void
  /** The blackboard passed at creation (same reference — mutate freely). */
  readonly blackboard: B
}

const noop = (): void => {}

/**
 * Leaf that runs `fn` each tick. Returning `void` (nothing) counts as
 * `'success'`; return `'running'` to span multiple ticks.
 */
export function action<B = unknown>(fn: (ctx: BTContext<B>) => BTStatus | void): BTNode<B> {
  return {
    tick(ctx) {
      const result = fn(ctx)
      return typeof result === 'string' ? result : 'success'
    },
    reset: noop,
  }
}

/** Leaf that evaluates `fn` each tick: `true` → success, `false` → failure. */
export function condition<B = unknown>(fn: (ctx: BTContext<B>) => boolean): BTNode<B> {
  return {
    tick: (ctx) => (fn(ctx) ? 'success' : 'failure'),
    reset: noop,
  }
}

/**
 * Tick children in order until one fails or all succeed. **With memory**:
 * a `'running'` child becomes the resume point for the next tick (earlier
 * children are not re-ticked). Completion (either way) and `reset()` both
 * rewind the cursor and reset all children. Empty sequence → success.
 */
export function sequence<B = unknown>(...children: BTNode<B>[]): BTNode<B> {
  let cursor = 0
  const resetAll = (): void => {
    cursor = 0
    for (const child of children) child.reset()
  }
  return {
    tick(ctx) {
      while (cursor < children.length) {
        const status = children[cursor]!.tick(ctx)
        if (status === 'running') return 'running'
        if (status === 'failure') {
          resetAll()
          return 'failure'
        }
        cursor++
      }
      resetAll()
      return 'success'
    },
    reset: resetAll,
  }
}

/**
 * Tick children in order until one succeeds or all fail. **With memory**:
 * a `'running'` child becomes the resume point for the next tick (earlier,
 * already-failed children are not re-tried until the selector completes or
 * is reset — see the module docs; use {@link parallel} for reactive
 * monitoring). Completion and `reset()` rewind cursor + children.
 * Empty selector → failure.
 */
export function selector<B = unknown>(...children: BTNode<B>[]): BTNode<B> {
  let cursor = 0
  const resetAll = (): void => {
    cursor = 0
    for (const child of children) child.reset()
  }
  return {
    tick(ctx) {
      while (cursor < children.length) {
        const status = children[cursor]!.tick(ctx)
        if (status === 'running') return 'running'
        if (status === 'success') {
          resetAll()
          return 'success'
        }
        cursor++
      }
      resetAll()
      return 'failure'
    },
    reset: resetAll,
  }
}

/** Swap the child's success and failure; `'running'` passes through. */
export function invert<B = unknown>(child: BTNode<B>): BTNode<B> {
  return {
    tick(ctx) {
      const status = child.tick(ctx)
      return status === 'running' ? 'running' : status === 'success' ? 'failure' : 'success'
    },
    reset: () => child.reset(),
  }
}

/** Report success whenever the child completes; `'running'` passes through. */
export function alwaysSucceed<B = unknown>(child: BTNode<B>): BTNode<B> {
  return {
    tick: (ctx) => (child.tick(ctx) === 'running' ? 'running' : 'success'),
    reset: () => child.reset(),
  }
}

/**
 * Running until the ticks' accumulated `deltaMs` reaches `ms`, then success
 * (and success again on further ticks until reset). `reset()` clears the
 * accumulator.
 */
export function wait<B = unknown>(ms: number): BTNode<B> {
  let elapsedMs = 0
  return {
    tick(ctx) {
      elapsedMs += ctx.deltaMs
      return elapsedMs >= ms ? 'success' : 'running'
    },
    reset() {
      elapsedMs = 0
    },
  }
}

/**
 * Repeat the child, resetting it between iterations. At most one child
 * completion is consumed per tick (an instantly-succeeding child does not
 * spin the tree).
 *
 * - `times` omitted: infinite — always `'running'`; both child success and
 *   child failure just start the next iteration.
 * - `times` given: success after `times` child successes; a child failure
 *   fails the repeat immediately (and resets the iteration counter).
 */
export function repeat<B = unknown>(child: BTNode<B>, times?: number): BTNode<B> {
  let completed = 0
  return {
    tick(ctx) {
      const status = child.tick(ctx)
      if (status === 'running') return 'running'
      child.reset()
      if (times === undefined) return 'running'
      if (status === 'failure') {
        completed = 0
        return 'failure'
      }
      completed++
      if (completed >= times) {
        completed = 0
        return 'success'
      }
      return 'running'
    },
    reset() {
      completed = 0
      child.reset()
    },
  }
}

/**
 * Tick children side by side every tick (no memory — see module docs).
 * Policy, evaluated on the current tick's statuses:
 *
 * - `'all'`: failure **fast** on the first failing child (later children are
 *   not ticked that tick); success when every child returns success; running
 *   otherwise.
 * - `'any'`: success **fast** on the first succeeding child; failure only
 *   when *every* child returns failure on the same tick; running otherwise
 *   (failed children are simply re-ticked next tick — monitor pattern).
 *
 * Whenever the parallel completes, **all** children are reset, including
 * still-running ones.
 */
export function parallel<B = unknown>(
  policy: 'all' | 'any',
  ...children: BTNode<B>[]
): BTNode<B> {
  const resetAll = (): void => {
    for (const child of children) child.reset()
  }
  return {
    tick(ctx) {
      let successes = 0
      let failures = 0
      let result: BTStatus | null = null
      for (const child of children) {
        const status = child.tick(ctx)
        if (status === 'success') {
          successes++
          if (policy === 'any') {
            result = 'success'
            break
          }
        } else if (status === 'failure') {
          failures++
          if (policy === 'all') {
            result = 'failure'
            break
          }
        }
      }
      if (result === null) {
        if (policy === 'all' && successes === children.length) result = 'success'
        else if (policy === 'any' && failures === children.length) result = 'failure'
        else result = 'running'
      }
      if (result !== 'running') resetAll()
      return result
    },
    reset: resetAll,
  }
}

/**
 * Wrap `root` + `blackboard` into a tickable tree. After the root completes
 * (success or failure), the next `tick` resets the whole tree first, so the
 * tree restarts from scratch automatically (see {@link BehaviorTree.tick}).
 */
export function createBehaviorTree<B>(root: BTNode<B>, blackboard: B): BehaviorTree<B> {
  let completed = false
  return {
    blackboard,
    tick(deltaMs) {
      if (completed) {
        root.reset()
        completed = false
      }
      const status = root.tick({ blackboard, deltaMs })
      if (status !== 'running') completed = true
      return status
    },
    reset() {
      root.reset()
      completed = false
    },
  }
}

/**
 * Drive a tree and its agent together from one game loop: tick the tree
 * (which may issue agent commands like `goTo`), then `agent.update(deltaMs)`.
 * The agent is never mutated or wrapped — this is just the canonical call
 * order, packaged.
 *
 * ```ts
 * useFrame((_, delta) => tickTreeWithAgent(tree, npc, delta * 1000))
 * ```
 */
export function tickTreeWithAgent<B>(
  tree: BehaviorTree<B>,
  agent: Agent,
  deltaMs: number
): { tree: BTStatus; agent: AgentStatus } {
  const treeStatus = tree.tick(deltaMs)
  return { tree: treeStatus, agent: agent.update(deltaMs) }
}

/**
 * Leaf that walks `agent` to `point` via {@link Agent.goTo}. First tick
 * starts the trip; `'running'` while `agent.behavior === 'goTo'`; success
 * once the agent reaches the point and auto-idles (this includes goTo's
 * nearest-walkable fallback and its give-up-to-idle after repeated plan
 * failures); failure when some other behavior preempted the trip. On any
 * completion (or `reset()`) the next tick starts a fresh trip.
 */
export function goToAction<B = unknown>(agent: Agent, point: [number, number]): BTNode<B> {
  let started = false
  return {
    tick() {
      if (!started) {
        agent.goTo([point[0], point[1]])
        started = true
        return 'running'
      }
      if (agent.behavior === 'goTo') return 'running'
      started = false
      return agent.behavior === 'idle' ? 'success' : 'failure'
    },
    reset() {
      started = false
    },
  }
}

/**
 * Leaf that keeps `agent` patrolling `waypoints`: (re)starts the patrol
 * whenever the agent is not already in `patrol` mode, and always returns
 * `'running'`. Combine with {@link parallel}`('any', ...)` and a condition
 * to patrol *until* something happens.
 */
export function patrolAction<B = unknown>(
  agent: Agent,
  waypoints: [number, number][],
  options?: PatrolOptions
): BTNode<B> {
  return {
    tick() {
      if (agent.behavior !== 'patrol') agent.patrol(waypoints, options)
      return 'running'
    },
    reset: noop,
  }
}

/** Leaf that idles the agent (no-op when already idle) and returns success. */
export function idleAction<B = unknown>(agent: Agent): BTNode<B> {
  return {
    tick() {
      if (agent.behavior !== 'idle') agent.idle()
      return 'success'
    },
    reset: noop,
  }
}

/** Condition: success when the agent is within `radius` of `point` (inclusive). */
export function isNearCondition<B = unknown>(
  agent: Agent,
  point: [number, number],
  radius: number
): BTNode<B> {
  return {
    tick: () =>
      Math.hypot(agent.position[0] - point[0], agent.position[1] - point[1]) <= radius
        ? 'success'
        : 'failure',
    reset: noop,
  }
}
