import type { ReactNode } from 'react'

export interface BarProps {
  value: number
  max: number
  variant?: 'hp' | 'mp' | 'xp' | 'generic'
  label?: ReactNode
  /** Show `value/max` text inside the bar. */
  showValue?: boolean
}

/**
 * Resource bar with a CSS-only damage-lag ghost: fill and ghost share the
 * same width, but the ghost's slower transition leaves a decaying trail on
 * decrease.
 */
export function Bar({ value, max, variant = 'generic', label, showValue }: BarProps) {
  const pct = max > 0 ? Math.min(Math.max(value / max, 0), 1) * 100 : 0
  return (
    <div className="ow-bar" data-ow-variant={variant}>
      {label != null && <span className="ow-bar-label">{label}</span>}
      <div
        className="ow-bar-track"
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
      >
        <div className="ow-bar-ghost" style={{ width: `${pct}%` }} />
        <div className="ow-bar-fill" style={{ width: `${pct}%` }} />
        {showValue && (
          <span className="ow-bar-value">
            {value}/{max}
          </span>
        )}
      </div>
    </div>
  )
}
