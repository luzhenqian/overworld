/**
 * Portal — a 3D teleportation gate that switches the active scene.
 *
 * Genericized from the source game: the model URL, label, color and target
 * scene are all props; entering a portal calls `onEnter` (or, by default,
 * `useSceneStore.getState().setScene(targetScene)` which emits
 * `scene:changed`). i18n, preloader wiring and district flavor stay in the
 * game layer.
 */
import { Suspense, useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { Text, Billboard } from '@react-three/drei'
import type { Vec3 } from '@overworld/core'
import { useSceneStore } from './sceneStore'
import { playerPositionRef } from './playerStore'
import { useModelLoader } from './useModelLoader'
import { ModelErrorBoundary } from './ModelErrorBoundary'

const DEFAULT_INTERACTION_DISTANCE = 6
const DEFAULT_COLOR = '#7dd3fc'

export interface PortalProps {
  position: Vec3
  /** Scene id passed to `onEnter` / `setScene` when the portal is used. */
  targetScene: string
  /** Label shown above the portal. Default: the target scene id. */
  label?: string
  /** Accent color for label, rings and glow. */
  color?: string
  /** GLTF/GLB model URL. When omitted, a glowing torus is rendered. */
  modelUrl?: string
  scale?: number
  rotation?: Vec3
  /** Distance at which the portal becomes interactive. Default: 6. */
  interactionDistance?: number
  /** Always show the label, not only when nearby/hovered. */
  alwaysShowLabel?: boolean
  /** Disabled portals show a grayed label and cannot be entered. */
  disabled?: boolean
  /** Extra line shown under the label while disabled. */
  disabledLabel?: string
  /** Key that triggers the portal while nearby. Default: "e". */
  interactKey?: string
  /** Return true to ignore the interact key (dialogue/modal open, ...). */
  isInputBlocked?: () => boolean
  /** Custom enter handler. Default: switch scenes via the scene store. */
  onEnter?: (targetScene: string) => void
  /** Optional font URL for the label. */
  labelFont?: string
}

/** Loaded portal model, or null-safe torus fallback. */
function PortalModel({ url, scale, color }: { url: string; scale: number; color: string }) {
  const model = useModelLoader({ modelPath: url })
  if (!model) return <PortalFallback color={color} />
  return <primitive object={model} scale={scale} />
}

function PortalFallback({ color }: { color: string }) {
  return (
    <mesh>
      <torusGeometry args={[2, 0.3, 16, 32]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.5} />
    </mesh>
  )
}

export function Portal({
  position,
  targetScene,
  label,
  color = DEFAULT_COLOR,
  modelUrl,
  scale = 3,
  rotation = [0, 0, 0],
  interactionDistance = DEFAULT_INTERACTION_DISTANCE,
  alwaysShowLabel = false,
  disabled = false,
  disabledLabel,
  interactKey = 'e',
  isInputBlocked,
  onEnter,
  labelFont,
}: PortalProps) {
  const [hovered, setHovered] = useState(false)
  const [isNearby, setIsNearby] = useState(false)
  const wasNearbyRef = useRef(false)
  const groupRef = useRef<THREE.Group>(null)

  const displayLabel = label ?? targetScene

  // Keep the latest enter/blocked callbacks for the key listener
  const enterRef = useRef<() => void>(() => {})
  enterRef.current = () => {
    if (disabled) return
    if (onEnter) {
      onEnter(targetScene)
    } else {
      useSceneStore.getState().setScene(targetScene)
    }
  }
  const isInputBlockedRef = useRef(isInputBlocked)
  isInputBlockedRef.current = isInputBlocked

  // Check distance to player and animate
  useFrame((state) => {
    // Floating animation
    if (groupRef.current) {
      groupRef.current.position.y = Math.sin(state.clock.getElapsedTime() * 0.5) * 0.1
    }

    // Proximity detection
    const [px, py, pz] = playerPositionRef.current
    const dx = position[0] - px
    const dy = position[1] - py
    const dz = position[2] - pz
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz)

    const nowNearby = distance < interactionDistance

    // Only update if state changed
    if (nowNearby !== wasNearbyRef.current) {
      wasNearbyRef.current = nowNearby
      setIsNearby(nowNearby)
    }
  })

  // Interact key while nearby
  useEffect(() => {
    if (typeof window === 'undefined') return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return
      if (!wasNearbyRef.current) return
      if (e.key.toLowerCase() !== interactKey.toLowerCase()) return
      if (isInputBlockedRef.current?.()) return
      enterRef.current()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [interactKey])

  return (
    <group position={position}>
      {/* 3D portal model */}
      <group
        ref={groupRef}
        rotation={rotation}
        onClick={() => enterRef.current()}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
      >
        {modelUrl ? (
          // Key by URL so editing modelUrl resets a previous load failure.
          // The torus renders while the model loads and on load failure.
          <ModelErrorBoundary
            key={modelUrl}
            modelPath={modelUrl}
            fallback={<PortalFallback color={color} />}
          >
            <Suspense fallback={<PortalFallback color={color} />}>
              <PortalModel url={modelUrl} scale={scale} color={color} />
            </Suspense>
          </ModelErrorBoundary>
        ) : (
          <PortalFallback color={color} />
        )}
      </group>

      {/* Portal label */}
      {(alwaysShowLabel || isNearby || hovered) && (
        <Billboard position={[0, 6, 0]} follow={true}>
          <group>
            <mesh position={[0, disabled && disabledLabel ? 0.15 : 0, -0.01]}>
              <planeGeometry
                args={[
                  displayLabel.length * 0.35 + 1.5,
                  disabled && disabledLabel ? 1.4 : 0.9,
                ]}
              />
              <meshBasicMaterial color="#1e293b" transparent opacity={0.9} />
            </mesh>
            <Text
              fontSize={0.6}
              color={disabled ? '#666666' : color}
              anchorX="center"
              anchorY="middle"
              position={[0, disabled && disabledLabel ? 0.25 : 0, 0]}
              outlineWidth={0.04}
              outlineColor="#000000"
              font={labelFont}
            >
              {displayLabel}
            </Text>
            {disabled && disabledLabel && (
              <Text
                fontSize={0.35}
                color="#facc15"
                anchorX="center"
                anchorY="middle"
                position={[0, -0.35, 0]}
                outlineWidth={0.02}
                outlineColor="#000000"
                font={labelFont}
              >
                {disabledLabel}
              </Text>
            )}
          </group>
        </Billboard>
      )}

      {/* Interaction hint bubble when nearby */}
      {isNearby && !disabled && (
        <Billboard position={[0, 5, 0]} follow={true}>
          <group>
            {/* Background circle */}
            <mesh position={[0, 0, -0.01]}>
              <circleGeometry args={[0.5, 32]} />
              <meshBasicMaterial color="#1e293b" transparent opacity={0.9} />
            </mesh>
            {/* Border ring */}
            <mesh position={[0, 0, -0.005]}>
              <ringGeometry args={[0.45, 0.55, 32]} />
              <meshBasicMaterial color={color} transparent opacity={0.8} />
            </mesh>
            <Text
              fontSize={0.4}
              color={color}
              anchorX="center"
              anchorY="middle"
              outlineWidth={0.02}
              outlineColor="#000000"
            >
              {interactKey.toUpperCase()}
            </Text>
          </group>
        </Billboard>
      )}

      {/* Interaction ring on ground when nearby */}
      {isNearby && !disabled && (
        <group position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          {/* Outer ring */}
          <mesh>
            <ringGeometry args={[2.5, 2.8, 64]} />
            <meshBasicMaterial color={color} transparent opacity={0.5} />
          </mesh>
          {/* Inner ring */}
          <mesh>
            <ringGeometry args={[1.5, 1.8, 64]} />
            <meshBasicMaterial color={color} transparent opacity={0.3} />
          </mesh>
        </group>
      )}

      {/* Point light for glow effect */}
      <pointLight
        position={[0, 2, 0]}
        color={color}
        intensity={isNearby || hovered ? 35 : 20}
        distance={15}
      />
    </group>
  )
}
