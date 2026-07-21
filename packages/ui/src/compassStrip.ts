/** Normalize an angle to (-π, π]. */
export function normalizeAngle(radians: number): number {
  const twoPi = Math.PI * 2
  let a = radians % twoPi
  if (a <= -Math.PI) a += twoPi
  else if (a > Math.PI) a -= twoPi
  return a
}

/**
 * Normalized x-position [0,1] of a bearing on the compass strip, or null when
 * the bearing is outside the visible field of view. `bearing`/`heading` share
 * the convention 0 = north, +π/2 = east (clockwise). Handles ±π wraparound.
 */
export function compassOffset(bearing: number, heading: number, fov: number): number | null {
  const rel = normalizeAngle(bearing - heading)
  if (Math.abs(rel) > fov / 2) return null
  return 0.5 + rel / fov
}

export interface CompassTick {
  label: string
  offset: number
  major: boolean
}

const CARDINALS: { label: string; bearing: number; major: boolean }[] = [
  { label: 'N', bearing: 0, major: true },
  { label: 'NE', bearing: Math.PI / 4, major: false },
  { label: 'E', bearing: Math.PI / 2, major: true },
  { label: 'SE', bearing: (3 * Math.PI) / 4, major: false },
  { label: 'S', bearing: Math.PI, major: true },
  { label: 'SW', bearing: (5 * Math.PI) / 4, major: false },
  { label: 'W', bearing: (3 * Math.PI) / 2, major: true },
  { label: 'NW', bearing: (7 * Math.PI) / 4, major: false },
]

/** Visible cardinal/intercardinal ticks within the fov, left-to-right by offset. */
export function compassTicks(heading: number, fov: number): CompassTick[] {
  return CARDINALS.flatMap((c) => {
    const offset = compassOffset(c.bearing, heading, fov)
    return offset == null ? [] : [{ label: c.label, offset, major: c.major }]
  }).sort((a, b) => a.offset - b.offset)
}
