import { useMemo, useRef } from 'react'
import type * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import type { Vec3 } from '@overworld-engine/core'

/** Props for {@link RainParticles}. */
export interface RainParticlesProps {
  /** Number of raindrops. @default 300 */
  count?: number
  /** Emitter box [width, height, depth] centered on `position`. @default [50, 25, 50] */
  area?: Vec3
  /** Center of the emitter box (drops fall from its top face). @default [0, 0, 0] */
  position?: Vec3
  /** Drop color. @default '#88ccff' */
  color?: string
  /** Fall speed in world units per second. @default 30 */
  speed?: number
  /** Point size. @default 0.05 */
  size?: number
  /** Material opacity. @default 0.6 */
  opacity?: number
}

/**
 * Generic THREE.Points rain field: drops fall inside a box and wrap back to
 * the top. Ported from the source game's rain effect, with area/speed/color
 * fully parameterized and no scene-specific logic. Typically mapped to a
 * weather id via `<WeatherVisuals/>`.
 */
export function RainParticles({
  count = 300,
  area = [50, 25, 50],
  position = [0, 0, 0],
  color = '#88ccff',
  speed = 30,
  size = 0.05,
  opacity = 0.6,
}: RainParticlesProps) {
  const pointsRef = useRef<THREE.Points>(null)
  const [width, height, depth] = area

  const positions = useMemo(() => {
    const array = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      array[i * 3] = (Math.random() - 0.5) * width
      array[i * 3 + 1] = Math.random() * height
      array[i * 3 + 2] = (Math.random() - 0.5) * depth
    }
    return array
  }, [count, width, height, depth])

  useFrame((_, delta) => {
    const points = pointsRef.current
    if (!points) return
    const attribute = points.geometry.getAttribute('position') as THREE.BufferAttribute | undefined
    if (!attribute) return
    const array = attribute.array as Float32Array
    const fall = speed * delta
    for (let i = 0; i < count; i++) {
      const yIndex = i * 3 + 1
      let y = (array[yIndex] ?? 0) - fall
      if (y < 0) y += height
      array[yIndex] = y
    }
    attribute.needsUpdate = true
  })

  return (
    <points ref={pointsRef} position={position}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={size}
        color={color}
        transparent
        opacity={opacity}
        sizeAttenuation
        depthWrite={false}
      />
    </points>
  )
}
