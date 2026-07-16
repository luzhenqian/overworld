import { useMemo, useRef } from 'react'
import { Color } from 'three'
import type * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import type { Vec3 } from '@overworld-engine/core'
import type { Environment } from './createEnvironment'
import { getDaylightFactor } from './phase'

/** A value pair interpolated between full day (factor 1) and deep night (factor 0). */
export interface DayNightValue<T> {
  day: T
  night: T
}

/** Props for {@link DayNightLighting}. */
export interface DayNightLightingProps {
  /** Engine whose `timeOfDay` drives the lights. */
  engine: Environment
  /** Ambient light intensity at day/night. @default { day: 0.8, night: 0.25 } */
  ambientIntensity?: DayNightValue<number>
  /** Ambient light color at day/night. @default { day: '#ffffff', night: '#33415f' } */
  ambientColor?: DayNightValue<string>
  /** Sun (directional light) intensity at day/night. @default { day: 1.2, night: 0.08 } */
  sunIntensity?: DayNightValue<number>
  /** Sun color at day/night (warm white to moonlight blue). @default { day: '#fff4e0', night: '#3a4a7a' } */
  sunColor?: DayNightValue<string>
  /** Directional light position. @default [50, 80, 30] */
  sunPosition?: Vec3
  /** Let the sun cast shadows. @default false */
  castShadow?: boolean
}

const DEFAULT_AMBIENT_INTENSITY: DayNightValue<number> = { day: 0.8, night: 0.25 }
const DEFAULT_AMBIENT_COLOR: DayNightValue<string> = { day: '#ffffff', night: '#33415f' }
const DEFAULT_SUN_INTENSITY: DayNightValue<number> = { day: 1.2, night: 0.08 }
const DEFAULT_SUN_COLOR: DayNightValue<string> = { day: '#fff4e0', night: '#3a4a7a' }

/**
 * Ambient + directional light whose intensity and color follow the engine's
 * time of day. The smoothed daylight curve ramps across dawn/dusk (see
 * `getDaylightFactor`), so sunrise and sunset fade instead of snapping —
 * the continuous, parameterized version of the source game's per-phase
 * atmosphere tables. Reads the store imperatively each frame; no re-renders.
 */
export function DayNightLighting({
  engine,
  ambientIntensity = DEFAULT_AMBIENT_INTENSITY,
  ambientColor = DEFAULT_AMBIENT_COLOR,
  sunIntensity = DEFAULT_SUN_INTENSITY,
  sunColor = DEFAULT_SUN_COLOR,
  sunPosition = [50, 80, 30],
  castShadow = false,
}: DayNightLightingProps) {
  const ambientRef = useRef<THREE.AmbientLight>(null)
  const sunRef = useRef<THREE.DirectionalLight>(null)

  const ambientDay = useMemo(() => new Color(ambientColor.day), [ambientColor.day])
  const ambientNight = useMemo(() => new Color(ambientColor.night), [ambientColor.night])
  const sunDay = useMemo(() => new Color(sunColor.day), [sunColor.day])
  const sunNight = useMemo(() => new Color(sunColor.night), [sunColor.night])

  useFrame(() => {
    const daylight = getDaylightFactor(engine.store.getState().timeOfDay, engine.phases)
    const ambient = ambientRef.current
    if (ambient) {
      ambient.intensity = ambientIntensity.night + (ambientIntensity.day - ambientIntensity.night) * daylight
      ambient.color.lerpColors(ambientNight, ambientDay, daylight)
    }
    const sun = sunRef.current
    if (sun) {
      sun.intensity = sunIntensity.night + (sunIntensity.day - sunIntensity.night) * daylight
      sun.color.lerpColors(sunNight, sunDay, daylight)
    }
  })

  return (
    <>
      <ambientLight ref={ambientRef} />
      <directionalLight ref={sunRef} position={sunPosition} castShadow={castShadow} />
    </>
  )
}
