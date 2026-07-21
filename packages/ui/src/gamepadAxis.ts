export type Direction = 'up' | 'down' | 'left' | 'right'

/**
 * Map an analog-stick position to a navigation direction. Returns null when
 * both axes are within the dead zone. Screen convention: +x = right, +y = down.
 * The dominant axis wins; a tie (`|x| === |y|`) resolves horizontally.
 */
export function axisToDirection(x: number, y: number, deadZone = 0.5): Direction | null {
  if (Math.abs(x) < deadZone && Math.abs(y) < deadZone) return null
  if (Math.abs(x) >= Math.abs(y)) return x > 0 ? 'right' : 'left'
  return y > 0 ? 'down' : 'up'
}
