/**
 * Generic selection ring that appears beneath the nearby NPC or building.
 * Reads the scene store and renders at the matching position from the
 * provided positions map.
 */
import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { Vec3 } from '@overworld-engine/core'
import { useSceneStore } from './sceneStore'
import type { NPCTheme, BuildingTheme } from './types'

export interface SelectionRingProps {
  type: 'npc' | 'building'
  /** Map of entity id → world position. */
  positions: Record<string, Vec3>
  /**
   * Live position refs (e.g. moving NPCs driven by {@link AgentNPC}). When
   * the currently-nearby entity has a ref here, the ring follows it every
   * frame instead of the static entry in `positions`. Omit for fully static
   * entities — behavior is then identical to a plain `positions` lookup.
   */
  positionRefs?: Record<string, { current: Vec3 }>
  theme: NPCTheme | BuildingTheme
  innerRadius?: number
  outerRadius?: number
  secondaryInnerRadius?: number
  secondaryOuterRadius?: number
}

export function SelectionRing({
  type,
  positions,
  positionRefs,
  theme,
  innerRadius = 2,
  outerRadius = 2.4,
  secondaryInnerRadius = 1.2,
  secondaryOuterRadius = 1.6,
}: SelectionRingProps) {
  const nearbyNpcId = useSceneStore((state) => state.nearbyNpcId)
  const nearbyBuildingId = useSceneStore((state) => state.nearbyBuildingId)
  const groupRef = useRef<THREE.Group>(null)

  const nearbyEntity = type === 'npc' ? nearbyNpcId : nearbyBuildingId
  const position = nearbyEntity ? positions[nearbyEntity] : undefined

  useFrame(() => {
    const g = groupRef.current
    if (!g || !nearbyEntity) return
    const live = positionRefs?.[nearbyEntity]?.current
    if (live) g.position.set(live[0], 0.15, live[2])
  })

  if (!position) return null

  return (
    <group ref={groupRef} position={[position[0], 0.15, position[2]]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[innerRadius, outerRadius, 64]} />
        <meshBasicMaterial
          color={theme.ringColor}
          transparent
          opacity={theme.ringOpacity}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[secondaryInnerRadius, secondaryOuterRadius, 64]} />
        <meshBasicMaterial
          color={theme.ringColor}
          transparent
          opacity={theme.ringOpacity * 0.57}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  )
}
