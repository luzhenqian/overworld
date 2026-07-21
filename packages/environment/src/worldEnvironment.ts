import type { Vec3 } from '@overworld-engine/core'
import type { DayNightValue } from './DayNightLighting'

export interface WorldEnvironmentPreset {
  sky?:
    | { top: string; bottom: string; sunColor?: string; sunPosition?: Vec3 }
    | { hdri: string }
  fog?: { color: string; near: number; far: number } | { color: string; density: number }
  ground?: { color: string; roughness?: number; metalness?: number; size?: number } | false
  lighting?: {
    ambient?: DayNightValue<{ color: string; intensity: number }>
    sun?: DayNightValue<{ color: string; intensity: number }> & {
      position?: Vec3
      castShadow?: boolean
    }
    /** Distinct night light; falls back to the sun's night values when omitted. */
    moon?: DayNightValue<{ color: string; intensity: number }>
  }
  envMapIntensity?: number
  stars?: boolean | { count: number }
  /** Tone-mapping exposure, interpolated by daylight. Scalar or day/night pair. */
  exposure?: number | { day: number; night: number }
  /** Imperative day<->night transition duration (ms). Consumed by the component. */
  transitionDuration?: number
}

export const WORLD_ENV_PRESETS = {
  'clear-noon': {
    sky: { top: '#4a90d9', bottom: '#cfe8ff', sunColor: '#fff7e0', sunPosition: [40, 60, 20] },
    fog: { color: '#cfe8ff', near: 60, far: 240 },
    ground: { color: '#5a6b7a', roughness: 1, size: 400 },
    lighting: {
      ambient: { day: { color: '#bcd4ff', intensity: 0.6 }, night: { color: '#20304a', intensity: 0.15 } },
      sun: { day: { color: '#fff7e0', intensity: 1.4 }, night: { color: '#4a5a80', intensity: 0.2 }, position: [40, 60, 20], castShadow: true },
    },
    stars: false,
  },
  overcast: {
    sky: { top: '#9aa7b3', bottom: '#c7cfd6' },
    fog: { color: '#c7cfd6', near: 40, far: 180 },
    ground: { color: '#565f66', roughness: 1, size: 400 },
    lighting: {
      ambient: { day: { color: '#c7cfd6', intensity: 0.7 }, night: { color: '#2a2f36', intensity: 0.2 } },
      sun: { day: { color: '#dfe6ec', intensity: 0.7 }, night: { color: '#3a4048', intensity: 0.15 }, castShadow: false },
    },
    stars: false,
  },
  'foggy-dusk': {
    sky: { top: '#3a2f4a', bottom: '#e0806a', sunColor: '#ff9060', sunPosition: [-30, 10, -40] },
    fog: { color: '#c98a72', near: 20, far: 120 },
    ground: { color: '#4a3f4a', roughness: 1, size: 400 },
    lighting: {
      ambient: { day: { color: '#e0a080', intensity: 0.5 }, night: { color: '#2a2038', intensity: 0.2 } },
      sun: { day: { color: '#ff9060', intensity: 0.9 }, night: { color: '#403050', intensity: 0.25 }, position: [-30, 10, -40], castShadow: true },
    },
    stars: { count: 400 },
  },
  night: {
    sky: { top: '#070b18', bottom: '#12203a' },
    fog: { color: '#0a1224', near: 30, far: 160 },
    ground: { color: '#1a2230', roughness: 1, size: 400 },
    lighting: {
      ambient: { day: { color: '#3a4a6a', intensity: 0.3 }, night: { color: '#101828', intensity: 0.25 } },
      sun: { day: { color: '#6a7aa0', intensity: 0.4 }, night: { color: '#3a4a70', intensity: 0.3 }, position: [10, 40, -10], castShadow: true },
    },
    stars: { count: 1200 },
  },
} satisfies Record<string, WorldEnvironmentPreset>

export type WorldEnvironmentPresetName = keyof typeof WORLD_ENV_PRESETS

export function resolvePreset(
  p: WorldEnvironmentPresetName | WorldEnvironmentPreset
): WorldEnvironmentPreset {
  return typeof p === 'string' ? WORLD_ENV_PRESETS[p] : p
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.replace(/(.)/g, '$1$1') : h, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
function toHex(n: number): string {
  return Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0')
}

/** Linearly interpolate two #rrggbb colors. t is clamped to [0,1]. */
export function lerpColor(a: string, b: string, t: number): string {
  const tt = Math.max(0, Math.min(1, t))
  const [ar, ag, ab] = hexToRgb(a)
  const [br, bg, bb] = hexToRgb(b)
  return `#${toHex(lerp(ar, br, tt))}${toHex(lerp(ag, bg, tt))}${toHex(lerp(ab, bb, tt))}`
}

/** Resolve tone-mapping exposure for the given daylight factor. Defaults to 1. */
export function resolveExposure(preset: WorldEnvironmentPreset, daylight: number): number {
  const e = preset.exposure
  if (e === undefined) return 1
  if (typeof e === 'number') return e
  return lerp(e.night, e.day, daylight)
}

/** Resolve ambient/sun light values for the given daylight factor (0=night, 1=day). */
export function resolveLight(preset: WorldEnvironmentPreset, daylight: number) {
  const amb = preset.lighting?.ambient
  const sun = preset.lighting?.sun
  const moon = preset.lighting?.moon
  return {
    ambient: amb
      ? { color: lerpColor(amb.night.color, amb.day.color, daylight), intensity: lerp(amb.night.intensity, amb.day.intensity, daylight) }
      : { color: '#ffffff', intensity: 0.5 },
    sun: sun
      ? {
          // Night side uses the moon light when provided, else the sun's night values.
          color: lerpColor(moon?.night.color ?? sun.night.color, sun.day.color, daylight),
          intensity: lerp(moon?.night.intensity ?? sun.night.intensity, sun.day.intensity, daylight),
          position: sun.position ?? ([10, 40, 10] as Vec3),
          castShadow: sun.castShadow ?? true,
        }
      : { color: '#ffffff', intensity: 1, position: [10, 40, 10] as Vec3, castShadow: true },
  }
}
