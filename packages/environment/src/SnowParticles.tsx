import { useMemo, useRef } from 'react'
import type * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import type { Vec3 } from '@overworld-engine/core'

/** Props for {@link SnowParticles}. */
export interface SnowParticlesProps {
  /** Number of snowflakes. @default 400 */
  count?: number
  /** Emitter box [width, height, depth] centered on `position`. @default [50, 25, 50] */
  area?: Vec3
  /** Center of the emitter box. @default [0, 0, 0] */
  position?: Vec3
  /** Flake color. @default '#ffffff' */
  color?: string
  /** Fall speed in world units per second. @default 4 */
  speed?: number
  /** Sideways sway amplitude in world units per second. @default 1.5 */
  drift?: number
  /** Point size. @default 0.12 */
  size?: number
  /** Material opacity. @default 0.85 */
  opacity?: number
}

/**
 * Generic THREE.Points snow field: flakes fall slowly with a sinusoidal
 * sideways sway (each flake on its own phase) and wrap back to the top.
 * Same particle mechanism as {@link RainParticles}, tuned and extended for
 * snow. Typically mapped to a weather id via `<WeatherVisuals/>`.
 */
export function SnowParticles({
  count = 400,
  area = [50, 25, 50],
  position = [0, 0, 0],
  color = '#ffffff',
  speed = 4,
  drift = 1.5,
  size = 0.12,
  opacity = 0.85,
}: SnowParticlesProps) {
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

  useFrame((state, delta) => {
    const points = pointsRef.current
    if (!points) return
    const attribute = points.geometry.getAttribute('position') as THREE.BufferAttribute | undefined
    if (!attribute) return
    const array = attribute.array as Float32Array
    const fall = speed * delta
    const time = state.clock.elapsedTime
    const halfWidth = width / 2
    for (let i = 0; i < count; i++) {
      const xIndex = i * 3
      const yIndex = xIndex + 1
      let y = (array[yIndex] ?? 0) - fall
      if (y < 0) y += height
      array[yIndex] = y
      // Per-flake sway: bounded oscillation, phase-shifted by index.
      let x = (array[xIndex] ?? 0) + Math.sin(time * 0.8 + i) * drift * delta
      if (x > halfWidth) x = -halfWidth
      else if (x < -halfWidth) x = halfWidth
      array[xIndex] = x
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
