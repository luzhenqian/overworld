import type { ReactNode } from 'react'
import { castProgress } from '../castProgress'

export interface CastBarProps {
  /** Elapsed cast time. */
  value: number
  /** Total cast duration (same unit as `value`). */
  max: number
  /** Ability name shown on the bar. */
  label?: ReactNode
  /** Ability icon. */
  icon?: ReactNode
  /** Visual status; sets `data-ow-state`. @default 'casting' */
  state?: 'casting' | 'channeling' | 'interrupted' | 'success'
  /** Channeled cast: fills 100% → 0% instead of 0% → 100%. */
  channel?: boolean
  /** Show remaining seconds (one decimal) at the bar's end. */
  showRemaining?: boolean
}

/** Ability cast/channel bar. Presentational: the host owns the timer. */
export function CastBar({
  value,
  max,
  label,
  icon,
  state = 'casting',
  channel = false,
  showRemaining,
}: CastBarProps) {
  const { fillPct, remainingSeconds } = castProgress(value, max, { channel })
  return (
    <div className="ow-castbar" data-ow-state={state}>
      {icon != null && (
        <span className="ow-castbar-icon" aria-hidden="true">
          {icon}
        </span>
      )}
      <div
        className="ow-castbar-track"
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={typeof label === 'string' ? label : undefined}
      >
        <div className="ow-castbar-fill" style={{ width: `${fillPct}%` }} />
        {label != null && <span className="ow-castbar-label">{label}</span>}
        {showRemaining && <span className="ow-castbar-time">{remainingSeconds.toFixed(1)}</span>}
      </div>
    </div>
  )
}
