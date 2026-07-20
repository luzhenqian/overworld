/**
 * Shared type definitions for scene entities (NPCs, buildings, decorations)
 * and per-scene theme configuration.
 *
 * Unlike the source game, no themed presets ship with the framework — theme
 * palettes are game content. Use {@link defaultSceneTheme} as a neutral base
 * and {@link createSceneTheme} to derive game-specific themes.
 */
import type { Vec3 } from '@overworld-engine/core'

// ========== Configuration interfaces ==========

/** Static placement/config for one NPC in a scene. */
export interface NPCConfig {
  id: string
  /** GLTF/GLB model URL. */
  modelPath: string
  position: Vec3
  rotation: Vec3
  scale?: number
  /** Display name rendered on the floating label when the player is nearby. */
  name?: string
  /** Optional distance LODs (near→far); the base `modelPath` is LOD0. */
  lods?: import('./lod').LodLevel[]
}

/** Static placement/config for one building in a scene. */
export interface BuildingConfig {
  id: string
  /** Display name rendered on the floating label when the player is nearby. */
  name: string
  /** GLTF/GLB model URL. */
  modelPath: string
  position: Vec3
  rotation: Vec3
  scale: number
  /** Circular collider radius on the X/Z plane. */
  collisionRadius: number
  /** Optional distance LODs (near→far); the base `modelPath` is LOD0. */
  lods?: import('./lod').LodLevel[]
}

/** One placed instance of a repeated decoration (tree, lamp post, ...). */
export interface DecorationInstance {
  position: Vec3
  rotation?: Vec3
  scale?: number
}

/** Quest-style indicator badge rendered above an NPC. */
export type NPCIndicator = 'quest-available' | 'quest-in-progress' | 'quest-complete'

/**
 * How `BaseNPC`/`BaseBuilding` render label text: `'troika'` = drei `Text`
 * (default, SDF quality); `'sprite'` = `SpriteLabel` (canvas texture +
 * `THREE.Sprite`, zero DOM/worker dependencies — the mode for platforms
 * where troika is unavailable, e.g. WeChat mini-games).
 */
export type LabelMode = 'troika' | 'sprite'

// ========== Theme configuration ==========

/** Colors used by {@link BaseNPC} (labels, glow, rings, model fallback). */
export interface NPCTheme {
  primaryColor: string
  nameLabelBg: string
  glowColor: string
  ringColor: string
  ringOpacity: number
  /** Fallback capsule color when the model fails to load. */
  fallbackColor: string
  fallbackEmissive: string
}

/** Colors used by {@link BaseBuilding} (labels, glow, rings, model fallback). */
export interface BuildingTheme {
  primaryColor: string
  nameLabelBg: string
  glowColor: string
  ringColor: string
  ringOpacity: number
  /** Fallback box color when the model fails to load. */
  fallbackBoxColor: string
  fallbackEmissive: string
}

/** Complete visual theme for one scene. */
export interface SceneTheme {
  npc: NPCTheme
  building: BuildingTheme
}

/** Recursively optional version of `T`, used by {@link createSceneTheme}. */
export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K]
}

/** A neutral, game-agnostic theme usable out of the box. */
export const defaultSceneTheme: SceneTheme = {
  npc: {
    primaryColor: '#7dd3fc',
    nameLabelBg: '#1e293b',
    glowColor: '#7dd3fc',
    ringColor: '#7dd3fc',
    ringOpacity: 0.7,
    fallbackColor: '#94a3b8',
    fallbackEmissive: '#475569',
  },
  building: {
    primaryColor: '#fbbf24',
    nameLabelBg: '#1e293b',
    glowColor: '#fbbf24',
    ringColor: '#fbbf24',
    ringOpacity: 0.7,
    fallbackBoxColor: '#334155',
    fallbackEmissive: '#64748b',
  },
}

/**
 * Build a full {@link SceneTheme} by overlaying a partial theme on
 * {@link defaultSceneTheme}:
 *
 * ```ts
 * const neonTheme = createSceneTheme({ npc: { primaryColor: '#ff00ff' } })
 * ```
 */
export function createSceneTheme(partial: DeepPartial<SceneTheme> = {}): SceneTheme {
  return {
    npc: { ...defaultSceneTheme.npc, ...partial.npc },
    building: { ...defaultSceneTheme.building, ...partial.building },
  }
}
