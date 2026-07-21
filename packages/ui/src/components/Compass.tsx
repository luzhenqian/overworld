import type { CSSProperties, ReactNode } from 'react'
import { compassOffset, compassTicks } from '../compassStrip'

export interface CompassMarker {
  id: string
  /** World bearing in radians (0 = north, +π/2 = east), same convention as `heading`. */
  bearing: number
  icon?: ReactNode
  color?: string
}

export interface CompassProps {
  /** Player facing heading in radians (three.js: 0 = facing −Z = north). */
  heading: number
  /** Angular field of view of the visible strip. @default Math.PI */
  fov?: number
  /** Bearing pips (quest markers, POIs) placed along the strip. */
  markers?: readonly CompassMarker[]
}

/** Horizontal cardinal compass strip that scrolls with the player's heading. */
export function Compass({ heading, fov = Math.PI, markers }: CompassProps) {
  const ticks = compassTicks(heading, fov)
  return (
    <div className="ow-compass">
      <div className="ow-compass-strip">
        {ticks.map((t) => (
          <span
            key={t.label}
            className="ow-compass-tick"
            data-ow-major={t.major ? '' : undefined}
            style={{ left: `${t.offset * 100}%` }}
          >
            {t.label}
          </span>
        ))}
        {markers?.map((m) => {
          const offset = compassOffset(m.bearing, heading, fov)
          if (offset == null) return null
          return (
            <span
              key={m.id}
              className="ow-compass-pip"
              style={{ left: `${offset * 100}%`, ...(m.color ? { color: m.color } : {}) } as CSSProperties}
            >
              {m.icon ?? '▾'}
            </span>
          )
        })}
      </div>
      <span className="ow-compass-center" aria-hidden="true" />
    </div>
  )
}
