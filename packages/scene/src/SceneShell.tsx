/**
 * SceneShell — shared composition component for all scene boilerplate.
 * Handles: collision registration, proximity detection, the player, the NPC
 * loop, the building loop and selection rings. Scene-specific content
 * (lighting, ground, fog, portals, decorations) is passed as children.
 *
 * Decoupling vs the source game: quest indicators and interaction hints are
 * plain props (`npcIndicators`, `interactHint`) instead of store reads, and
 * proximity results live in this package's own scene store.
 */
import { useMemo } from 'react'
import { useGLTF } from '@react-three/drei'
import type { Vec3 } from '@overworld-engine/core'
import { Player } from './Player'
import { BaseNPC } from './BaseNPC'
import { BaseBuilding } from './BaseBuilding'
import { SelectionRing } from './SelectionRing'
import { CollisionRegistration, type DecorationCollisionGroup } from './CollisionRegistration'
import { useProximityDetection } from './useProximityDetection'
import { defaultSceneTheme } from './types'
import type { NPCConfig, BuildingConfig, SceneTheme, NPCIndicator } from './types'

export interface SceneShellProps {
  /** Visual theme. Default: {@link defaultSceneTheme}. */
  theme?: SceneTheme
  npcs: NPCConfig[]
  buildings?: BuildingConfig[]
  decorationCollisions?: Record<string, DecorationCollisionGroup>
  npcOptions?: { showQuestIndicator?: boolean; showEBubble?: boolean; showGlow?: boolean }
  /** Per-NPC indicator badges, e.g. supplied by a quest engine. */
  npcIndicators?: Record<string, NPCIndicator>
  /** Custom interaction hint rendered above the nearby NPC/building. */
  interactHint?: (id: string) => React.ReactNode
  buildingSelectionRing?: {
    innerRadius?: number
    outerRadius?: number
    secondaryInnerRadius?: number
    secondaryOuterRadius?: number
  }
  /** Override NPC positions for proximity + selection ring (e.g. moving NPCs). */
  npcPositions?: Record<string, Vec3>
  /** Interaction distance for NPCs. Default: 3. */
  npcProximityRadius?: number
  /** Interaction distance for buildings. Default: 8. */
  buildingProximityRadius?: number
  /**
   * The player element. Defaults to `<Player />`; pass a configured
   * `<Player modelUrl=... />` to customize, or `null` to render no player.
   */
  player?: React.ReactNode
  /** Optional font URL for entity labels. */
  labelFont?: string
  /** Scene-specific content (lighting, ground, portals, decorations, ...). */
  children?: React.ReactNode
}

export function SceneShell({
  theme = defaultSceneTheme,
  npcs,
  buildings,
  decorationCollisions,
  npcOptions,
  npcIndicators,
  interactHint,
  buildingSelectionRing,
  npcPositions,
  npcProximityRadius,
  buildingProximityRadius,
  player = <Player />,
  labelFont,
  children,
}: SceneShellProps) {
  const resolvedNpcPositions = useMemo(
    () =>
      npcPositions ??
      (Object.fromEntries(npcs.map((npc) => [npc.id, npc.position])) as Record<string, Vec3>),
    [npcPositions, npcs]
  )

  const buildingPositions = useMemo(
    () =>
      buildings
        ? (Object.fromEntries(buildings.map((b) => [b.id, b.position])) as Record<string, Vec3>)
        : undefined,
    [buildings]
  )

  // Proximity tracking (writes the scene store, emits proximity:enter/leave)
  const proximityNpcs = useMemo(
    () => npcs.map((npc) => ({ id: npc.id, position: resolvedNpcPositions[npc.id] ?? npc.position })),
    [npcs, resolvedNpcPositions]
  )
  const proximityBuildings = useMemo(
    () => buildings?.map((b) => ({ id: b.id, position: b.position })),
    [buildings]
  )
  useProximityDetection({
    npcs: proximityNpcs,
    buildings: proximityBuildings,
    npcRadius: npcProximityRadius,
    buildingRadius: buildingProximityRadius,
  })

  return (
    <>
      {/* Collision registration */}
      <CollisionRegistration
        npcs={npcs}
        buildings={buildings}
        decorations={decorationCollisions}
      />

      {/* NPCs */}
      {npcs.map((config) => (
        <BaseNPC
          key={config.id}
          npcId={config.id}
          modelPath={config.modelPath}
          position={config.position}
          rotation={config.rotation}
          scale={config.scale}
          name={config.name}
          theme={theme.npc}
          indicator={npcIndicators?.[config.id]}
          interactHint={interactHint}
          labelFont={labelFont}
          showQuestIndicator={npcOptions?.showQuestIndicator}
          showEBubble={npcOptions?.showEBubble}
          showGlow={npcOptions?.showGlow}
        />
      ))}

      {/* Buildings */}
      {buildings?.map((config) => (
        <BaseBuilding
          key={config.id}
          buildingId={config.id}
          name={config.name}
          modelPath={config.modelPath}
          position={config.position}
          rotation={config.rotation}
          scale={config.scale}
          theme={theme.building}
          interactHint={interactHint}
          labelFont={labelFont}
        />
      ))}

      {/* NPC selection ring */}
      <SelectionRing type="npc" positions={resolvedNpcPositions} theme={theme.npc} />

      {/* Building selection ring */}
      {buildings && buildingPositions && (
        <SelectionRing
          type="building"
          positions={buildingPositions}
          theme={theme.building}
          innerRadius={buildingSelectionRing?.innerRadius}
          outerRadius={buildingSelectionRing?.outerRadius}
          secondaryInnerRadius={buildingSelectionRing?.secondaryInnerRadius}
          secondaryOuterRadius={buildingSelectionRing?.secondaryOuterRadius}
        />
      )}

      {/* Player */}
      {player}

      {/* Scene-specific content */}
      {children}
    </>
  )
}

/**
 * Preload GLTF models at module level for a scene's NPCs, buildings, and
 * extras so `useGLTF` resolves synchronously when the scene mounts.
 */
export function preloadSceneModels(config: {
  npcs: NPCConfig[]
  buildings?: BuildingConfig[]
  extraModels?: string[]
}): void {
  config.npcs.forEach((n) => useGLTF.preload(n.modelPath))
  config.buildings?.forEach((b) => useGLTF.preload(b.modelPath))
  config.extraModels?.forEach((p) => useGLTF.preload(p))
}
