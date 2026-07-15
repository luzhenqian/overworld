/**
 * Base building component — shared across all scenes.
 * Handles: model loading, nearby highlighting, name label, glow effect and
 * interaction hint bubble. Nearby state is read from the scene store
 * (populated by `useProximityDetection`).
 */
import { useRef } from 'react'
import { Text, Billboard } from '@react-three/drei'
import * as THREE from 'three'
import type { Vec3 } from '@overworld/core'
import { useSceneStore } from './sceneStore'
import { useModelLoader } from './useModelLoader'
import type { BuildingTheme } from './types'

export interface BaseBuildingProps {
  buildingId: string
  /** Display name shown above the building when nearby. */
  name: string
  /** GLTF/GLB model URL. */
  modelPath: string
  position: Vec3
  rotation: Vec3
  scale: number
  theme: BuildingTheme
  /** Text inside the default interaction bubble. Default: "E". */
  interactLabel?: string
  /** Custom interaction hint replacing the default bubble when nearby. */
  interactHint?: (id: string) => React.ReactNode
  /** Optional font URL for labels (drei `Text` default font when omitted). */
  labelFont?: string
}

export function BaseBuilding({
  buildingId,
  name,
  modelPath,
  position,
  rotation,
  scale,
  theme,
  interactLabel = 'E',
  interactHint,
  labelFont,
}: BaseBuildingProps) {
  const groupRef = useRef<THREE.Group>(null)

  const model = useModelLoader({ modelPath })
  const isNearby = useSceneStore((state) => state.nearbyBuildingId === buildingId)

  return (
    <group ref={groupRef} position={position}>
      {/* Building model with rotation */}
      <group rotation={rotation}>
        {model ? (
          <primitive object={model} scale={scale} />
        ) : (
          <mesh castShadow receiveShadow>
            <boxGeometry args={[8, 12, 8]} />
            <meshStandardMaterial
              color={theme.fallbackBoxColor}
              emissive={theme.fallbackEmissive}
              emissiveIntensity={0.3}
              metalness={0.5}
              roughness={0.5}
            />
          </mesh>
        )}
      </group>

      {/* Building name label */}
      {isNearby && (
        <Billboard position={[0, 6, 0]} follow={true}>
          <group>
            <mesh position={[0, 0, -0.01]}>
              <planeGeometry args={[name.length * 0.3 + 1, 0.8]} />
              <meshBasicMaterial color={theme.nameLabelBg} transparent opacity={0.9} />
            </mesh>
            <Text
              fontSize={0.5}
              color={theme.primaryColor}
              anchorX="center"
              anchorY="middle"
              outlineWidth={0.02}
              outlineColor="#000000"
              font={labelFont}
            >
              {name}
            </Text>
          </group>
        </Billboard>
      )}

      {/* Glow effect */}
      {isNearby && (
        <pointLight position={[0, 4, 0]} color={theme.glowColor} intensity={20} distance={15} />
      )}

      {/* Interaction hint */}
      {isNearby &&
        (interactHint ? (
          interactHint(buildingId)
        ) : (
          <Billboard position={[0, 7.5, 0]} follow={true}>
            <group>
              <mesh position={[0, 0, -0.01]}>
                <circleGeometry args={[0.55, 32]} />
                <meshBasicMaterial color={theme.nameLabelBg} transparent opacity={0.9} />
              </mesh>
              <mesh position={[0, 0, -0.005]}>
                <ringGeometry args={[0.48, 0.58, 32]} />
                <meshBasicMaterial color={theme.primaryColor} transparent opacity={0.8} />
              </mesh>
              <Text
                fontSize={0.4}
                color={theme.primaryColor}
                anchorX="center"
                anchorY="middle"
                outlineWidth={0.02}
                outlineColor="#000000"
              >
                {interactLabel}
              </Text>
            </group>
          </Billboard>
        ))}
    </group>
  )
}
