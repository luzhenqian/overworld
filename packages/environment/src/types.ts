import type { StateStorage } from 'zustand/middleware'

/** The four phases of the day-night cycle. */
export type EnvironmentPhase = 'dawn' | 'day' | 'dusk' | 'night'

/**
 * Phase boundaries as normalized times of day (0-1). Each value marks where
 * that phase *starts*; the night phase wraps around midnight (timeOfDay 0).
 *
 * Must satisfy `0 <= dawn < day < dusk < night <= 1`. With the defaults
 * (0.2 / 0.3 / 0.7 / 0.8): night covers [0.8, 1) ∪ [0, 0.2).
 */
export interface PhaseBoundaries {
  /** Start of dawn. @default 0.2 */
  dawn: number
  /** Start of full day. @default 0.3 */
  day: number
  /** Start of dusk. @default 0.7 */
  dusk: number
  /** Start of night. @default 0.8 */
  night: number
}

/**
 * One weather kind the engine can rotate through. Content-only — the engine
 * has no built-in weather names; inject your own definitions (or the
 * optional `DEFAULT_WEATHERS` preset).
 */
export interface WeatherDefinition {
  /** Unique weather id (e.g. 'rain'). Opaque to the engine. */
  id: string
  /** Relative probability when auto-rotating. @default 1 */
  weight?: number
  /** Minimum duration before rotation, in ms. @default 60000 */
  minDurationMs?: number
  /** Maximum duration before rotation, in ms. @default minDurationMs */
  maxDurationMs?: number
}

/** The state held by the environment store. */
export interface EnvironmentState {
  /** Normalized time of day in [0, 1). 0 = midnight, 0.5 = midday. */
  timeOfDay: number
  /** Current phase, derived from `timeOfDay` and the phase boundaries. */
  phase: EnvironmentPhase
  /** When true, `tick()` is a no-op (time and weather both freeze). */
  paused: boolean
  /** Id of the active weather, or null when no weathers are configured. */
  currentWeather: string | null
  /** Ms the active weather has been running. */
  weatherElapsedMs: number
  /** Ms the active weather lasts before auto-rotation. */
  weatherDurationMs: number
}

/**
 * Persistence settings (the object form of `persist`). Only `timeOfDay` and
 * `currentWeather` are saved.
 */
export interface EnvironmentPersistConfig {
  /** Storage key (namespaced by `prefix`). @default 'environment' */
  name?: string
  /** Persisted-shape version, for migrations. @default 0 */
  version?: number
  /** Key prefix. @default 'overworld' */
  prefix?: string
  /** Storage backend factory. @default localStorage */
  storage?: () => StateStorage
}

/**
 * Framework event map extension — dogfoods `@overworld-engine/core`'s declaration
 * merging so `environment:*` events are fully typed on any bus.
 */
declare module '@overworld-engine/core' {
  interface OverworldEventMap {
    'environment:phase-changed': { phase: EnvironmentPhase; timeOfDay: number }
    'environment:weather-changed': { from: string | null; to: string }
  }
}
