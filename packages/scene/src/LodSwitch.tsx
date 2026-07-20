import { useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Vec3 } from '@overworld-engine/core'
import { useGLTF } from '@react-three/drei'
import { playerPositionRef } from './playerStore'
import { selectLodLevel, type LodLevel } from './lod'

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
 * the selected level index changes (not every frame). Preloads the adjacent
 * farther level so switches don't hitch.
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
      // Preload the adjacent farther level to avoid a hitch on the next switch.
      const ahead = levels[next + 1]
      if (ahead) useGLTF.preload(ahead.modelPath)
    }
  })

  return <>{render(levels[index]!.modelPath)}</>
}
