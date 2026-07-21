export interface CastProgress {
  /** Fill width as a percentage 0–100. */
  fillPct: number
  /** Seconds until the cast completes (never negative). */
  remainingSeconds: number
}

/**
 * Cast/channel progress math. Normal casts fill 0 → 100%; channeled casts
 * drain 100 → 0%. `value` and `max` share one time unit (e.g. seconds).
 */
export function castProgress(
  value: number,
  max: number,
  opts?: { channel?: boolean },
): CastProgress {
  if (max <= 0) return { fillPct: 0, remainingSeconds: 0 }
  const ratio = Math.min(Math.max(value / max, 0), 1)
  const fillPct = (opts?.channel ? 1 - ratio : ratio) * 100
  return { fillPct, remainingSeconds: Math.max(0, max - value) }
}
