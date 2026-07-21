export interface EdgeAnchor {
  /** Horizontal anchor as a fraction [0,1] (0 = left, 1 = right). */
  xPct: number
  /** Vertical anchor as a fraction [0,1] (0 = top, 1 = bottom). */
  yPct: number
  /** Arrow rotation in degrees (0 = pointing up, clockwise). */
  rotationDeg: number
}

/**
 * Anchor an off-screen-target arrow to the edge of the screen rectangle.
 * `angle` is a screen bearing in radians, 0 = up, clockwise — the same value
 * the minimap package's `computeOffscreenIndicator().angle` returns. `inset`
 * is the margin (as a [0,1] fraction) kept from each screen edge.
 */
export function edgeAnchor(angle: number, opts?: { inset?: number }): EdgeAnchor {
  const inset = opts?.inset ?? 0.06
  const dx = Math.sin(angle)
  const dy = -Math.cos(angle)
  const t = 1 / Math.max(Math.abs(dx), Math.abs(dy))
  const clamp = (v: number): number => Math.min(Math.max(v, inset), 1 - inset)
  return {
    xPct: clamp((dx * t + 1) / 2),
    yPct: clamp((dy * t + 1) / 2),
    rotationDeg: (angle * 180) / Math.PI,
  }
}
