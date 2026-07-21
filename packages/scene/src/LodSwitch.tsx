import { useEffect, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Vec3 } from '@overworld-engine/core'
import { useGLTF } from '@react-three/drei'
import { playerPositionRef } from './playerStore'
import { selectLodLevel, orderPreload, type LodLevel } from './lod'

export interface LodProps {
  position: Vec3
  /** Levels near→far, including the base as the first entry. */
  levels: LodLevel[]
  hysteresis?: number
  deviceCap?: number
  /** Dispose GPU resources of clones this component created, on unmount. Default true. */
  dispose?: boolean
  render: (modelPath: string) => React.ReactNode
}

/**
 * Distance-based LOD switch driven by playerPositionRef. Re-renders only when
 * the selected level index changes (not every frame). Preloads the next two
 * nearest-first levels around the new index so switches don't hitch, and
 * disposes the geometries/materials of its own previously-mounted clone on
 * unmount (never the shared drei GLTF cache — other entities may still use
 * the source model).
 */
export function Lod({ position, levels, hysteresis, deviceCap, dispose = true, render }: LodProps) {
  const [index, setIndex] = useState(0)
  const indexRef = useRef(0)
  const groupRef = useRef<import('three').Group>(null)

  useFrame(() => {
    const p = playerPositionRef.current
    const dx = p[0] - position[0]
    const dz = p[2] - position[2]
    const dist = Math.sqrt(dx * dx + dz * dz)
    const { index: next } = selectLodLevel(dist, levels, {
      prevIndex: indexRef.current,
      hysteresis,
      deviceCap,
    })
    if (next !== indexRef.current) {
      indexRef.current = next
      setIndex(next)
      // Priority preload: nearest-first around the new index (bounded to the next 2).
      for (const i of orderPreload(levels, next).slice(0, 2)) {
        useGLTF.preload(levels[i]!.modelPath)
      }
    }
  })

  // Dispose only the geometries/materials of clones THIS <Lod> mounted — never
  // useGLTF.clear() on the shared cache (another entity may still use the source).
  useEffect(() => {
    if (!dispose) return
    const group = groupRef.current
    return () => {
      group?.traverse((child) => {
        const mesh = child as import('three').Mesh
        if (!mesh.isMesh) return
        mesh.geometry?.dispose?.()
        const mat = mesh.material as import('three').Material | import('three').Material[]
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose?.())
        else mat?.dispose?.()
      })
    }
  }, [dispose])

  return <group ref={groupRef}>{render(levels[index]!.modelPath)}</group>
}
