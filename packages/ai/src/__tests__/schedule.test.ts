import { EventBus } from '@overworld-engine/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAgent } from '../behaviors'
import { bindScheduleToBus, createSchedule, type ScheduleBehavior } from '../schedule'

afterEach(() => {
  vi.restoreAllMocks()
})

/** An agent plus a schedule covering every declarative behavior type. */
function setup(initialPhase?: string) {
  const agent = createAgent({ position: [0, 0], speed: 2 })
  const entries: Record<string, ScheduleBehavior> = {
    day: { type: 'patrol', waypoints: [[4, 0], [4, 4]], pauseMs: 100 },
    night: { type: 'wander', center: [0, 0], radius: 3 },
    dawn: { type: 'follow', target: () => [5, 5], stopDistance: 2 },
    dusk: { type: 'goTo', point: [2, 2] },
    rest: { type: 'idle' },
  }
  const schedule = createSchedule(
    initialPhase !== undefined ? { agent, entries, initialPhase } : { agent, entries }
  )
  return { agent, schedule }
}

describe('createSchedule', () => {
  it('applyPhase applies each entry type to the agent', () => {
    const { agent, schedule } = setup()
    expect(schedule.currentPhase).toBeNull()
    expect(agent.behavior).toBe('idle')

    schedule.applyPhase('day')
    expect(agent.behavior).toBe('patrol')
    expect(schedule.currentPhase).toBe('day')

    schedule.applyPhase('night')
    expect(agent.behavior).toBe('wander')

    schedule.applyPhase('dawn')
    expect(agent.behavior).toBe('follow')

    schedule.applyPhase('dusk')
    expect(agent.behavior).toBe('goTo')

    schedule.applyPhase('rest')
    expect(agent.behavior).toBe('idle')
    expect(schedule.currentPhase).toBe('rest')
  })

  it('applies initialPhase immediately at creation', () => {
    const { agent, schedule } = setup('night')
    expect(agent.behavior).toBe('wander')
    expect(schedule.currentPhase).toBe('night')
  })

  it('warns once per unknown phase and keeps the current behavior', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { agent, schedule } = setup('day')

    schedule.applyPhase('brunch')
    schedule.applyPhase('brunch')
    expect(warn).toHaveBeenCalledTimes(1)
    expect(agent.behavior).toBe('patrol')
    expect(schedule.currentPhase).toBe('day')

    schedule.applyPhase('siesta') // a different unknown phase warns again
    expect(warn).toHaveBeenCalledTimes(2)
  })

  it('dispose turns applyPhase into a no-op', () => {
    const { agent, schedule } = setup('day')
    schedule.dispose()
    schedule.applyPhase('night')
    expect(agent.behavior).toBe('patrol')
    expect(schedule.currentPhase).toBe('day')
  })
})

describe('bindScheduleToBus', () => {
  // A fresh, locally-typed bus — no dependency on the environment package's
  // event map; the binding goes through `onAny` and only matches the name.
  type TestEvents = {
    'environment:phase-changed': { phase: string; timeOfDay: number }
    'game:mood-changed': { mood: string }
    'player:moved': { position: [number, number, number]; distance: number }
  }

  it('drives applyPhase from environment:phase-changed by default', () => {
    const bus = new EventBus<TestEvents>()
    const { agent, schedule } = setup()
    bindScheduleToBus(schedule, bus)

    bus.emit('environment:phase-changed', { phase: 'night', timeOfDay: 0.9 })
    expect(agent.behavior).toBe('wander')
    expect(schedule.currentPhase).toBe('night')

    // Unrelated events are ignored.
    bus.emit('player:moved', { position: [1, 0, 1], distance: 1 })
    expect(schedule.currentPhase).toBe('night')
  })

  it('ignores payloads without a string phase', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const bus = new EventBus<Record<string, unknown>>()
    const { schedule } = setup()
    bindScheduleToBus(schedule, bus)

    bus.emit('environment:phase-changed', { timeOfDay: 0.5 })
    bus.emit('environment:phase-changed', { phase: 42 })
    expect(schedule.currentPhase).toBeNull()
    expect(warn).not.toHaveBeenCalled()
  })

  it('supports a custom event name and phaseFrom extractor', () => {
    const bus = new EventBus<TestEvents>()
    const { agent, schedule } = setup()
    bindScheduleToBus(schedule, bus, {
      event: 'game:mood-changed',
      phaseFrom: (payload) => (payload as { mood: string }).mood,
    })

    bus.emit('environment:phase-changed', { phase: 'night', timeOfDay: 0.9 })
    expect(schedule.currentPhase).toBeNull() // default event no longer bound

    bus.emit('game:mood-changed', { mood: 'day' })
    expect(agent.behavior).toBe('patrol')
    expect(schedule.currentPhase).toBe('day')
  })

  it('the unbind function stops phase application', () => {
    const bus = new EventBus<TestEvents>()
    const { agent, schedule } = setup()
    const unbind = bindScheduleToBus(schedule, bus)

    bus.emit('environment:phase-changed', { phase: 'day', timeOfDay: 0.5 })
    expect(agent.behavior).toBe('patrol')

    unbind()
    bus.emit('environment:phase-changed', { phase: 'night', timeOfDay: 0.9 })
    expect(agent.behavior).toBe('patrol')
    expect(schedule.currentPhase).toBe('day')
  })

  it('a disposed schedule ignores bus events', () => {
    const bus = new EventBus<TestEvents>()
    const { agent, schedule } = setup('day')
    bindScheduleToBus(schedule, bus)

    schedule.dispose()
    bus.emit('environment:phase-changed', { phase: 'night', timeOfDay: 0.9 })
    expect(agent.behavior).toBe('patrol')
  })
})
