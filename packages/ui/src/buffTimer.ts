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
 */
export function formatBuffTime(seconds: number): string {
  if (seconds <= 0) return ''
  if (seconds >= 60) {
    const m = Math.floor(seconds / 60)
    const s = Math.floor(seconds % 60)
    return `${m}:${s.toString().padStart(2, '0')}`
  }
  if (seconds >= 10) return `${Math.round(seconds)}s`
  return (Math.round(seconds * 10) / 10).toFixed(1)
}
