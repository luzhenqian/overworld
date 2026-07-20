/**
 * Circular-collider registry with push-out resolution on the X/Z plane.
 * Scenes register colliders (via {@link CollisionRegistration} or manually);
 * the player controller calls `resolveCollision` each frame before moving.
 */
import { create } from 'zustand'
import * as THREE from 'three'
import type { EntityKind, Vec3 } from '@overworld-engine/core'

/** One registered circular collider (X/Z plane, `position.y` is ignored). */
export interface Collider {
  id: string
  position: THREE.Vector3
  radius: number
  type: EntityKind
}

interface CollisionState {
  colliders: Map<string, Collider>

  // Actions
  registerCollider: (collider: Collider) => void
  unregisterCollider: (id: string) => void
  clearColliders: () => void
  /** Move an existing collider in place (no-op if unknown). For moving NPCs. */
  setColliderPosition: (id: string, position: Vec3) => void

  /** Return the first collider overlapping the given circle, or null. */
  checkCollision: (
    position: THREE.Vector3,
    radius: number,
    excludeId?: string
  ) => Collider | null

  /** Resolve a movement target by pushing it out of any overlapping colliders. */
  resolveCollision: (
    currentPos: THREE.Vector3,
    targetPos: THREE.Vector3,
    playerRadius: number
  ) => THREE.Vector3
}

export const useCollisionStore = create<CollisionState>((set, get) => ({
  colliders: new Map(),

  registerCollider: (collider) => {
    set((state) => {
      const newColliders = new Map(state.colliders)
      newColliders.set(collider.id, collider)
      return { colliders: newColliders }
    })
  },

  unregisterCollider: (id) => {
    set((state) => {
      const newColliders = new Map(state.colliders)
      newColliders.delete(id)
      return { colliders: newColliders }
    })
  },

  clearColliders: () => {
    set({ colliders: new Map() })
  },

  setColliderPosition: (id, position) => {
    set((state) => {
      const existing = state.colliders.get(id)
      if (!existing) return state
      const next = new Map(state.colliders)
      next.set(id, { ...existing, position: new THREE.Vector3(position[0], 0, position[2]) })
      return { colliders: next }
    })
  },

  checkCollision: (position, radius, excludeId) => {
    const { colliders } = get()

    for (const [id, collider] of colliders) {
      if (excludeId && id === excludeId) continue

      // 2D distance check (X-Z plane)
      const dx = position.x - collider.position.x
      const dz = position.z - collider.position.z
      const distance = Math.sqrt(dx * dx + dz * dz)
      const minDistance = radius + collider.radius

      if (distance < minDistance) {
        return collider
      }
    }

    return null
  },

  resolveCollision: (_currentPos, targetPos, playerRadius) => {
    const { colliders } = get()
    const resolvedPos = targetPos.clone()

    // Iterate multiple times to handle multiple collisions
    for (let iteration = 0; iteration < 3; iteration++) {
      let hasCollision = false

      for (const [, collider] of colliders) {
        // 2D distance check (X-Z plane)
        const dx = resolvedPos.x - collider.position.x
        const dz = resolvedPos.z - collider.position.z
        const distance = Math.sqrt(dx * dx + dz * dz)
        const minDistance = playerRadius + collider.radius

        if (distance < minDistance && distance > 0.001) {
          hasCollision = true

          // Push player out along the collision normal
          const overlap = minDistance - distance
          const nx = dx / distance
          const nz = dz / distance

          resolvedPos.x += nx * overlap
          resolvedPos.z += nz * overlap
        }
      }

      if (!hasCollision) break
    }

    return resolvedPos
  },
}))
