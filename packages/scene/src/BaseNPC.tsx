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
 */
import { useRef } from 'react'
import { Text, Billboard, Float } from '@react-three/drei'
import * as THREE from 'three'
import type { Vec3 } from '@overworld/core'
import { useSceneStore } from './sceneStore'
import { useModelLoader } from './useModelLoader'
import type { NPCTheme, NPCIndicator } from './types'

const DEFAULT_NPC_SCALE = 2.5

const INDICATOR_STYLE: Record<NPCIndicator, { symbol: string; color: string }> = {
  'quest-available': { symbol: '!', color: '#F59E0B' },
  'quest-in-progress': { symbol: '?', color: '#9CA3AF' },
  'quest-complete': { symbol: '?', color: '#FDE047' },
}

export interface BaseNPCProps {
  npcId: string
  /** GLTF/GLB model URL. */
  modelPath: string
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
  /** Optional callback to modify each mesh after clone (e.g. transparency). */
  modifyMaterial?: (child: THREE.Mesh) => void
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
  modifyMaterial,
}: BaseNPCProps) {
  const groupRef = useRef<THREE.Group>(null)

  const model = useModelLoader({ modelPath, modifyMaterial })
  const isNearby = useSceneStore((state) => state.nearbyNpcId === npcId)

  const indicatorStyle = indicator ? INDICATOR_STYLE[indicator] : null

  return (
    <group ref={groupRef} position={position}>
      {/* NPC model with rotation */}
      <group rotation={rotation}>
        {model ? (
          <primitive object={model} scale={scale} />
        ) : (
          <group>
            <mesh position={[0, 2.5, 0]} castShadow receiveShadow>
              <capsuleGeometry args={[1, 4, 4, 8]} />
              <meshStandardMaterial
                color={theme.fallbackColor ?? theme.primaryColor}
                emissive={theme.fallbackEmissive ?? theme.primaryColor}
                emissiveIntensity={isNearby ? 0.8 : 0.5}
              />
            </mesh>
          </group>
        )}
      </group>

      {/* NPC name label */}
      {isNearby && name && (
        <Billboard position={[0, 4.2, 0]} follow={true}>
          <group>
            <mesh position={[0, 0, -0.01]}>
              <planeGeometry args={[name.length * 0.25 + 0.5, 0.6]} />
              <meshBasicMaterial color={theme.nameLabelBg} transparent opacity={0.9} />
            </mesh>
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
          </group>
        </Billboard>
      )}

      {/* Indicator badge (e.g. quest "!") */}
      {showQuestIndicator && indicatorStyle && (
        <Float speed={3} rotationIntensity={0} floatIntensity={0.5}>
          <Billboard position={[0, 5, 0]} follow={true}>
            <group>
              <mesh position={[0, 0, -0.02]}>
                <circleGeometry args={[0.5, 32]} />
                <meshBasicMaterial color={indicatorStyle.color} transparent opacity={0.3} />
              </mesh>
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
            </group>
          </Billboard>
        </Float>
      )}

      {/* Glow effect */}
      {showGlow && isNearby && (
        <pointLight position={[0, 3, 0]} color={theme.glowColor} intensity={15} distance={10} />
      )}

      {/* Interaction hint */}
      {isNearby &&
        (interactHint ? (
          interactHint(npcId)
        ) : (
          showEBubble && (
            <Billboard position={[0, 5.5, 0]} follow={true}>
              <group>
                <mesh position={[0, 0, -0.01]}>
                  <circleGeometry args={[0.45, 32]} />
                  <meshBasicMaterial color={theme.nameLabelBg} transparent opacity={0.9} />
                </mesh>
                <mesh position={[0, 0, -0.005]}>
                  <ringGeometry args={[0.4, 0.48, 32]} />
                  <meshBasicMaterial color={theme.primaryColor} transparent opacity={0.8} />
                </mesh>
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
              </group>
            </Billboard>
          )
        ))}
    </group>
  )
}
