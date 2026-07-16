/**
 * Pure per-frame agent stepping shared by {@link NPCWalker} and
 * {@link useAgentDriver}. No three.js, no React — unit-testable headlessly.
 */
import type { Agent, AgentStatus } from './behaviors'
import type { BehaviorTree } from './behaviorTree'
import { tickTreeWithAgent } from './behaviorTree'

/** Driving options shared by {@link stepAgent}, `useAgentDriver` and `NPCWalker`. */
export interface StepAgentOptions {
  /**
   * Whether this call site advances the agent. `false` = render-only: the
   * game drives the agent elsewhere (its own `useFrame`, a system loop…),
   * and `stepAgent` becomes a no-op. @default true
   */
  driven?: boolean
  /**
   * Behavior tree to tick **instead of** a bare `agent.update`: each step
   * runs `tickTreeWithAgent(tree, agent, deltaMs)` — tree decision + agent
   * movement in one call, so there is exactly one `agent.update` per frame
   * and no double-stepping. Precedence: `driven: false` wins — the tree is
   * ignored (with a one-time warning per tree) and nothing is stepped.
   */
  tree?: BehaviorTree
}

/** Trees already warned about being passed alongside `driven: false`. */
const warnedTrees = new WeakSet<BehaviorTree>()

/**
 * Advance `agent` by `deltaMs` milliseconds — the single canonical call site
 * used by `NPCWalker` and `useAgentDriver` every frame.
 *
 * - default (`driven` !== `false`, no `tree`): calls `agent.update(deltaMs)`.
 * - with `tree`: calls {@link tickTreeWithAgent} — the tree is ticked exactly
 *   once and the agent updated exactly once per call.
 * - `driven: false`: no-op, returns `undefined` (render-only). Providing
 *   `tree` at the same time warns once per tree and still does nothing.
 *
 * @returns the {@link AgentStatus} from this step, or `undefined` when not
 * driven.
 */
export function stepAgent(
  agent: Agent,
  deltaMs: number,
  options: StepAgentOptions = {}
): AgentStatus | undefined {
  const { driven = true, tree } = options
  if (!driven) {
    if (tree && !warnedTrees.has(tree)) {
      warnedTrees.add(tree)
      console.warn(
        '[overworld/ai] `tree` was provided together with `driven: false` — ' +
          '`driven: false` wins: the tree is ignored and the component is ' +
          'render-only. Drop `driven: false` to let the tree drive the agent.'
      )
    }
    return undefined
  }
  if (tree) return tickTreeWithAgent(tree, agent, deltaMs).agent
  return agent.update(deltaMs)
}
