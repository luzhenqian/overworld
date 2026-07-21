import type { ReactNode } from 'react'
import { Bar } from './Bar'

export interface NameplateProps {
  name: ReactNode
  hp: number
  hpMax: number
  level?: number | string
  /** Hostility; sets `data-ow-reaction`. @default 'hostile' */
  reaction?: 'hostile' | 'neutral' | 'friendly'
  /** Show the level tag before the name. @default false */
  showLevel?: boolean
}

/**
 * Compact over-head enemy nameplate (name + health). The host positions it in
 * screen space (world→screen projection is not this component's concern).
 */
export function Nameplate({
  name,
  hp,
  hpMax,
  level,
  reaction = 'hostile',
  showLevel = false,
}: NameplateProps) {
  return (
    <div className="ow-nameplate" data-ow-reaction={reaction}>
      <div className="ow-nameplate-header">
        {showLevel && level != null && <span className="ow-nameplate-level">{level}</span>}
        <span className="ow-nameplate-name">{name}</span>
      </div>
      <Bar value={hp} max={hpMax} variant="hp" />
    </div>
  )
}
