import type { EnvironmentPhase, PhaseBoundaries } from './types'

/** Default phase boundaries: dawn 0.2-0.3, day 0.3-0.7, dusk 0.7-0.8, night 0.8-0.2. */
export const DEFAULT_PHASES: PhaseBoundaries = {
  dawn: 0.2,
  day: 0.3,
  dusk: 0.7,
  night: 0.8,
}

/** Wrap any number into [0, 1). In-range values pass through bit-exact. */
export function wrapTimeOfDay(timeOfDay: number): number {
  if (timeOfDay >= 0 && timeOfDay < 1) return timeOfDay
  return ((timeOfDay % 1) + 1) % 1
}

/** Throw when boundaries don't satisfy `0 <= dawn < day < dusk < night <= 1`. */
export function validatePhaseBoundaries(phases: PhaseBoundaries): void {
  const { dawn, day, dusk, night } = phases
  if (!(dawn >= 0 && dawn < day && day < dusk && dusk < night && night <= 1)) {
    throw new Error(
      `[overworld/environment] invalid phase boundaries: expected 0 <= dawn < day < dusk < night <= 1, ` +
        `got dawn=${dawn} day=${day} dusk=${dusk} night=${night}`
    )
  }
}

/** Derive the phase for a normalized time of day. */
export function derivePhase(timeOfDay: number, phases: PhaseBoundaries = DEFAULT_PHASES): EnvironmentPhase {
  const t = wrapTimeOfDay(timeOfDay)
  if (t < phases.dawn || t >= phases.night) return 'night'
  if (t < phases.day) return 'dawn'
  if (t < phases.dusk) return 'day'
  return 'dusk'
}

/**
 * Smoothed daylight factor in [0, 1] for a normalized time of day:
 * 0 during night, ramping up across dawn, 1 during day, ramping down across
 * dusk. Drives `<DayNightLighting/>` and is exported for custom visuals
 * (sky color, fog density, emissive windows, ...).
 */
export function getDaylightFactor(timeOfDay: number, phases: PhaseBoundaries = DEFAULT_PHASES): number {
  const t = wrapTimeOfDay(timeOfDay)
  let linear: number
  if (t < phases.dawn || t >= phases.night) {
    linear = 0
  } else if (t < phases.day) {
    linear = (t - phases.dawn) / (phases.day - phases.dawn)
  } else if (t < phases.dusk) {
    linear = 1
  } else {
    linear = 1 - (t - phases.dusk) / (phases.night - phases.dusk)
  }
  // Smoothstep for a gentler sunrise/sunset curve.
  return linear * linear * (3 - 2 * linear)
}
