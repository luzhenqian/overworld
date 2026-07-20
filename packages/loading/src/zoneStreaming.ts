import type { Vec3 } from '@overworld-engine/core'
import type { AssetManifest } from './manifest'

/** Structural world rectangle (same shape as minimap's WorldBounds; no cross-import). */
export interface ZoneBounds { minX: number; maxX: number; minZ: number; maxZ: number }
export interface ZoneManifest {
  id: string
  priority: number
  manifest: AssetManifest
  bounds?: ZoneBounds
}

function distanceToBounds(pos: Vec3, b: ZoneBounds): number {
  const cx = (b.minX + b.maxX) / 2
  const cz = (b.minZ + b.maxZ) / 2
  const dx = pos[0] - cx
  const dz = pos[2] - cz
  return Math.sqrt(dx * dx + dz * dz)
}

/** Nearest-first ordering; unbounded zones last; ties broken by higher priority. */
export function orderZonesByDistance(zones: ZoneManifest[], pos: Vec3): ZoneManifest[] {
  return [...zones].sort((a, b) => {
    const da = a.bounds ? distanceToBounds(pos, a.bounds) : Infinity
    const db = b.bounds ? distanceToBounds(pos, b.bounds) : Infinity
    if (da !== db) return da - db
    return b.priority - a.priority
  })
}
