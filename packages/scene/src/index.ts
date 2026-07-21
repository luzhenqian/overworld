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
  LabelMode,
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
export type { FollowCameraProps, FollowCameraOrbitOptions } from './FollowCamera'
export { applyOrbitDelta, orbitToOffset } from './orbitCamera'
export type { OrbitState, OrbitLimits, OrbitDelta } from './orbitCamera'

// Visual layout helpers (pure math, testable without GL)
export {
  npcVisualHeights,
  buildingVisualHeights,
  DEFAULT_NPC_SCALE,
  DEFAULT_BUILDING_SCALE,
} from './visualHeights'
export type { NPCVisualHeights, BuildingVisualHeights } from './visualHeights'

// Hooks
export { useModelLoader, useModelClips } from './useModelLoader'
export type { UseModelLoaderOptions } from './useModelLoader'
export { resolveClip, pickNpcClipName, deriveNpcAnimState } from './animationClips'
export type { NPCAnimationMap } from './animationClips'
export { ModelErrorBoundary } from './ModelErrorBoundary'
export type { ModelErrorBoundaryProps } from './ModelErrorBoundary'
export { useProximityDetection } from './useProximityDetection'
export type { ProximityEntity, UseProximityDetectionOptions } from './useProximityDetection'

// Scene components
export { SceneShell, preloadSceneModels } from './SceneShell'
export type { SceneShellProps } from './SceneShell'

// Scene JSON (editor↔scene authoring loop)
export { SceneFromJson, sceneJsonToShellProps, sceneConfigToSceneJson, pickScene } from './sceneJson'
export type {
  SceneJson,
  SceneContentProps,
  SceneFromJsonProps,
  SceneProjectLike,
  SceneProjectSceneLike,
} from './sceneJson'
export { BaseNPC } from './BaseNPC'
export type { BaseNPCProps } from './BaseNPC'
export { BaseBuilding } from './BaseBuilding'
export type { BaseBuildingProps } from './BaseBuilding'
export { SelectionRing } from './SelectionRing'
export type { SelectionRingProps } from './SelectionRing'
export { SpriteLabel, setLabelCanvasFactory } from './SpriteLabel'
export type { SpriteLabelProps, LabelCanvas, LabelCanvasContext } from './SpriteLabel'
export { computeSpriteLabelLayout, SPRITE_LABEL_FONT_PX } from './spriteLabelLayout'
export type { SpriteLabelLayout, SpriteLabelLayoutInput } from './spriteLabelLayout'
export { CollisionRegistration } from './CollisionRegistration'
export type { CollisionRegistrationProps, DecorationCollisionGroup } from './CollisionRegistration'
export { AgentNPC } from './AgentNPC'
export type { AgentNPCProps, AgentLike } from './AgentNPC'
export { Portal } from './Portal'
export type { PortalProps } from './Portal'
export { Lod } from './LodSwitch'
export type { LodProps } from './LodSwitch'
export { selectLodLevel, levelsToDispose, orderPreload } from './lod'
export type { LodLevel } from './lod'
export { Decorations, useDecorationCollision } from './Decorations'
export type { DecorationsProps } from './Decorations'
export { instanceMatrix, decorationColliders, collidersForSets } from './decorationInstancing'
export type { DecorationSet } from './decorationInstancing'

// Interaction
export { interact, useInteractKey } from './interaction'
export type { UseInteractKeyOptions } from './interaction'
export { useInputLocked } from './useInputLocked'
export { resolveInputBlocked } from './inputBlocked'

// Quality presets
export {
  QUALITY_PRESETS,
  useQualityStore,
  useParticleMultiplier,
  detectQualityPreset,
  isSoftwareRenderer,
  readWebglRenderer,
  qualityToLodCap,
} from './quality'
export type { QualitySettings, QualityPresetName, QualityState } from './quality'
export { ApplyQuality } from './ApplyQuality'
