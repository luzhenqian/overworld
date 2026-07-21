import type { ReactNode } from 'react'

export interface MinimapFrameProps {
  /** The map widget to frame (e.g. a `<MiniMap>` from `@overworld-engine/minimap`). */
  children?: ReactNode
  /** Region/zone name shown in the frame header. */
  label?: ReactNode
  /** Player coordinates readout; each component is rounded to an integer. */
  coords?: { x: number; z: number }
  /** Zoom / control buttons slot rendered in the header. */
  controls?: ReactNode
}

/** Themed decorative frame around a minimap: header (label + controls), body, coords. */
export function MinimapFrame({ children, label, coords, controls }: MinimapFrameProps) {
  return (
    <div className="ow-minimap-frame">
      {(label != null || controls != null) && (
        <div className="ow-minimap-frame-header">
          {label != null && <span className="ow-minimap-frame-label">{label}</span>}
          {controls != null && <span className="ow-minimap-frame-controls">{controls}</span>}
        </div>
      )}
      <div className="ow-minimap-frame-body">{children}</div>
      {coords != null && (
        <div className="ow-minimap-frame-coords">
          <span>X {Math.round(coords.x)}</span>
          <span>Z {Math.round(coords.z)}</span>
        </div>
      )}
    </div>
  )
}
