/**
 * Drive a headless `ai` agent from the frame loop, publish its live position
 * into a shared ref, and move a STANDALONE NPC visual + collider. Compose
 * with ai's createAgent/patrol.
 *
 * **For NPCs that are already entries in a `SceneShell.npcs` list, prefer
 * that recipe instead**: pass a real `modelPath` on the `npcs` entry and
 * wire the same ref as `SceneShell.npcPositionRefs[id]` — `BaseNPC` itself
 * then follows the ref each frame (visual + collider), so proximity
 * detection and the selection ring come for free with no double render.
 * `<AgentNPC>` remains useful when you want a moving NPC that is NOT
 * managed by a `SceneShell` npcs list (e.g. a bespoke visual, a scene
 * without `SceneShell`, or several agents sharing one custom mesh
 * hierarchy) — it renders its own visual via `children` and moves its own
 * collider independently.
 *
 * `scene` never imports `@overworld-engine/ai` — {@link AgentLike} is a
 * local structural type matching the shape of `createAgent(...)`'s result,
 * so any object satisfying it (real agent, test double, ...) works.
 *
 * **Composition contract** (verified against `SceneShell`/`CollisionRegistration`/
 * `useProximityDetection`):
 * - `npcId` must match an entry in the `npcs` array passed to `SceneShell`
 *   (which feeds `CollisionRegistration`). Without a matching entry, no
 *   collider is ever registered for `npcId`, so this component's per-frame
 *   `setColliderPosition(npcId, ...)` call is a silent no-op.
 * - `positionRef` must be the SAME object passed as
 *   `SceneShell.npcPositionRefs[npcId]`. If `npcId` is not also in `npcs`,
 *   that ref is ignored by proximity detection and the selection ring (both
 *   derive their tracked-id list from `npcs`, not from `npcPositionRefs`).
 * - `<AgentNPC>` renders its own visual via `children`, positioned every
 *   frame from the agent. This is a SEPARATE visual from the `BaseNPC` that
 *   `SceneShell` renders for the matching `npcs` entry — if that `npcs`
 *   entry also has a `modelPath` and the SAME ref passed as
 *   `npcPositionRefs[id]`, `BaseNPC` now follows the ref too (see above),
 *   so combining it with `<AgentNPC>` on the same id would double-render.
 *   Only use `<AgentNPC>` alongside a `npcs` entry when that entry's own
 *   `modelPath` is omitted (or a different, non-moving id).
 */
import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import type { Vec3 } from '@overworld-engine/core'
import { useCollisionStore } from './collisionStore'

/** Structural view of an `ai` agent (createAgent result). No import of `ai`. */
export interface AgentLike {
  position: readonly [number, number]
  readonly heading: number
  update(deltaMs: number): unknown
}

export interface AgentNPCProps {
  /** Must match an id in the `npcs` array passed to `SceneShell` — see the composition contract above. */
  npcId: string
  agent: AgentLike
  /** Shared position ref — wire the SAME ref into SceneShell.npcPositionRefs[npcId]. */
  positionRef: { current: Vec3 }
  y?: number
  rotationOffset?: number
  /** false = render-only (agent updated elsewhere). Default true. */
  driven?: boolean
  children?: React.ReactNode
}

/**
 * Drive a headless `ai` agent from the frame loop, publish its live position
 * into a shared ref (consumed by SceneShell proximity/selection/collision),
 * and move a standalone NPC visual + collider. Compose with ai's
 * createAgent/patrol. For NPCs already listed in `SceneShell.npcs`, prefer
 * `BaseNPC`'s own `positionRef` prop instead — see the module-level doc
 * comment above for when to use which.
 */
export function AgentNPC({
  npcId,
  agent,
  positionRef,
  y = 0,
  rotationOffset = 0,
  driven = true,
  children,
}: AgentNPCProps) {
  const groupRef = useRef<Group>(null)
  const setColliderPosition = useCollisionStore((s) => s.setColliderPosition)

  useFrame((_, delta) => {
    if (driven) agent.update(delta * 1000)
    const [x, z] = agent.position
    positionRef.current[0] = x
    positionRef.current[1] = y
    positionRef.current[2] = z
    setColliderPosition(npcId, [x, y, z])
    const g = groupRef.current
    if (g) {
      g.position.set(x, y, z)
      const target = agent.heading + rotationOffset
      const diff = target - g.rotation.y
      const normalized = Math.atan2(Math.sin(diff), Math.cos(diff))
      g.rotation.y += normalized * 0.15
    }
  })

  return <group ref={groupRef}>{children}</group>
}
