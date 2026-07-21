import type { Vec3, EntityKind } from '@overworld-engine/core'
import type { WorldBounds } from './projection'

/**
 * Radar input entity. `BuildingConfig`/`NPCConfig` from `@overworld-engine/scene`
 * structurally satisfy this shape (id + position, optional name/kind) — pass
 * them directly; no import, no mapping.
 */
export interface RadarEntity { id: string; position: Vec3; name?: string; kind?: EntityKind }
export interface RadarConfig {
  worldBounds: WorldBounds
  buildings?: RadarEntity[]
  npcs?: RadarEntity[]
  colors?: Partial<Record<EntityKind, string>>
  /** Radar radius in world units; entities beyond are clamped to the edge. */
  range?: number
}
export interface RadarMarker {
  id: string
  kind: EntityKind
  x: number
  y: number
  offScreen: boolean
  angle?: number
  color?: string
}

const DEFAULT_RANGE = 40

function toRadar(
  world: Vec3,
  player: Vec3,
  heading: number,
  range: number
): { x: number; y: number; offScreen: boolean; angle: number } {
  // Player-centred vector, rotated so player heading points "up" (-y).
  const dx = world[0] - player[0]
  const dz = world[2] - player[2]
  const cos = Math.cos(-heading)
  const sin = Math.sin(-heading)
  const rx = dx * cos - dz * sin
  const rz = dx * sin + dz * cos
  const dist = Math.sqrt(rx * rx + rz * rz)
  const angle = Math.atan2(rx, rz)
  const offScreen = dist > range
  const clamped = offScreen ? range : dist
  const scale = clamped / range
  return { x: Math.sin(angle) * scale, y: Math.cos(angle) * scale, offScreen, angle }
}

export function selectRadarMarkers(
  config: RadarConfig,
  playerPos: Vec3,
  playerHeading: number
): RadarMarker[] {
  const range = config.range ?? DEFAULT_RANGE
  const build = (list: RadarEntity[] | undefined, kind: EntityKind): RadarMarker[] =>
    (list ?? []).map((e) => {
      const r = toRadar(e.position, playerPos, playerHeading, range)
      return {
        id: e.id,
        kind: e.kind ?? kind,
        x: r.x,
        y: r.y,
        offScreen: r.offScreen,
        angle: r.offScreen ? r.angle : undefined,
        color: config.colors?.[kind],
      }
    })
  return [...build(config.buildings, 'building'), ...build(config.npcs, 'npc')]
}

export function computeOffscreenIndicator(
  markerWorld: Vec3,
  playerPos: Vec3,
  playerHeading: number,
  range: number
): { angle: number; edge: boolean } {
  const r = toRadar(markerWorld, playerPos, playerHeading, range)
  return { angle: r.angle, edge: r.offScreen }
}

/**
 * Infer facing heading (radians) from movement between two positions. When the
 * step is smaller than `deadZone`, the previous heading is retained (avoids
 * spin when the player is stationary or nudging).
 */
export function inferHeading(
  prev: { x: number; z: number },
  next: { x: number; z: number },
  lastHeading: number,
  deadZone = 0.01
): number {
  const dx = next.x - prev.x
  const dz = next.z - prev.z
  if (Math.hypot(dx, dz) < deadZone) return lastHeading
  return Math.atan2(dx, dz)
}

/** Stateful heading tracker: feed successive positions (e.g. from `player:moved`). */
export function createHeadingTracker(deadZone = 0.01): {
  update(pos: { x: number; z: number }): number
  heading(): number
} {
  let last: { x: number; z: number } | null = null
  let heading = 0
  return {
    update(pos) {
      if (last) heading = inferHeading(last, pos, heading, deadZone)
      last = pos
      return heading
    },
    heading: () => heading,
  }
}
