import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import type { Environment } from './createEnvironment'
import { getDaylightFactor } from './phase'
import {
  resolvePreset,
  resolveLight,
  resolveExposure,
  type WorldEnvironmentPreset,
  type WorldEnvironmentPresetName,
} from './worldEnvironment'

export interface WorldEnvironmentProps {
  preset?: WorldEnvironmentPresetName | WorldEnvironmentPreset
  /** Optional day/night engine: light/fog follow its time-of-day when present. */
  engine?: Environment
  /** Quality hint (structural; game passes useQualityStore.getState().settings). */
  quality?: { shadows: boolean; shadowMapSize: number; particleMultiplier: number }
  children?: React.ReactNode
}

function Stars({ count, multiplier }: { count: number; multiplier: number }) {
  const geom = useMemo(() => {
    const n = Math.max(0, Math.floor(count * multiplier))
    const positions = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      // deterministic-ish scatter on a dome; index-based to avoid Math.random in tests
      const a = (i * 2.399963) % (Math.PI * 2)
      const r = 200 + ((i * 53) % 60)
      positions[i * 3] = Math.cos(a) * r
      positions[i * 3 + 1] = 40 + ((i * 17) % 120)
      positions[i * 3 + 2] = Math.sin(a) * r
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    return g
  }, [count, multiplier])
  return (
    <points geometry={geom}>
      <pointsMaterial color="#ffffff" size={0.8} sizeAttenuation />
    </points>
  )
}

/**
 * Quality-aware environment layer: sky, fog, ground, lighting, stars from a
 * named or custom preset. Custom R3F children still render on top. When an
 * `engine` is supplied, light/fog interpolate with its time of day.
 */
export function WorldEnvironment({ preset = 'clear-noon', engine, quality, children }: WorldEnvironmentProps) {
  const resolved = resolvePreset(preset)
  const scene = useThree((s) => s.scene)
  const gl = useThree((s) => s.gl)
  const ambientRef = useRef<THREE.AmbientLight>(null)
  const sunRef = useRef<THREE.DirectionalLight>(null)
  const fogRef = useRef<THREE.Fog | THREE.FogExp2 | null>(null)

  // Static fog install (updated per-frame when engine present)
  const fog = useMemo(() => {
    if (!resolved.fog) return null
    const f =
      'density' in resolved.fog
        ? new THREE.FogExp2(resolved.fog.color, resolved.fog.density)
        : new THREE.Fog(resolved.fog.color, resolved.fog.near, resolved.fog.far)
    return f
  }, [resolved.fog])

  fogRef.current = fog
  scene.fog = fog

  const daylight0 = engine ? getDaylightFactor(engine.store.getState().timeOfDay, engine.phases) : 1
  const light0 = resolveLight(resolved, daylight0)
  gl.toneMappingExposure = resolveExposure(resolved, daylight0)

  useFrame(() => {
    if (!engine) return
    const d = getDaylightFactor(engine.store.getState().timeOfDay, engine.phases)
    const l = resolveLight(resolved, d)
    if (ambientRef.current) {
      ambientRef.current.intensity = l.ambient.intensity
      ambientRef.current.color.set(l.ambient.color)
    }
    if (sunRef.current) {
      sunRef.current.intensity = l.sun.intensity
      sunRef.current.color.set(l.sun.color)
    }
    gl.toneMappingExposure = resolveExposure(resolved, d)
  })

  const shadows = quality?.shadows ?? true
  const shadowMapSize = quality?.shadowMapSize ?? 2048
  const multiplier = quality?.particleMultiplier ?? 1
  const starCount = resolved.stars === true ? 800 : resolved.stars ? resolved.stars.count : 0

  return (
    <>
      <ambientLight ref={ambientRef} color={light0.ambient.color} intensity={light0.ambient.intensity} />
      <directionalLight
        ref={sunRef}
        color={light0.sun.color}
        intensity={light0.sun.intensity}
        position={light0.sun.position}
        castShadow={shadows && light0.sun.castShadow}
        shadow-mapSize={[shadowMapSize, shadowMapSize]}
      />
      {resolved.ground !== false && resolved.ground && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
          <planeGeometry args={[resolved.ground.size ?? 400, resolved.ground.size ?? 400]} />
          <meshStandardMaterial
            color={resolved.ground.color}
            roughness={resolved.ground.roughness ?? 1}
            metalness={resolved.ground.metalness ?? 0}
          />
        </mesh>
      )}
      {resolved.sky && 'top' in resolved.sky && (
        <mesh scale={[-1, 1, 1]}>
          <sphereGeometry args={[500, 16, 16]} />
          <meshBasicMaterial side={THREE.BackSide} color={resolved.sky.bottom} />
        </mesh>
      )}
      {starCount > 0 && <Stars count={starCount} multiplier={multiplier} />}
      {children}
    </>
  )
}
