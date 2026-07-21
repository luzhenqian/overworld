import type { CSSProperties, ReactNode } from 'react'
import { buffSweepPct, formatBuffTime } from '../buffTimer'

export interface BuffSpec {
  id: string
  icon?: ReactNode
  /** Remaining duration; omit for a permanent buff (no sweep, no timer). */
  remaining?: number
  /** Total duration; with `remaining`, drives the cooldown sweep. */
  duration?: number
  /** Stack count badge; hidden when omitted or <= 1. */
  stacks?: number
  /** Beneficial or harmful; sets `data-ow-kind`. @default 'buff' */
  kind?: 'buff' | 'debuff'
}

export interface BuffBarProps {
  buffs: readonly BuffSpec[]
  /** Cap the number rendered; extras are dropped. */
  max?: number
}

/** Row of buff/debuff icons with cooldown sweeps and stack badges. */
export function BuffBar({ buffs, max }: BuffBarProps) {
  const shown = max != null ? buffs.slice(0, max) : buffs
  if (shown.length === 0) return null
  return (
    <ul className="ow-buffbar">
      {shown.map((b) => (
        <Buff key={b.id} {...b} />
      ))}
    </ul>
  )
}

function Buff({ icon, remaining, duration, stacks, kind = 'buff' }: BuffSpec) {
  const sweep =
    remaining != null && duration != null ? buffSweepPct(remaining, duration) : null
  const time = remaining != null ? formatBuffTime(remaining) : ''
  return (
    <li
      className="ow-buff"
      data-ow-kind={kind}
      style={sweep != null ? ({ '--ow-buff-sweep': `${sweep}%` } as CSSProperties) : undefined}
    >
      <span className="ow-buff-icon" aria-hidden="true">
        {icon}
      </span>
      {sweep != null && <span className="ow-buff-sweep" aria-hidden="true" />}
      {stacks != null && stacks > 1 && <span className="ow-buff-stacks">{stacks}</span>}
      {time && <span className="ow-buff-time">{time}</span>}
    </li>
  )
}
