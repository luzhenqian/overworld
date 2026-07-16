/**
 * Base NPC component — shared across all scenes.
 * Handles: model loading, nearby highlighting, name label, indicator badge,
 * glow effect and interaction hint bubble.
 *
 * Theme-driven: all colors come from the `theme` prop. Unlike the source
 * game, this component reads no quest/NPC stores — the display name comes
 * from the `name` prop, quest badges from the `indicator` prop, and
 * "am I nearby?" from the scene store (populated by `useProximityDetection`,
 * which SceneShell runs for you).
 *
 * Model loading: the model subtree is wrapped in `<Suspense>` plus a
 * {@link ModelErrorBoundary} (keyed by `modelPath`, so changing the path
 * retries). The themed fallback capsule renders while the model loads, when
 * it fails to load, and when `modelPath` is omitted.
 */
import { Suspense, useRef } from 'react'
import { Text, Billboard, Float } from '@react-three/drei'
import * as THREE from 'three'
import type { Vec3 } from '@overworld-engine/core'
import { useSceneStore } from './sceneStore'
import { useModelLoader } from './useModelLoader'
import { ModelErrorBoundary } from './ModelErrorBoundary'
import { npcVisualHeights, DEFAULT_NPC_SCALE } from './visualHeights'
import { SpriteLabel } from './SpriteLabel'
import type { LabelMode } from './types'
import type { NPCTheme, NPCIndicator } from './types'

const INDICATOR_STYLE: Record<NPCIndicator, { symbol: string; color: string }> = {
  'quest-available': { symbol: '!', color: '#F59E0B' },
  'quest-in-progress': { symbol: '?', color: '#9CA3AF' },
  'quest-complete': { symbol: '?', color: '#FDE047' },
}

export interface BaseNPCProps {
  npcId: string
  /** GLTF/GLB model URL. When omitted, the themed fallback capsule renders. */
  modelPath?: string
  position: Vec3
  rotation?: Vec3
  scale?: number
  theme: NPCTheme
  /** Display name shown above the NPC when nearby. Hidden when omitted. */
  name?: string
  /** Quest-style badge floating above the NPC (e.g. from a quest engine). */
  indicator?: NPCIndicator
  /** Show the floating indicator badge (default: true). */
  showQuestIndicator?: boolean
  /** Show the interaction bubble when nearby (default: true). */
  showEBubble?: boolean
  /** Show point-light glow when nearby (default: true). */
  showGlow?: boolean
  /** Text inside the default interaction bubble. Default: "E". */
  interactLabel?: string
  /** Custom interaction hint replacing the default bubble when nearby. */
  interactHint?: (id: string) => React.ReactNode
  /** Optional font URL for labels (drei `Text` default font when omitted). */
  labelFont?: string
  /**
   * How label text (name, indicator badge, interaction bubble) is rendered:
   * `'troika'` (default) uses drei `Text`; `'sprite'` uses the DOM-less
   * {@link SpriteLabel} (canvas texture + `THREE.Sprite`) — required on
   * platforms without troika support, e.g. WeChat mini-games. Sprite mode
   * uses the system font (`labelFont` is ignored).
   */
  labelMode?: LabelMode
  /**
   * Name-label height in world units, overriding the scale-proportional
   * default (`4.2 × scale / 2.5`). The indicator badge and interaction
   * bubble keep their offset above it. See {@link npcVisualHeights}.
   */
  labelHeight?: number
  /** Optional callback to modify each mesh after clone (e.g. transparency). */
  modifyMaterial?: (child: THREE.Mesh) => void
}

/** Themed placeholder capsule: loading state, load failure and no-model NPCs. */
function NPCFallback({
  theme,
  isNearby,
  fallbackScale,
}: {
  theme: NPCTheme
  isNearby: boolean
  fallbackScale: number
}) {
  return (
    <group scale={fallbackScale}>
      <mesh position={[0, 2.5, 0]} castShadow receiveShadow>
        <capsuleGeometry args={[1, 4, 4, 8]} />
        <meshStandardMaterial
          color={theme.fallbackColor ?? theme.primaryColor}
          emissive={theme.fallbackEmissive ?? theme.primaryColor}
          emissiveIntensity={isNearby ? 0.8 : 0.5}
        />
      </mesh>
    </group>
  )
}

/**
 * The suspending part: `useModelLoader` suspends while loading (handled by
 * the parent `<Suspense>`) and returns null on a real load failure, in which
 * case the shared fallback renders.
 */
function NPCModel({
  modelPath,
  scale,
  modifyMaterial,
  fallback,
}: {
  modelPath: string
  scale: number
  modifyMaterial?: (child: THREE.Mesh) => void
  fallback: React.ReactNode
}) {
  const model = useModelLoader({ modelPath, modifyMaterial })
  if (!model) return <>{fallback}</>
  return <primitive object={model} scale={scale} />
}

export function BaseNPC({
  npcId,
  modelPath,
  position,
  rotation = [0, 0, 0],
  scale = DEFAULT_NPC_SCALE,
  theme,
  name,
  indicator,
  showQuestIndicator = true,
  showEBubble = true,
  showGlow = true,
  interactLabel = 'E',
  interactHint,
  labelFont,
  labelMode = 'troika',
  labelHeight,
  modifyMaterial,
}: BaseNPCProps) {
  const groupRef = useRef<THREE.Group>(null)

  const isNearby = useSceneStore((state) => state.nearbyNpcId === npcId)

  const indicatorStyle = indicator ? INDICATOR_STYLE[indicator] : null
  const heights = npcVisualHeights(scale, labelHeight)

  const fallback = (
    <NPCFallback theme={theme} isNearby={isNearby} fallbackScale={heights.fallbackScale} />
  )

  return (
    <group ref={groupRef} position={position}>
      {/* NPC model with rotation (fallback capsule while loading / on failure) */}
      <group rotation={rotation}>
        {modelPath ? (
          // Key by URL so editing modelPath resets a previous load failure.
          <ModelErrorBoundary key={modelPath} modelPath={modelPath} fallback={fallback}>
            <Suspense fallback={fallback}>
              <NPCModel
                modelPath={modelPath}
                scale={scale}
                modifyMaterial={modifyMaterial}
                fallback={fallback}
              />
            </Suspense>
          </ModelErrorBoundary>
        ) : (
          fallback
        )}
      </group>

      {/* NPC name label */}
      {isNearby && name && (
        <Billboard position={[0, heights.labelY, 0]} follow={true}>
          <group>
            <mesh position={[0, 0, -0.01]}>
              <planeGeometry args={[name.length * 0.25 + 0.5, 0.6]} />
              <meshBasicMaterial color={theme.nameLabelBg} transparent opacity={0.9} />
            </mesh>
            {labelMode === 'sprite' ? (
              <SpriteLabel text={name} color={theme.primaryColor} fontSize={0.4} />
            ) : (
              <Text
                fontSize={0.4}
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

      {/* Indicator badge (e.g. quest "!") */}
      {showQuestIndicator && indicatorStyle && (
        <Float speed={3} rotationIntensity={0} floatIntensity={0.5}>
          <Billboard position={[0, heights.indicatorY, 0]} follow={true}>
            <group>
              <mesh position={[0, 0, -0.02]}>
                <circleGeometry args={[0.5, 32]} />
                <meshBasicMaterial color={indicatorStyle.color} transparent opacity={0.3} />
              </mesh>
              {labelMode === 'sprite' ? (
                <SpriteLabel text={indicatorStyle.symbol} color={indicatorStyle.color} fontSize={0.7} />
              ) : (
                <Text
                  fontSize={0.7}
                  color={indicatorStyle.color}
                  anchorX="center"
                  anchorY="middle"
                  outlineWidth={0.06}
                  outlineColor="#000000"
                >
                  {indicatorStyle.symbol}
                </Text>
              )}
            </group>
          </Billboard>
        </Float>
      )}

      {/* Glow effect */}
      {showGlow && isNearby && (
        <pointLight
          position={[0, heights.glowY, 0]}
          color={theme.glowColor}
          intensity={15}
          distance={10}
        />
      )}

      {/* Interaction hint */}
      {isNearby &&
        (interactHint ? (
          interactHint(npcId)
        ) : (
          showEBubble && (
            <Billboard position={[0, heights.bubbleY, 0]} follow={true}>
              <group>
                <mesh position={[0, 0, -0.01]}>
                  <circleGeometry args={[0.45, 32]} />
                  <meshBasicMaterial color={theme.nameLabelBg} transparent opacity={0.9} />
                </mesh>
                <mesh position={[0, 0, -0.005]}>
                  <ringGeometry args={[0.4, 0.48, 32]} />
                  <meshBasicMaterial color={theme.primaryColor} transparent opacity={0.8} />
                </mesh>
                {labelMode === 'sprite' ? (
                  <SpriteLabel text={interactLabel} color={theme.primaryColor} fontSize={0.35} />
                ) : (
                  <Text
                    fontSize={0.35}
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
          )
        ))}
    </group>
  )
}
