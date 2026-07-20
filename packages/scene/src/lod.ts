export interface LodLevel {
  distance: number
  modelPath: string
}
export interface SelectLodOptions {
  prevIndex: number
  /** Hysteresis band width (world units) to prevent boundary flicker. Default 2. */
  hysteresis?: number
  /** Highest-detail level index allowed on this device (0 = highest). */
  deviceCap?: number
}

/**
 * Pick a LOD level for a distance, with hysteresis to stop flicker at
 * boundaries and an optional device cap that forbids the most detailed levels.
 * `levels` are near→far with `distance` being the threshold to switch to the
 * NEXT (farther) level.
 */
export function selectLodLevel(
  distance: number,
  levels: LodLevel[],
  opts: SelectLodOptions
): { index: number; level: LodLevel } {
  const { prevIndex, hysteresis = 2, deviceCap = 0 } = opts
  // Base pick: farthest level whose threshold we've crossed.
  let idx = 0
  for (let i = 1; i < levels.length; i++) {
    if (distance >= levels[i]!.distance) idx = i
  }
  // Hysteresis: only switch away from prevIndex if we're clearly past the band.
  if (idx > prevIndex) {
    // switching to a farther level requires distance >= threshold + band
    if (distance < levels[idx]!.distance + hysteresis) idx = prevIndex
  } else if (idx < prevIndex) {
    // switching to a nearer level requires distance < threshold - band
    if (distance >= levels[prevIndex]!.distance - hysteresis) idx = prevIndex
  }
  // Device cap: never render a level more detailed than the cap.
  if (idx < deviceCap) idx = deviceCap
  const clamped = Math.min(Math.max(idx, 0), levels.length - 1)
  return { index: clamped, level: levels[clamped]! }
}
