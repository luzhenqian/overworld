import {
  gameEvents,
  persistOptions,
  type EventBus,
  type OverworldEventMap,
} from '@overworld-engine/core'
import { persist } from 'zustand/middleware'
import { createStore, type StoreApi } from 'zustand/vanilla'
import { DEFAULT_PHASES, derivePhase, validatePhaseBoundaries, wrapTimeOfDay } from './phase'
import type {
  EnvironmentPersistConfig,
  EnvironmentPhase,
  EnvironmentState,
  PhaseBoundaries,
  WeatherDefinition,
} from './types'

/** Fallback minimum weather duration when a definition omits `minDurationMs`. */
export const DEFAULT_WEATHER_MIN_DURATION_MS = 60_000

/** Configuration for {@link createEnvironment}. */
export interface EnvironmentConfig {
  /** Real-time length of one full in-game day, in ms. @default 600000 (10 min) */
  dayLengthMs?: number
  /** Starting time of day, normalized to [0, 1). @default 0.5 (midday) */
  initialTimeOfDay?: number
  /** Phase boundary overrides, merged over {@link DEFAULT_PHASES}. */
  phases?: Partial<PhaseBoundaries>
  /**
   * Weather kinds to rotate through. Content is injected — the engine has no
   * built-in weather names. Omit (or pass `[]`) to disable weather entirely;
   * import `DEFAULT_WEATHERS` for a starter set.
   */
  weathers?: WeatherDefinition[]
  /** Id of the starting weather. @default the first entry of `weathers` */
  initialWeather?: string
  /**
   * Event bus for `environment:*` emissions. Defaults to the global
   * `gameEvents`; inject a fresh bus in tests.
   */
  events?: EventBus<OverworldEventMap>
  /**
   * Random source for weather rotation, injectable for deterministic tests.
   * Consumed once per duration roll and once per weighted pick.
   * @default Math.random
   */
  random?: () => number
  /**
   * Save `timeOfDay` and `currentWeather` across sessions.
   * Omitted or `false` = disabled; `true` = defaults; object = custom.
   */
  persist?: boolean | EnvironmentPersistConfig
}

/** The headless environment engine returned by {@link createEnvironment}. */
export interface Environment {
  /** Underlying zustand vanilla store — subscribe directly or via `useStore` in React. */
  store: StoreApi<EnvironmentState>
  /** Resolved phase boundaries (defaults merged with `config.phases`). */
  readonly phases: PhaseBoundaries
  /**
   * Advance time and weather by `deltaMs` of real time. Wraps `timeOfDay`
   * past 1, re-derives the phase (emitting `environment:phase-changed` on
   * transitions) and auto-rotates weather when its duration elapses
   * (emitting `environment:weather-changed`). No-op while paused.
   */
  tick(deltaMs: number): void
  /**
   * Jump to a time of day (wrapped into [0, 1)). Emits
   * `environment:phase-changed` when the phase changes.
   */
  setTimeOfDay(timeOfDay: number): void
  /** Freeze/unfreeze `tick()` (time and weather both stop). */
  setPaused(paused: boolean): void
  /**
   * Force a weather by id, resetting its duration. Emits
   * `environment:weather-changed` when the weather actually changes.
   * Returns false for unknown ids.
   */
  setWeather(id: string): boolean
  /** Add or replace weather definitions at runtime. */
  registerWeathers(weathers: WeatherDefinition[]): void
  /** The active weather's definition, or null. */
  getWeather(): WeatherDefinition | null
  /** The current phase. */
  getPhase(): EnvironmentPhase
}

/**
 * Create a headless day-night + weather engine.
 *
 * Drive it with `tick(deltaMs)` — from `<EnvironmentTick/>` inside a R3F
 * canvas, or any game loop / interval. The engine holds zero game content:
 * weather kinds, phase boundaries, day length and visuals are all injected.
 */
export function createEnvironment(config: EnvironmentConfig = {}): Environment {
  const events = config.events ?? gameEvents
  const random = config.random ?? Math.random
  const dayLengthMs = config.dayLengthMs ?? 600_000
  const boundaries: PhaseBoundaries = { ...DEFAULT_PHASES, ...config.phases }
  validatePhaseBoundaries(boundaries)

  const weatherDefs = new Map<string, WeatherDefinition>()
  for (const def of config.weathers ?? []) weatherDefs.set(def.id, def)

  /** Roll a duration in [min, max]; always consumes exactly one random(). */
  const rollDuration = (def: WeatherDefinition): number => {
    const min = def.minDurationMs ?? DEFAULT_WEATHER_MIN_DURATION_MS
    const max = Math.max(def.maxDurationMs ?? min, min)
    return min + random() * (max - min)
  }

  /** Weighted pick across all definitions; consumes exactly one random(). */
  const pickWeather = (): WeatherDefinition => {
    const defs = [...weatherDefs.values()]
    const total = defs.reduce((sum, def) => sum + (def.weight ?? 1), 0)
    let r = random() * total
    for (const def of defs) {
      r -= def.weight ?? 1
      if (r < 0) return def
    }
    return defs[defs.length - 1] as WeatherDefinition
  }

  const resolveInitialWeather = (): string | null => {
    if (config.initialWeather !== undefined) {
      if (weatherDefs.has(config.initialWeather)) return config.initialWeather
      console.warn(
        `[overworld/environment] initialWeather "${config.initialWeather}" is not a configured weather`
      )
    }
    const first = config.weathers?.[0]
    return first ? first.id : null
  }

  const initializer = (): EnvironmentState => {
    const timeOfDay = wrapTimeOfDay(config.initialTimeOfDay ?? 0.5)
    const currentWeather = resolveInitialWeather()
    const def = currentWeather === null ? undefined : weatherDefs.get(currentWeather)
    return {
      timeOfDay,
      phase: derivePhase(timeOfDay, boundaries),
      paused: false,
      currentWeather,
      weatherElapsedMs: 0,
      weatherDurationMs: def ? rollDuration(def) : 0,
    }
  }

  // Framework-wide persist convention (v0.2): omitted/false = off,
  // true = defaults, object = custom.
  const persistConfig: EnvironmentPersistConfig | null =
    config.persist === true ? {} : config.persist ? config.persist : null

  type PersistedEnvironmentState = Pick<EnvironmentState, 'timeOfDay' | 'currentWeather'>
  const store: StoreApi<EnvironmentState> = persistConfig
    ? createStore<EnvironmentState>()(
        persist(initializer, {
          ...persistOptions<EnvironmentState, PersistedEnvironmentState>({
            name: persistConfig.name ?? 'environment',
            partialize: (state) => ({
              timeOfDay: state.timeOfDay,
              currentWeather: state.currentWeather,
            }),
            ...(persistConfig.version !== undefined && { version: persistConfig.version }),
            ...(persistConfig.prefix !== undefined && { prefix: persistConfig.prefix }),
            ...(persistConfig.storage !== undefined && { storage: persistConfig.storage }),
          }),
        })
      )
    : createStore<EnvironmentState>()(initializer)

  // Rehydration restores timeOfDay but not the derived phase — resync it
  // (silently: initialization is not a phase *change*).
  if (persistConfig) {
    const state = store.getState()
    const phase = derivePhase(state.timeOfDay, boundaries)
    if (phase !== state.phase) store.setState({ phase })
  }

  const environment: Environment = {
    store,
    phases: boundaries,

    tick(deltaMs) {
      const state = store.getState()
      if (state.paused || deltaMs <= 0) return

      const timeOfDay = wrapTimeOfDay(state.timeOfDay + deltaMs / dayLengthMs)
      const phase = derivePhase(timeOfDay, boundaries)
      const phaseChanged = phase !== state.phase
      const update: Partial<EnvironmentState> = { timeOfDay }
      if (phaseChanged) update.phase = phase

      let weatherChange: { from: string | null; to: string } | null = null
      if (state.currentWeather !== null && weatherDefs.size > 0) {
        const elapsed = state.weatherElapsedMs + deltaMs
        if (elapsed >= state.weatherDurationMs) {
          const next = pickWeather()
          update.weatherElapsedMs = 0
          update.weatherDurationMs = rollDuration(next)
          if (next.id !== state.currentWeather) {
            update.currentWeather = next.id
            weatherChange = { from: state.currentWeather, to: next.id }
          }
        } else {
          update.weatherElapsedMs = elapsed
        }
      }

      store.setState(update)
      if (phaseChanged) events.emit('environment:phase-changed', { phase, timeOfDay })
      if (weatherChange) events.emit('environment:weather-changed', weatherChange)
    },

    setTimeOfDay(value) {
      const timeOfDay = wrapTimeOfDay(value)
      const phase = derivePhase(timeOfDay, boundaries)
      const phaseChanged = phase !== store.getState().phase
      store.setState({ timeOfDay, phase })
      if (phaseChanged) events.emit('environment:phase-changed', { phase, timeOfDay })
    },

    setPaused(paused) {
      store.setState({ paused })
    },

    setWeather(id) {
      const def = weatherDefs.get(id)
      if (!def) return false
      const from = store.getState().currentWeather
      store.setState({
        currentWeather: id,
        weatherElapsedMs: 0,
        weatherDurationMs: rollDuration(def),
      })
      if (from !== id) events.emit('environment:weather-changed', { from, to: id })
      return true
    },

    registerWeathers(weathers) {
      for (const def of weathers) weatherDefs.set(def.id, def)
    },

    getWeather() {
      const id = store.getState().currentWeather
      return id === null ? null : (weatherDefs.get(id) ?? null)
    },

    getPhase() {
      return store.getState().phase
    },
  }

  return environment
}
