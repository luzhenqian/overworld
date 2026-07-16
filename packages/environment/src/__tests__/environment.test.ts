import { EventBus, createMemoryStorage, type OverworldEventMap } from '@overworld-engine/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createEnvironment, type EnvironmentConfig } from '../createEnvironment'
import { DEFAULT_PHASES, derivePhase, getDaylightFactor, wrapTimeOfDay } from '../phase'
import type { WeatherDefinition } from '../types'

/** Deterministic random source consuming `values` in order (0 when exhausted). */
function sequenceRandom(...values: number[]): () => number {
  let index = 0
  return () => values[index++] ?? 0
}

function setup(config: EnvironmentConfig = {}) {
  const events = new EventBus<OverworldEventMap>()
  const engine = createEnvironment({ events, ...config })
  return { events, engine }
}

const fixedWeather = (id: string, weight?: number): WeatherDefinition => ({
  id,
  ...(weight !== undefined && { weight }),
  minDurationMs: 1000,
  maxDurationMs: 1000,
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('phase helpers', () => {
  it('wrapTimeOfDay wraps into [0, 1)', () => {
    expect(wrapTimeOfDay(0.25)).toBe(0.25)
    expect(wrapTimeOfDay(1)).toBe(0)
    expect(wrapTimeOfDay(1.75)).toBeCloseTo(0.75)
    expect(wrapTimeOfDay(-0.25)).toBeCloseTo(0.75)
  })

  it('derivePhase maps default boundaries to the four phases (night wraps)', () => {
    expect(derivePhase(0)).toBe('night')
    expect(derivePhase(0.19)).toBe('night')
    expect(derivePhase(0.2)).toBe('dawn')
    expect(derivePhase(0.3)).toBe('day')
    expect(derivePhase(0.69)).toBe('day')
    expect(derivePhase(0.7)).toBe('dusk')
    expect(derivePhase(0.8)).toBe('night')
    expect(derivePhase(0.99)).toBe('night')
  })

  it('getDaylightFactor is 0 at night, 1 at day, 0.5 mid-dawn', () => {
    expect(getDaylightFactor(0, DEFAULT_PHASES)).toBe(0)
    expect(getDaylightFactor(0.5, DEFAULT_PHASES)).toBe(1)
    expect(getDaylightFactor(0.25, DEFAULT_PHASES)).toBeCloseTo(0.5)
    expect(getDaylightFactor(0.75, DEFAULT_PHASES)).toBeCloseTo(0.5)
  })
})

describe('createEnvironment — day-night cycle', () => {
  it('tick advances timeOfDay proportionally to dayLengthMs and wraps past 1', () => {
    const { engine } = setup({ dayLengthMs: 1000, initialTimeOfDay: 0.9 })
    engine.tick(50)
    expect(engine.store.getState().timeOfDay).toBeCloseTo(0.95)
    engine.tick(200)
    expect(engine.store.getState().timeOfDay).toBeCloseTo(0.15)
    expect(engine.getPhase()).toBe('night')
  })

  it('derives the phase and emits environment:phase-changed only on transitions', () => {
    const { events, engine } = setup({ dayLengthMs: 1000, initialTimeOfDay: 0 })
    const phaseChanged = vi.fn()
    events.on('environment:phase-changed', phaseChanged)

    engine.tick(100) // 0.1 — still night
    expect(phaseChanged).not.toHaveBeenCalled()

    engine.tick(150) // 0.25 — dawn
    expect(engine.getPhase()).toBe('dawn')
    expect(phaseChanged).toHaveBeenCalledExactlyOnceWith({
      phase: 'dawn',
      timeOfDay: expect.closeTo(0.25),
    })

    engine.tick(250) // 0.5 — day
    expect(phaseChanged).toHaveBeenCalledTimes(2)
    expect(phaseChanged).toHaveBeenLastCalledWith({ phase: 'day', timeOfDay: expect.closeTo(0.5) })
  })

  it('respects custom phase boundaries', () => {
    const { engine } = setup({
      initialTimeOfDay: 0.15,
      phases: { dawn: 0.1, day: 0.4 },
    })
    expect(engine.getPhase()).toBe('dawn')
    engine.setTimeOfDay(0.39)
    expect(engine.getPhase()).toBe('dawn')
    engine.setTimeOfDay(0.4)
    expect(engine.getPhase()).toBe('day')
  })

  it('rejects invalid phase boundaries', () => {
    expect(() => setup({ phases: { dawn: 0.5, day: 0.3 } })).toThrow(/invalid phase boundaries/)
  })

  it('setTimeOfDay wraps and emits a phase change', () => {
    const { events, engine } = setup({ initialTimeOfDay: 0 })
    const phaseChanged = vi.fn()
    events.on('environment:phase-changed', phaseChanged)

    engine.setTimeOfDay(1.5)
    expect(engine.store.getState().timeOfDay).toBe(0.5)
    expect(phaseChanged).toHaveBeenCalledExactlyOnceWith({ phase: 'day', timeOfDay: 0.5 })

    engine.setTimeOfDay(0.6) // still day — no second emission
    expect(phaseChanged).toHaveBeenCalledTimes(1)
  })

  it('pauses and resumes ticking', () => {
    const { engine } = setup({ dayLengthMs: 1000, initialTimeOfDay: 0.5 })
    engine.setPaused(true)
    engine.tick(500)
    expect(engine.store.getState().timeOfDay).toBe(0.5)
    engine.setPaused(false)
    engine.tick(100)
    expect(engine.store.getState().timeOfDay).toBeCloseTo(0.6)
  })
})

describe('createEnvironment — weather', () => {
  it('starts with the first weather (or the configured initialWeather)', () => {
    const { engine } = setup({ weathers: [fixedWeather('sun'), fixedWeather('ash')] })
    expect(engine.store.getState().currentWeather).toBe('sun')
    expect(engine.getWeather()?.id).toBe('sun')

    const { engine: engine2 } = setup({
      weathers: [fixedWeather('sun'), fixedWeather('ash')],
      initialWeather: 'ash',
    })
    expect(engine2.store.getState().currentWeather).toBe('ash')
  })

  it('warns and falls back to the first weather for an unknown initialWeather', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { engine } = setup({ weathers: [fixedWeather('sun')], initialWeather: 'nope' })
    expect(engine.store.getState().currentWeather).toBe('sun')
    expect(warn).toHaveBeenCalledOnce()
  })

  it('has no weather when none are configured', () => {
    const { engine } = setup({ dayLengthMs: 1000 })
    expect(engine.store.getState().currentWeather).toBeNull()
    expect(engine.getWeather()).toBeNull()
    engine.tick(500) // must not throw or consume randomness
    expect(engine.store.getState().currentWeather).toBeNull()
  })

  it('rotates by weight when the duration elapses (deterministic random)', () => {
    // Calls: #1 initial duration, #2 pick, #3 new duration.
    // Weights sun=3, ash=1 (total 4): pick value 0.9 → r=3.6 → lands on ash.
    const { events, engine } = setup({
      dayLengthMs: 100_000,
      weathers: [fixedWeather('sun', 3), fixedWeather('ash', 1)],
      random: sequenceRandom(0, 0.9, 0.5),
    })
    const weatherChanged = vi.fn()
    events.on('environment:weather-changed', weatherChanged)

    engine.tick(999)
    expect(engine.store.getState().currentWeather).toBe('sun')
    expect(weatherChanged).not.toHaveBeenCalled()

    engine.tick(1) // elapsed reaches 1000 → rotate
    expect(engine.store.getState().currentWeather).toBe('ash')
    expect(weatherChanged).toHaveBeenCalledExactlyOnceWith({ from: 'sun', to: 'ash' })
    expect(engine.store.getState().weatherElapsedMs).toBe(0)
  })

  it('re-picking the current weather re-rolls the duration without emitting', () => {
    // pick value 0.1 → r=0.4 → lands on sun (weight 3) again.
    const { events, engine } = setup({
      dayLengthMs: 100_000,
      weathers: [fixedWeather('sun', 3), fixedWeather('ash', 1)],
      random: sequenceRandom(0, 0.1, 0),
    })
    const weatherChanged = vi.fn()
    events.on('environment:weather-changed', weatherChanged)

    engine.tick(1000)
    expect(engine.store.getState().currentWeather).toBe('sun')
    expect(engine.store.getState().weatherElapsedMs).toBe(0)
    expect(weatherChanged).not.toHaveBeenCalled()
  })

  it('rolls durations in [minDurationMs, maxDurationMs]', () => {
    // #1 initial duration: 1000 + 0.5 * 2000 = 2000; after rotation
    // (#2 pick, #3 duration 0.25): 1000 + 0.25 * 2000 = 1500.
    const { engine } = setup({
      dayLengthMs: 100_000,
      weathers: [{ id: 'mist', minDurationMs: 1000, maxDurationMs: 3000 }],
      random: sequenceRandom(0.5, 0, 0.25),
    })
    expect(engine.store.getState().weatherDurationMs).toBe(2000)

    engine.tick(1999)
    expect(engine.store.getState().weatherElapsedMs).toBe(1999)

    engine.tick(1)
    expect(engine.store.getState().weatherDurationMs).toBe(1500)
    expect(engine.store.getState().weatherElapsedMs).toBe(0)
  })

  it('does not advance weather while paused', () => {
    const { engine } = setup({ weathers: [fixedWeather('sun'), fixedWeather('ash')] })
    engine.setPaused(true)
    engine.tick(5000)
    expect(engine.store.getState().currentWeather).toBe('sun')
    expect(engine.store.getState().weatherElapsedMs).toBe(0)
  })

  it('setWeather forces a weather, resets the clock and emits from/to', () => {
    const { events, engine } = setup({ weathers: [fixedWeather('sun'), fixedWeather('ash')] })
    const weatherChanged = vi.fn()
    events.on('environment:weather-changed', weatherChanged)

    engine.tick(500)
    expect(engine.setWeather('ash')).toBe(true)
    expect(engine.store.getState().currentWeather).toBe('ash')
    expect(engine.store.getState().weatherElapsedMs).toBe(0)
    expect(weatherChanged).toHaveBeenCalledExactlyOnceWith({ from: 'sun', to: 'ash' })

    // Same id again: no emission.
    expect(engine.setWeather('ash')).toBe(true)
    expect(weatherChanged).toHaveBeenCalledTimes(1)
  })

  it('setWeather rejects unknown ids; registerWeathers adds them at runtime', () => {
    const { events, engine } = setup({ weathers: [fixedWeather('sun')] })
    const weatherChanged = vi.fn()
    events.on('environment:weather-changed', weatherChanged)

    expect(engine.setWeather('storm')).toBe(false)
    expect(weatherChanged).not.toHaveBeenCalled()

    engine.registerWeathers([fixedWeather('storm')])
    expect(engine.setWeather('storm')).toBe(true)
    expect(engine.store.getState().currentWeather).toBe('storm')
  })
})

describe('createEnvironment — persistence', () => {
  const weathers = [fixedWeather('sun'), fixedWeather('rain')]

  it('round-trips timeOfDay and currentWeather through a storage adapter', () => {
    const storage = createMemoryStorage()
    const persist = { name: 'env-rt', storage: () => storage }

    const { engine } = setup({ weathers, persist })
    engine.setTimeOfDay(0.42)
    engine.setWeather('rain')

    const { engine: restored } = setup({ weathers, persist })
    expect(restored.store.getState().timeOfDay).toBe(0.42)
    expect(restored.store.getState().currentWeather).toBe('rain')
    // Derived + transient state is rebuilt, not persisted.
    expect(restored.getPhase()).toBe('day')
    expect(restored.store.getState().paused).toBe(false)
    expect(restored.store.getState().weatherElapsedMs).toBe(0)
  })

  it('persist: true uses the default overworld:environment key', () => {
    // zustand's default storage reads `window.localStorage`; emulate it here.
    const backing = createMemoryStorage()
    vi.stubGlobal('window', { localStorage: backing })

    const { engine } = setup({ weathers, persist: true })
    const persistApi = (
      engine.store as unknown as { persist: { getOptions(): { name?: string } } }
    ).persist
    expect(persistApi.getOptions().name).toBe('overworld:environment')

    engine.setTimeOfDay(0.9)
    const { engine: restored } = setup({ weathers, persist: true })
    expect(restored.store.getState().timeOfDay).toBe(0.9)
    expect(restored.getPhase()).toBe('night')
  })

  it('persistence is disabled when persist is omitted or false', () => {
    const { engine: omitted } = setup({ weathers })
    const { engine: disabled } = setup({ weathers, persist: false })
    expect((omitted.store as { persist?: unknown }).persist).toBeUndefined()
    expect((disabled.store as { persist?: unknown }).persist).toBeUndefined()
  })
})
