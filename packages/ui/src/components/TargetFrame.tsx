import type { ReactNode } from 'react'
import { Bar } from './Bar'
import { BuffBar, type BuffSpec } from './BuffBar'

export interface TargetFrameProps {
  name: ReactNode
  level?: number | string
  hp: number
  hpMax: number
  /** Optional secondary resource (mana/energy). */
  resource?: number
  resourceMax?: number
  /** Difficulty tier; sets `data-ow-classification`. @default 'normal' */
  classification?: 'normal' | 'elite' | 'rare' | 'boss'
  /** Hostility; sets `data-ow-reaction`. @default 'hostile' */
  reaction?: 'hostile' | 'neutral' | 'friendly'
  portrait?: ReactNode
  buffs?: readonly BuffSpec[]
  /** Optional cast bar rendered under the resources (pass a `<CastBar>`). */
  castBar?: ReactNode
}

/** Selected-target unit frame: portrait, name/level, health, resource, buffs. */
export function TargetFrame({
  name,
  level,
  hp,
  hpMax,
  resource,
  resourceMax,
  classification = 'normal',
  reaction = 'hostile',
  portrait,
  buffs,
  castBar,
}: TargetFrameProps) {
  return (
    <div
      className="ow-target-frame"
      data-ow-classification={classification}
      data-ow-reaction={reaction}
    >
      {portrait != null && (
        <div className="ow-target-portrait" aria-hidden="true">
          {portrait}
        </div>
      )}
      <div className="ow-target-main">
        <div className="ow-target-header">
          {level != null && <span className="ow-target-level">{level}</span>}
          <span className="ow-target-name">{name}</span>
        </div>
        <Bar value={hp} max={hpMax} variant="hp" showValue />
        {resource != null && resourceMax != null && (
          <Bar value={resource} max={resourceMax} variant="mp" />
        )}
        {castBar}
        {buffs != null && buffs.length > 0 && <BuffBar buffs={buffs} />}
      </div>
    </div>
  )
}
