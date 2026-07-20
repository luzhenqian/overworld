import type { Vec3, EntityKind } from '@overworld-engine/core'
import type { WorldBounds } from './projection'

export interface RadarEntity { id: string; position: Vec3; name?: string }
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
        kind,
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
