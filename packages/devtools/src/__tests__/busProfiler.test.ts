import { afterEach, describe, expect, it, vi } from 'vitest'
import { EventBus, type OverworldEventMap } from '@overworld/core'
import { profileBus } from '../busProfiler'
import { createEventRecorder } from '../eventLogger'

function makeBus(): EventBus<OverworldEventMap> {
  return new EventBus<OverworldEventMap>()
}

/**
 * Deterministic clock: each call returns the next queued timestamp. The
 * profiler reads it twice per emit (start/end), so a pair `[t, t + d]`
 * yields a measured duration of exactly `d` ms.
 */
function makeClock(...timestamps: number[]): () => number {
  return () => {
    const next = timestamps.shift()
    if (next === undefined) throw new Error('clock exhausted')
    return next
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('profileBus', () => {
  it('counts emissions and accumulates durations per event with an injected clock', () => {
    const bus = makeBus()
    // quest:started takes 5ms, then 2ms; item:used takes 10ms.
    const profiler = profileBus(bus, { now: makeClock(0, 5, 10, 12, 20, 30) })
    bus.emit('quest:started', { questId: 'a' })
    bus.emit('quest:started', { questId: 'b' })
    bus.emit('item:used', { itemId: 'potion' })

    expect(profiler.stats()).toEqual({
      'quest:started': { count: 2, totalMs: 7, maxMs: 5, lastMs: 2 },
      'item:used': { count: 1, totalMs: 10, maxMs: 10, lastMs: 10 },
    })
    profiler.stop()
  })

  it('measures the synchronous listener dispatch, not just bookkeeping', () => {
    const bus = makeBus()
    const calls: string[] = []
    bus.on('quest:started', () => calls.push('listener'))
    const profiler = profileBus(bus, { now: makeClock(0, 3) })
    bus.emit('quest:started', { questId: 'a' })
    expect(calls).toEqual(['listener']) // listeners still run through the wrapper
    expect(profiler.stats()['quest:started']).toEqual({ count: 1, totalMs: 3, maxMs: 3, lastMs: 3 })
    profiler.stop()
  })

  it('top() sorts by totalMs by default and by count on request', () => {
    const bus = makeBus()
    // item:used: 3 emissions of 1ms each (total 3); quest:started: 1 emission of 9ms.
    const profiler = profileBus(bus, { now: makeClock(0, 1, 1, 2, 2, 3, 3, 12) })
    bus.emit('item:used', { itemId: 'x' })
    bus.emit('item:used', { itemId: 'x' })
    bus.emit('item:used', { itemId: 'x' })
    bus.emit('quest:started', { questId: 'q' })

    expect(profiler.top().map((e) => e.event)).toEqual(['quest:started', 'item:used'])
    expect(profiler.top(2, 'count').map((e) => e.event)).toEqual(['item:used', 'quest:started'])
    expect(profiler.top(1)).toEqual([
      { event: 'quest:started', count: 1, totalMs: 9, maxMs: 9, lastMs: 9 },
    ])
    profiler.stop()
  })

  it('reset() clears stats but keeps profiling', () => {
    const bus = makeBus()
    const profiler = profileBus(bus, { now: makeClock(0, 1, 1, 2) })
    bus.emit('item:used', { itemId: 'x' })
    profiler.reset()
    expect(profiler.stats()).toEqual({})
    bus.emit('item:used', { itemId: 'x' })
    expect(profiler.stats()['item:used']?.count).toBe(1)
    profiler.stop()
  })

  it('stop() restores the original emit and is idempotent', () => {
    const bus = makeBus()
    const profiler = profileBus(bus, { now: makeClock(0, 1) })
    bus.emit('item:used', { itemId: 'x' })
    profiler.stop()
    bus.emit('item:used', { itemId: 'y' }) // would exhaust the clock if still profiled
    expect(profiler.stats()['item:used']?.count).toBe(1)
    expect(() => profiler.stop()).not.toThrow()

    // Listeners keep working after stop.
    const seen: string[] = []
    bus.on('item:used', ({ itemId }) => seen.push(itemId))
    bus.emit('item:used', { itemId: 'z' })
    expect(seen).toEqual(['z'])
  })

  it('report() is an aligned table sorted by totalMs desc', () => {
    const bus = makeBus()
    const profiler = profileBus(bus, { now: makeClock(0, 1, 1, 10) })
    bus.emit('item:used', { itemId: 'x' })
    bus.emit('quest:started', { questId: 'q' })

    const report = profiler.report()
    const lines = report.split('\n')
    expect(lines[0]).toBe('[overworld] bus profile: 2 event(s), 2 emission(s)')
    expect(lines[1]).toContain('event')
    expect(lines[1]).toContain('count')
    expect(lines[1]).toContain('total ms')
    // quest:started (9ms) sorts above item:used (1ms).
    expect(report.indexOf('quest:started')).toBeLessThan(report.indexOf('item:used'))
    expect(lines[2]).toContain('9.00')
    profiler.stop()

    const empty = profileBus(makeBus())
    expect(empty.report()).toBe('[overworld] bus profile: no emissions recorded')
    empty.stop()
  })

  it('works alongside createEventRecorder on the same bus', () => {
    const bus = makeBus()
    const recorder = createEventRecorder(bus)
    const profiler = profileBus(bus, { now: makeClock(0, 1) })
    bus.emit('quest:started', { questId: 'a' })
    expect(recorder.events).toEqual([{ event: 'quest:started', payload: { questId: 'a' }, at: 0 }])
    expect(profiler.stats()['quest:started']?.count).toBe(1)
    profiler.stop()
    recorder.stop()
  })

  it('chains when the same bus is profiled twice, with a warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const bus = makeBus()
    const inner = profileBus(bus, { now: makeClock(0, 1) })
    expect(warn).not.toHaveBeenCalled()
    const outer = profileBus(bus, { now: makeClock(0, 5) })
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0]?.[0]).toContain('already being profiled')

    bus.emit('item:used', { itemId: 'x' })
    // Both profilers observed the emission.
    expect(inner.stats()['item:used']?.count).toBe(1)
    expect(outer.stats()['item:used']?.count).toBe(1)

    // LIFO stop: outer first, then inner; emit is fully restored.
    outer.stop()
    inner.stop()
    const seen: string[] = []
    bus.on('item:used', ({ itemId }) => seen.push(itemId))
    bus.emit('item:used', { itemId: 'y' }) // neither clock is consulted (both exhausted)
    expect(seen).toEqual(['y'])
    expect(inner.stats()['item:used']?.count).toBe(1)
    expect(outer.stats()['item:used']?.count).toBe(1)
  })
})
