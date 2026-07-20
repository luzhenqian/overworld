import type { Vec3 } from '@overworld-engine/core'

export type BusName = 'master' | 'music' | 'ambience' | 'sfx'

export interface AmbientZone {
  id: string
  trackId: string
  center: Vec3
  innerRadius: number
  outerRadius: number
  maxVolume?: number
}

/** Distance falloff weight in [0, maxVolume]: full inside inner, 0 beyond outer, linear between. */
export function zoneWeight(zone: AmbientZone, listener: Vec3): number {
  const dx = listener[0] - zone.center[0]
  const dz = listener[2] - zone.center[2]
  const d = Math.sqrt(dx * dx + dz * dz)
  const max = zone.maxVolume ?? 1
  if (d <= zone.innerRadius) return max
  if (d >= zone.outerRadius) return 0
  const t = (d - zone.innerRadius) / (zone.outerRadius - zone.innerRadius)
  return max * (1 - t)
}

/** Effective gain for a track on a bus: busVolume * masterVolume. */
export function mixBuses(
  buses: Record<BusName, number>,
  bus: Exclude<BusName, 'master'>,
  masterOverride?: number
): number {
  const master = masterOverride ?? buses.master
  return buses[bus] * master
}
