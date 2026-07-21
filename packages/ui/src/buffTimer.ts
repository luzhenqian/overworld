/**
 * Fraction of a buff/cooldown still remaining, as a percentage 0–100, for the
 * conic-gradient sweep. A non-positive `duration` means "permanent" → 0.
 */
export function buffSweepPct(remaining: number, duration: number): number {
  if (duration <= 0) return 0
  return Math.min(Math.max(remaining / duration, 0), 1) * 100
}

/**
 * Compact countdown label:
 *   ≥ 60s → "M:SS" (83 → "1:23")
 *   10–59s → "Ns"  (45 → "45s", rounded)
 *   0–10s  → one decimal, no unit ("3.2")
 *   ≤ 0    → "" (render nothing)
 * Bucketing accounts for rounding so a value just under a boundary renders in
 * the bucket it rounds INTO (59.5 → "1:00", not "60s"; 9.97 → "10s", not "10.0").
 */
export function formatBuffTime(seconds: number): string {
  if (seconds <= 0) return ''
  if (seconds < 10) {
    const tenths = Math.round(seconds * 10) / 10
    if (tenths < 10) return tenths.toFixed(1)
  }
  const rounded = Math.round(seconds)
  if (rounded >= 60) {
    const m = Math.floor(rounded / 60)
    const s = rounded % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }
  return `${rounded}s`
}
