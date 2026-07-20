/**
 * Base building component — shared across all scenes.
 * Handles: model loading, nearby highlighting, name label, glow effect and
 * interaction hint bubble. Nearby state is read from the scene store
 * (populated by `useProximityDetection`).
 *
 * Model loading: the model subtree is wrapped in `<Suspense>` plus a
 * {@link ModelErrorBoundary} (keyed by `modelPath`, so changing the path
 * retries). The themed fallback box renders while the model loads, when it
 * fails to load, and when `modelPath` is omitted.
 */
import { Suspense, useRef } from 'react'
import { Text, Billboard } from '@react-three/drei'
import * as THREE from 'three'
import type { Vec3 } from '@overworld-engine/core'
import { useSceneStore } from './sceneStore'
import { useModelLoader } from './useModelLoader'
import { ModelErrorBoundary } from './ModelErrorBoundary'
import { buildingVisualHeights } from './visualHeights'
import { SpriteLabel } from './SpriteLabel'
import { Lod } from './LodSwitch'
import type { LodLevel } from './lod'
import type { BuildingTheme, LabelMode } from './types'

export interface BaseBuildingProps {
  buildingId: string
  /** Display name shown above the building when nearby. */
  name: string
  /** GLTF/GLB model URL. When omitted, the themed fallback box renders. */
  modelPath?: string
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
  /**
   * How label text (name, interaction bubble) is rendered: `'troika'`
   * (default) uses drei `Text`; `'sprite'` uses the DOM-less
   * {@link SpriteLabel} (canvas texture + `THREE.Sprite`) — required on
   * platforms without troika support, e.g. WeChat mini-games. Sprite mode
   * uses the system font (`labelFont` is ignored).
   */
  labelMode?: LabelMode
  /**
   * Name-label height in world units, overriding the scale-proportional
   * default (`6 × scale`). The interaction bubble keeps its offset above it.
   * See {@link buildingVisualHeights}.
   */
  labelHeight?: number
  /**
   * Optional distance LODs (near→far); `modelPath` is treated as LOD0. When
   * present, the model switches based on distance to the player via `<Lod>`.
   */
  lods?: LodLevel[]
}

/** Themed placeholder box: loading state, load failure and no-model buildings. */
function BuildingFallback({
  theme,
  fallbackScale,
}: {
  theme: BuildingTheme
  fallbackScale: number
}) {
  return (
    <mesh castShadow receiveShadow scale={fallbackScale}>
      <boxGeometry args={[8, 12, 8]} />
      <meshStandardMaterial
        color={theme.fallbackBoxColor}
        emissive={theme.fallbackEmissive}
        emissiveIntensity={0.3}
        metalness={0.5}
        roughness={0.5}
      />
    </mesh>
  )
}

/**
 * The suspending part: `useModelLoader` suspends while loading (handled by
 * the parent `<Suspense>`) and returns null on a real load failure, in which
 * case the shared fallback renders.
 */
function BuildingModel({
  modelPath,
  scale,
  fallback,
}: {
  modelPath: string
  scale: number
  fallback: React.ReactNode
}) {
  const model = useModelLoader({ modelPath })
  if (!model) return <>{fallback}</>
  return <primitive object={model} scale={scale} />
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
  labelMode = 'troika',
  labelHeight,
  lods,
}: BaseBuildingProps) {
  const groupRef = useRef<THREE.Group>(null)

  const isNearby = useSceneStore((state) => state.nearbyBuildingId === buildingId)

  const heights = buildingVisualHeights(scale, labelHeight)

  const fallback = <BuildingFallback theme={theme} fallbackScale={heights.fallbackScale} />

  // Key by URL so editing modelPath resets a previous load failure.
  const renderModel = (path: string) => (
    <ModelErrorBoundary key={path} modelPath={path} fallback={fallback}>
      <Suspense fallback={fallback}>
        <BuildingModel modelPath={path} scale={scale} fallback={fallback} />
      </Suspense>
    </ModelErrorBoundary>
  )

  const levels: LodLevel[] | null =
    modelPath && lods && lods.length > 0 ? [{ distance: 0, modelPath }, ...lods] : null

  return (
    <group ref={groupRef} position={position}>
      {/* Building model with rotation (fallback box while loading / on failure) */}
      <group rotation={rotation}>
        {modelPath ? (
          levels ? (
            <Lod position={position} levels={levels} render={renderModel} />
          ) : (
            renderModel(modelPath)
          )
        ) : (
          fallback
        )}
      </group>

      {/* Building name label */}
      {isNearby && (
        <Billboard position={[0, heights.labelY, 0]} follow={true}>
          <group>
            <mesh position={[0, 0, -0.01]}>
              <planeGeometry args={[name.length * 0.3 + 1, 0.8]} />
              <meshBasicMaterial color={theme.nameLabelBg} transparent opacity={0.9} />
            </mesh>
            {labelMode === 'sprite' ? (
              <SpriteLabel text={name} color={theme.primaryColor} fontSize={0.5} />
            ) : (
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
            )}
          </group>
        </Billboard>
      )}

      {/* Glow effect */}
      {isNearby && (
        <pointLight
          position={[0, heights.glowY, 0]}
          color={theme.glowColor}
          intensity={20}
          distance={15}
        />
      )}

      {/* Interaction hint */}
      {isNearby &&
        (interactHint ? (
          interactHint(buildingId)
        ) : (
          <Billboard position={[0, heights.bubbleY, 0]} follow={true}>
            <group>
              <mesh position={[0, 0, -0.01]}>
                <circleGeometry args={[0.55, 32]} />
                <meshBasicMaterial color={theme.nameLabelBg} transparent opacity={0.9} />
              </mesh>
              <mesh position={[0, 0, -0.005]}>
                <ringGeometry args={[0.48, 0.58, 32]} />
                <meshBasicMaterial color={theme.primaryColor} transparent opacity={0.8} />
              </mesh>
              {labelMode === 'sprite' ? (
                <SpriteLabel text={interactLabel} color={theme.primaryColor} fontSize={0.4} />
              ) : (
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
              )}
            </group>
          </Billboard>
        ))}
    </group>
  )
}
