// Types & themes
export {
  defaultSceneTheme,
  createSceneTheme,
} from './types'
export type {
  NPCConfig,
  BuildingConfig,
  DecorationInstance,
  NPCIndicator,
  NPCTheme,
  BuildingTheme,
  SceneTheme,
  DeepPartial,
} from './types'

// Stores
export { useCollisionStore } from './collisionStore'
export type { Collider } from './collisionStore'
export { useSceneStore } from './sceneStore'
export type { SceneState } from './sceneStore'
export {
  playerPositionRef,
  playerRotationRef,
  getPlayerPosition,
  teleportPlayer,
  consumePlayerTeleport,
} from './playerStore'

// Player & camera
export { Player } from './Player'
export type { PlayerProps, PlayerAnimationMap, PlayerBounds, MovementInputRef } from './Player'
export { FollowCamera } from './FollowCamera'
export type { FollowCameraProps } from './FollowCamera'

// Visual layout helpers (pure math, testable without GL)
export {
  npcVisualHeights,
  buildingVisualHeights,
  DEFAULT_NPC_SCALE,
  DEFAULT_BUILDING_SCALE,
} from './visualHeights'
export type { NPCVisualHeights, BuildingVisualHeights } from './visualHeights'

// Hooks
export { useModelLoader } from './useModelLoader'
export type { UseModelLoaderOptions } from './useModelLoader'
export { ModelErrorBoundary } from './ModelErrorBoundary'
export type { ModelErrorBoundaryProps } from './ModelErrorBoundary'
export { useProximityDetection } from './useProximityDetection'
export type { ProximityEntity, UseProximityDetectionOptions } from './useProximityDetection'

// Scene components
export { SceneShell, preloadSceneModels } from './SceneShell'
export type { SceneShellProps } from './SceneShell'
export { BaseNPC } from './BaseNPC'
export type { BaseNPCProps } from './BaseNPC'
export { BaseBuilding } from './BaseBuilding'
export type { BaseBuildingProps } from './BaseBuilding'
export { SelectionRing } from './SelectionRing'
export type { SelectionRingProps } from './SelectionRing'
export { CollisionRegistration } from './CollisionRegistration'
export type { CollisionRegistrationProps, DecorationCollisionGroup } from './CollisionRegistration'
export { Portal } from './Portal'
export type { PortalProps } from './Portal'

// Interaction
export { interact, useInteractKey } from './interaction'
export type { UseInteractKeyOptions } from './interaction'

// Quality presets
export {
  QUALITY_PRESETS,
  useQualityStore,
  useParticleMultiplier,
  detectQualityPreset,
} from './quality'
export type { QualitySettings, QualityPresetName, QualityState } from './quality'
export { ApplyQuality } from './ApplyQuality'
