import { beforeEach, describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { useCollisionStore, type Collider } from '../collisionStore'

function makeCollider(id: string, x: number, z: number, radius: number): Collider {
  return { id, position: new THREE.Vector3(x, 0, z), radius, type: 'building' }
}

describe('collisionStore', () => {
  beforeEach(() => {
    useCollisionStore.getState().clearColliders()
  })

  it('registers and unregisters colliders', () => {
    const { registerCollider, unregisterCollider } = useCollisionStore.getState()
    registerCollider(makeCollider('a', 0, 0, 1))
    registerCollider(makeCollider('b', 5, 5, 1))
    expect(useCollisionStore.getState().colliders.size).toBe(2)

    unregisterCollider('a')
    expect(useCollisionStore.getState().colliders.size).toBe(1)
    expect(useCollisionStore.getState().colliders.has('b')).toBe(true)
  })

  it('replaces a collider registered with the same id', () => {
    const { registerCollider } = useCollisionStore.getState()
    registerCollider(makeCollider('a', 0, 0, 1))
    registerCollider(makeCollider('a', 3, 0, 2))
    const collider = useCollisionStore.getState().colliders.get('a')
    expect(useCollisionStore.getState().colliders.size).toBe(1)
    expect(collider?.position.x).toBe(3)
    expect(collider?.radius).toBe(2)
  })

  it('clearColliders removes everything', () => {
    const { registerCollider, clearColliders } = useCollisionStore.getState()
    registerCollider(makeCollider('a', 0, 0, 1))
    clearColliders()
    expect(useCollisionStore.getState().colliders.size).toBe(0)
  })

  describe('checkCollision', () => {
    it('returns the overlapping collider', () => {
      useCollisionStore.getState().registerCollider(makeCollider('wall', 0, 0, 2))
      const hit = useCollisionStore
        .getState()
        .checkCollision(new THREE.Vector3(2, 0, 0), 0.5)
      expect(hit?.id).toBe('wall')
    })

    it('returns null when nothing overlaps', () => {
      useCollisionStore.getState().registerCollider(makeCollider('wall', 0, 0, 2))
      const hit = useCollisionStore
        .getState()
        .checkCollision(new THREE.Vector3(10, 0, 0), 0.5)
      expect(hit).toBeNull()
    })

    it('ignores the excluded id', () => {
      useCollisionStore.getState().registerCollider(makeCollider('self', 0, 0, 2))
      const hit = useCollisionStore
        .getState()
        .checkCollision(new THREE.Vector3(0, 0, 0), 0.5, 'self')
      expect(hit).toBeNull()
    })

    it('checks distance on the X/Z plane only (Y is ignored)', () => {
      useCollisionStore.getState().registerCollider(makeCollider('wall', 0, 0, 2))
      const hit = useCollisionStore
        .getState()
        .checkCollision(new THREE.Vector3(0, 100, 0), 0.5)
      expect(hit?.id).toBe('wall')
    })
  })

  describe('resolveCollision', () => {
    it('returns the target position unchanged when there is no overlap', () => {
      useCollisionStore.getState().registerCollider(makeCollider('wall', 0, 0, 1))
      const target = new THREE.Vector3(10, 0, 10)
      const resolved = useCollisionStore
        .getState()
        .resolveCollision(new THREE.Vector3(9, 0, 9), target, 0.5)
      expect(resolved.x).toBe(10)
      expect(resolved.z).toBe(10)
    })

    it('pushes the player out along the collision normal', () => {
      useCollisionStore.getState().registerCollider(makeCollider('wall', 0, 0, 2))
      // Target overlaps: distance 1 < minDistance 2.5
      const resolved = useCollisionStore
        .getState()
        .resolveCollision(new THREE.Vector3(3, 0, 0), new THREE.Vector3(1, 0, 0), 0.5)
      // Pushed out along +X to exactly radius + playerRadius
      expect(resolved.x).toBeCloseTo(2.5, 5)
      expect(resolved.z).toBeCloseTo(0, 5)
    })

    it('resolves against multiple colliders over several iterations', () => {
      const { registerCollider, resolveCollision } = useCollisionStore.getState()
      registerCollider(makeCollider('a', 0, 0, 2))
      registerCollider(makeCollider('b', 4, 0, 2))
      const resolved = resolveCollision(
        new THREE.Vector3(2, 0, 3),
        new THREE.Vector3(2, 0, 0.5),
        0.5
      )
      // The solver iterates at most 3 times, so a tiny residual overlap may
      // remain — assert the target (deeply inside both) was pushed near the
      // combined radius (2.5) of each collider.
      const distA = Math.hypot(resolved.x - 0, resolved.z - 0)
      const distB = Math.hypot(resolved.x - 4, resolved.z - 0)
      expect(distA).toBeGreaterThan(2.4)
      expect(distB).toBeGreaterThan(2.4)
    })

    it('does not divide by zero when exactly on a collider center', () => {
      useCollisionStore.getState().registerCollider(makeCollider('wall', 0, 0, 2))
      const resolved = useCollisionStore
        .getState()
        .resolveCollision(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 0), 0.5)
      expect(Number.isFinite(resolved.x)).toBe(true)
      expect(Number.isFinite(resolved.z)).toBe(true)
    })
  })
})
