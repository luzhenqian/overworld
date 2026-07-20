import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { useGLTF } from '@react-three/drei'
import { useCollisionStore } from './collisionStore'
import { instanceMatrix, collidersForSets, type DecorationSet } from './decorationInstancing'

export interface DecorationsProps {
  sets: DecorationSet[]
  /** Derive + register colliders from the same instances. Default true. */
  registerCollision?: boolean
}

/** Registers colliders derived from decoration sets; separated for testability. */
export function useDecorationCollision(sets: DecorationSet[], enabled: boolean): void {
  const register = useCollisionStore((s) => s.registerCollider)
  const unregister = useCollisionStore((s) => s.unregisterCollider)
  useEffect(() => {
    if (!enabled) return
    const colliders = collidersForSets(sets)
    colliders.forEach(register)
    return () => colliders.forEach((c) => unregister(c.id))
  }, [sets, enabled, register, unregister])
}

/** Instanced meshes for one decoration set (one InstancedMesh per source mesh). */
function DecorationSetMesh({ set }: { set: DecorationSet }) {
  const { scene } = useGLTF(set.modelPath)
  const matrices = useMemo(() => set.instances.map(instanceMatrix), [set.instances])

  // Collect (geometry, material) pairs from the source model.
  const parts = useMemo(() => {
    const out: { geometry: THREE.BufferGeometry; material: THREE.Material }[] = []
    scene.traverse((child) => {
      const mesh = child as THREE.Mesh
      if (mesh.isMesh) out.push({ geometry: mesh.geometry, material: mesh.material as THREE.Material })
    })
    return out
  }, [scene])

  return (
    <>
      {parts.map((part, pi) => (
        <instancedMesh
          key={pi}
          args={[part.geometry, part.material, matrices.length]}
          castShadow
          receiveShadow
          ref={(im) => {
            if (!im) return
            matrices.forEach((m, i) => im.setMatrixAt(i, m))
            im.instanceMatrix.needsUpdate = true
          }}
        />
      ))}
    </>
  )
}

/**
 * Render dense repeated set dressing (lamps, trees, benches, pylons) as
 * instanced meshes, with collision derived from the SAME instance list — no
 * duplicate transform data to keep in sync.
 */
export function Decorations({ sets, registerCollision = true }: DecorationsProps) {
  useDecorationCollision(sets, registerCollision)
  return (
    <>
      {sets.map((set) => (
        <DecorationSetMesh key={set.id} set={set} />
      ))}
    </>
  )
}
