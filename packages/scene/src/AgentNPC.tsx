/**
 * Drive a headless `ai` agent from the frame loop, publish its live position
 * into a shared ref (consumed by SceneShell proximity/selection/collision),
 * and move the NPC visual + collider. Compose with ai's createAgent/patrol.
 *
 * `scene` never imports `@overworld-engine/ai` — {@link AgentLike} is a
 * local structural type matching the shape of `createAgent(...)`'s result,
 * so any object satisfying it (real agent, test double, ...) works.
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
 * and move the NPC visual + collider. Compose with ai's createAgent/patrol.
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
