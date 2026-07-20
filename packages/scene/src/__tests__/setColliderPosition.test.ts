import { beforeEach, describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { useCollisionStore } from '../collisionStore'

describe('setColliderPosition', () => {
  beforeEach(() => useCollisionStore.getState().clearColliders())
  it('moves an existing collider without re-creating it', () => {
    const s = useCollisionStore.getState()
    s.registerCollider({ id: 'npc1', position: new THREE.Vector3(0, 0, 0), radius: 1, type: 'npc' })
    s.setColliderPosition('npc1', [5, 0, 7])
    const c = useCollisionStore.getState().colliders.get('npc1')!
    expect(c.position.x).toBe(5)
    expect(c.position.z).toBe(7)
  })
  it('is a no-op for unknown ids', () => {
    useCollisionStore.getState().setColliderPosition('ghost', [1, 0, 1])
    expect(useCollisionStore.getState().colliders.size).toBe(0)
  })
})
