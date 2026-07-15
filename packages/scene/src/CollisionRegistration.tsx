/**
 * Declarative collision registration component.
 * Registers building, NPC, and decoration colliders on mount
 * and clears them on unmount.
 */
import { useEffect } from 'react'
import * as THREE from 'three'
import { useCollisionStore } from './collisionStore'
import type { NPCConfig, BuildingConfig, DecorationInstance } from './types'

/** A set of identical decorations sharing one collision radius. */
export interface DecorationCollisionGroup {
  instances: DecorationInstance[]
  radius: number
}

const EMPTY_BUILDINGS: BuildingConfig[] = []
const EMPTY_NPCS: NPCConfig[] = []
const EMPTY_DECORATIONS: Record<string, DecorationCollisionGroup> = {}

export interface CollisionRegistrationProps {
  buildings?: BuildingConfig[]
  npcs?: NPCConfig[]
  /** Map of decoration type → { instances, collision radius }. */
  decorations?: Record<string, DecorationCollisionGroup>
  /** Collision radius used for every NPC. Default: 0.8. */
  npcCollisionRadius?: number
}

export function CollisionRegistration({
  buildings = EMPTY_BUILDINGS,
  npcs = EMPTY_NPCS,
  decorations = EMPTY_DECORATIONS,
  npcCollisionRadius = 0.8,
}: CollisionRegistrationProps) {
  const registerCollider = useCollisionStore((state) => state.registerCollider)
  const clearColliders = useCollisionStore((state) => state.clearColliders)

  useEffect(() => {
    clearColliders()

    // Buildings
    buildings.forEach((config) => {
      registerCollider({
        id: config.id,
        position: new THREE.Vector3(config.position[0], 0, config.position[2]),
        radius: config.collisionRadius,
        type: 'building',
      })
    })

    // NPCs
    npcs.forEach((config) => {
      registerCollider({
        id: config.id,
        position: new THREE.Vector3(config.position[0], 0, config.position[2]),
        radius: npcCollisionRadius,
        type: 'npc',
      })
    })

    // Decorations
    Object.entries(decorations).forEach(([type, { instances, radius }]) => {
      instances.forEach((inst, i) => {
        registerCollider({
          id: `decoration-${type}-${i}`,
          position: new THREE.Vector3(inst.position[0], 0, inst.position[2]),
          radius,
          type: 'decoration',
        })
      })
    })

    return () => {
      clearColliders()
    }
  }, [buildings, npcs, decorations, npcCollisionRadius, registerCollider, clearColliders])

  return null
}
