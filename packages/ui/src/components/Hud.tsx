import type { ReactNode } from 'react'

export type HudAnchorPosition =
  | 'top-left'
  | 'top'
  | 'top-right'
  | 'left'
  | 'center'
  | 'right'
  | 'bottom-left'
  | 'bottom'
  | 'bottom-right'

export interface HudProps {
  /** Active theme skin; sets `data-ow-theme` for the CSS theme layer. */
  theme?: string
  className?: string
  children?: ReactNode
}

function HudRoot({ theme, className, children }: HudProps) {
  return (
    <div
      className={className ? `ow-root ow-hud ${className}` : 'ow-root ow-hud'}
      data-ow-theme={theme}
    >
      {children}
    </div>
  )
}

export interface HudAnchorProps {
  anchor: HudAnchorPosition
  children?: ReactNode
}

function HudAnchor({ anchor, children }: HudAnchorProps) {
  return (
    <div className="ow-hud-anchor" data-ow-anchor={anchor}>
      {children}
    </div>
  )
}

/**
 * Fullscreen HUD overlay. The overlay itself is pointer-transparent;
 * children of anchors receive pointer events. Mount inside a
 * `position: relative` container wrapping the game canvas.
 */
export const Hud = Object.assign(HudRoot, { Anchor: HudAnchor })
