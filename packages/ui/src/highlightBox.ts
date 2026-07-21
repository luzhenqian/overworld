import type { Rect } from './tooltipPosition'

/** Expand a measured target rect by `padding` for the tutorial spotlight. */
export function highlightBox(
  target: Rect,
  padding = 6,
): { left: number; top: number; width: number; height: number } {
  return {
    left: target.x - padding,
    top: target.y - padding,
    width: target.width + padding * 2,
    height: target.height + padding * 2,
  }
}
