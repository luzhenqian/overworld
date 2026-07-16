/**
 * R3F bindings: drive a headless {@link Agent} from the frame loop and apply
 * its position/heading to a group. The game supplies the visual as children
 * (a model, a mesh, a BaseNPC-like component…).
 */
import { useFrame } from '@react-three/fiber'
import { useRef, type ReactNode, type RefObject } from 'react'
import type { Group } from 'three'
import type { Agent } from './behaviors'
import { stepAgent, type StepAgentOptions } from './driver'

/** Options shared by {@link useAgentDriver} and {@link NPCWalker}. */
export interface AgentDriverOptions extends StepAgentOptions {
  /** World Y of the group. @default 0 */
  y?: number
  /**
   * Added to the agent's heading before applying it to `rotation.y`, for
   * models that don't face +Z at rest (e.g. `-Math.PI / 2` like the scene
   * Player's model). @default 0
   */
  rotationOffset?: number
  /** Per-frame rotation smoothing factor in (0, 1]; 1 = snap. @default 0.15 */
  rotationLerp?: number
  /**
   * Called on the frame a behavior-level destination is reached, with the
   * patrol waypoint index (or `0` for wander/follow arrivals). Only fires
   * when this component drives the agent (`driven` !== `false`).
   */
  onArrive?: (waypointIndex: number) => void
}

/**
 * Hook form of {@link NPCWalker}: every frame steps the agent (see
 * {@link stepAgent} — plain `agent.update`, or `tickTreeWithAgent` when a
 * `tree` is given, or nothing when `driven: false`), then writes the agent's
 * position and smoothed heading to the returned ref. Attach the ref to your
 * own `<group>`.
 *
 * With `driven: false` the hook is render-only: the group still follows the
 * agent's position/heading, but the agent must be updated elsewhere.
 * `driven: false` takes precedence over `tree` (warns once per tree).
 */
export function useAgentDriver(
  agent: Agent,
  options: AgentDriverOptions = {}
): RefObject<Group> {
  const ref = useRef<Group>(null)
  const { y = 0, rotationOffset = 0, rotationLerp = 0.15, onArrive, driven, tree } = options

  useFrame((_, delta) => {
    const status = stepAgent(agent, delta * 1000, { driven, tree })
    const group = ref.current
    if (group) {
      const [px, pz] = status ? status.position : agent.position
      group.position.set(px, y, pz)
      const target = (status ? status.heading : agent.heading) + rotationOffset
      const diff = target - group.rotation.y
      // Shortest-arc smoothing, same scheme as the scene Player.
      const normalized = Math.atan2(Math.sin(diff), Math.cos(diff))
      group.rotation.y += normalized * rotationLerp
    }
    if (status?.arrived !== undefined) onArrive?.(status.arrived)
  })

  return ref
}

/** Props for {@link NPCWalker}. */
export interface NPCWalkerProps extends AgentDriverOptions {
  /** The headless agent to drive (created with `createAgent`). */
  agent: Agent
  /** The NPC visual — any model or mesh; rendered inside the moving group. */
  children?: ReactNode
}

/**
 * Group that follows an {@link Agent}: steps it every frame, positions the
 * group at `[x, y, z]` from the agent's `[x, z]`, and rotates smoothly toward
 * its heading. Renders nothing of its own — pass the visual as children.
 *
 * ```tsx
 * const guard = createAgent({ grid, position: [4, 2], speed: 1.5 })
 * guard.patrol([[4, 2], [12, 2], [12, 10]], { pauseMs: 800 })
 *
 * <NPCWalker agent={guard} onArrive={(i) => console.log('waypoint', i)}>
 *   <GuardModel />
 * </NPCWalker>
 * ```
 *
 * Composing with a behavior tree — pass `tree` and NPCWalker becomes the one
 * call site that runs `tickTreeWithAgent(tree, agent, deltaMs)` per frame
 * (tree decision + agent movement, no double-stepping):
 *
 * ```tsx
 * <NPCWalker agent={enemy.agent} tree={enemy.tree}>
 *   <SkeletonModel />
 * </NPCWalker>
 * ```
 *
 * Driving the agent yourself (game loop, custom system)? `driven={false}`
 * makes NPCWalker render-only — it keeps following the agent's position and
 * heading but never calls `agent.update`. Precedence: `driven={false}` wins
 * over `tree` (the tree is ignored, with a one-time warning per tree).
 */
export function NPCWalker({ agent, children, ...options }: NPCWalkerProps) {
  const ref = useAgentDriver(agent, options)
  return <group ref={ref}>{children}</group>
}
