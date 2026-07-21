import type { CSSProperties, ReactNode } from 'react'
import { edgeAnchor } from '../edgeAnchor'

export interface WaypointIndicatorProps {
  /** Screen bearing toward the target in radians (0 = up, clockwise) — pass the
   * minimap package's `computeOffscreenIndicator().angle` directly. */
  angle: number
  label?: ReactNode
  icon?: ReactNode
  /** Distance readout, e.g. "42m". */
  distance?: ReactNode
  color?: string
}

/**
 * Screen-edge arrow pointing toward an off-screen objective. Self-positions
 * absolutely; render inside a `position: relative` container (e.g. the HUD).
 */
export function WaypointIndicator({ angle, label, icon, distance, color }: WaypointIndicatorProps) {
  const { xPct, yPct, rotationDeg } = edgeAnchor(angle)
  return (
    <div
      className="ow-waypoint"
      style={{ left: `${xPct * 100}%`, top: `${yPct * 100}%`, ...(color ? { color } : {}) } as CSSProperties}
    >
      <span
        className="ow-waypoint-arrow"
        aria-hidden="true"
        style={{ transform: `rotate(${rotationDeg}deg)` }}
      >
        ▲
      </span>
      {icon != null && (
        <span className="ow-waypoint-icon" aria-hidden="true">
          {icon}
        </span>
      )}
      {label != null && <span className="ow-waypoint-label">{label}</span>}
      {distance != null && <span className="ow-waypoint-distance">{distance}</span>}
    </div>
  )
}
