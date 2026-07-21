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
  const { hysteresis = 2, deviceCap = 0 } = opts
  // Guard a caller-supplied prevIndex into range (state can drift).
  const prevIndex = Math.min(Math.max(opts.prevIndex, 0), Math.max(levels.length - 1, 0))
  // Base pick: farthest level whose threshold we've crossed.
  let idx = 0
  for (let i = 1; i < levels.length; i++) {
    if (distance >= levels[i]!.distance) idx = i
  }
  // Hysteresis: resist switching while still inside the band of the boundary
  // we'd cross — but relative to prevIndex, not the fully-jumped target. Walk
  // one level at a time so a multi-level jump lands on the correct level
  // (never snapping back to prevIndex) and degenerate close-spaced levels work.
  if (idx > prevIndex) {
    while (idx > prevIndex && distance < levels[idx]!.distance + hysteresis) idx--
  } else if (idx < prevIndex) {
    if (distance >= levels[prevIndex]!.distance - hysteresis) idx = prevIndex
  }
  // Device cap: never render a level more detailed than the cap.
  if (idx < deviceCap) idx = deviceCap
  const clamped = Math.min(Math.max(idx, 0), levels.length - 1)
  return { index: clamped, level: levels[clamped]! }
}

/** Remaining level indices ordered nearest-first around `currentIndex` (excludes it). */
export function orderPreload(levels: LodLevel[], currentIndex: number): number[] {
  return levels
    .map((_, i) => i)
    .filter((i) => i !== currentIndex)
    .sort((a, b) => Math.abs(a - currentIndex) - Math.abs(b - currentIndex) || a - b)
}
