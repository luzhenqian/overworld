import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { useCollisionStore } from './collisionStore'
import { playerPositionRef } from './playerStore'
import { instanceMatrix, collidersForSets, selectDecorationModel, type DecorationSet } from './decorationInstancing'
import { useQualityStore, qualityToLodCap } from './quality'
import type { LodLevel } from './lod'

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
  // Model path for the currently selected LOD level. Sets without `lod`
  // never diverge from `set.modelPath` (the useFrame below early-returns).
  const [modelPath, setModelPath] = useState(set.modelPath)
  const indexRef = useRef(0)
  const lodCap = useQualityStore((s) => qualityToLodCap(s.preset === 'custom' ? 'high' : s.preset))
  useFrame(() => {
    if (!set.lod || set.lod.length === 0) return
    const p = playerPositionRef.current
    const { index, modelPath: next } = selectDecorationModel(set, { x: p[0], z: p[2] }, indexRef.current, lodCap)
    if (index !== indexRef.current) {
      indexRef.current = index
      setModelPath(next)
      // Preload the neighboring LOD level so an uncached switch doesn't suspend.
      const levels: LodLevel[] = [{ distance: 0, modelPath: set.modelPath }, ...set.lod]
      const preloadPath = levels[index + 1]?.modelPath
      if (preloadPath) useGLTF.preload(preloadPath)
    }
  })

  const { scene } = useGLTF(modelPath)
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
          key={`${modelPath}-${pi}`}
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
        <Suspense key={set.id} fallback={null}>
          <DecorationSetMesh set={set} />
        </Suspense>
      ))}
    </>
  )
}
