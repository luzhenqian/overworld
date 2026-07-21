export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface Size {
  width: number
  height: number
}

/**
 * Position a tooltip relative to an anchor rect (viewport coordinates).
 * Prefers centered-above; flips below when the top would clip; clamps
 * horizontally with a 4px margin.
 */
export function positionTooltip(
  anchor: Rect,
  tip: Size,
  viewport: Size,
  offset = 8,
): { x: number; y: number; placement: 'above' | 'below' } {
  const rawX = anchor.x + anchor.width / 2 - tip.width / 2
  const x = Math.min(Math.max(rawX, 4), viewport.width - tip.width - 4)
  const above = anchor.y - offset - tip.height
  if (above >= 0) return { x, y: above, placement: 'above' }
  return { x, y: anchor.y + anchor.height + offset, placement: 'below' }
}
