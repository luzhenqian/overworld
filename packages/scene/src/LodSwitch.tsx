import { useRef, useState } from 'react'
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
  render: (modelPath: string) => React.ReactNode
}

/**
 * Distance-based LOD switch driven by playerPositionRef. Re-renders only when
 * the selected level index changes (not every frame). Preloads the next two
 * nearest-first levels around the new index so switches don't hitch.
 *
 * Does NOT dispose geometries/materials: useModelLoader/useModelClips build
 * models via gltf.scene.clone(), which shares BufferGeometry/Material by
 * reference with drei's global GLTF cache and every sibling entity using the
 * same modelPath. Per-instance disposal on unmount would corrupt other live
 * entities and future mounts.
 */
export function Lod({ position, levels, hysteresis, deviceCap, render }: LodProps) {
  const [index, setIndex] = useState(0)
  const indexRef = useRef(0)

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

  return <>{render(levels[index]!.modelPath)}</>
}
