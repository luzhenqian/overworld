import type { ReactNode } from 'react'
import { useStore } from 'zustand'
import type { Environment } from './createEnvironment'

/** Props for {@link WeatherVisuals}. */
export interface WeatherVisualsProps {
  /** Engine whose `currentWeather` selects the visual. */
  engine: Environment
  /**
   * Weather id → scene node. Content injection point: the engine never
   * knows what a weather looks like. Ids without an entry render nothing
   * (e.g. 'clear').
   */
  weatherEffects: Record<string, ReactNode>
}

/**
 * Render the visual mapped to the engine's current weather:
 *
 * ```tsx
 * <WeatherVisuals
 *   engine={environment}
 *   weatherEffects={{ rain: <RainParticles />, snow: <SnowParticles /> }}
 * />
 * ```
 */
export function WeatherVisuals({ engine, weatherEffects }: WeatherVisualsProps) {
  const currentWeather = useStore(engine.store, (state) => state.currentWeather)
  if (currentWeather === null) return null
  return <>{weatherEffects[currentWeather] ?? null}</>
}
