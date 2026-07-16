import { describe, expect, it, vi } from 'vitest'
import { EventBus } from '@overworld-engine/core'
import {
  createEventStream,
  DEFAULT_EVENT_STREAM_MAX,
  type EventEntry,
} from '../eventStream'

/** A standalone bus with an ad-hoc event map, isolated per test. */
interface TestMap {
  a: { n: number }
  b: { s: string }
  c: undefined
}
const freshBus = (): EventBus<TestMap> => new EventBus<TestMap>()

const names = (entries: EventEntry[]): string[] => entries.map((e) => e.event)
const seqs = (entries: EventEntry[]): number[] => entries.map((e) => e.seq)

describe('createEventStream', () => {
  it('records a scripted sequence in emission order with payloads', () => {
    const bus = freshBus()
    const stream = createEventStream(bus)

    bus.emit('a', { n: 1 })
    bus.emit('b', { s: 'x' })
    bus.emit('a', { n: 2 })

    const entries = stream.entries()
    expect(names(entries)).toEqual(['a', 'b', 'a'])
    expect(entries.map((e) => e.payload)).toEqual([{ n: 1 }, { s: 'x' }, { n: 2 }])
    stream.stop()
  })

  it('assigns deterministic monotonic seq/at (0,1,2…), not Date.now', () => {
    const nowSpy = vi.spyOn(Date, 'now')
    const bus = freshBus()
    const stream = createEventStream(bus)

    bus.emit('a', { n: 1 })
    bus.emit('a', { n: 2 })
    bus.emit('a', { n: 3 })

    const entries = stream.entries()
    expect(seqs(entries)).toEqual([0, 1, 2])
    expect(entries.map((e) => e.at)).toEqual([0, 1, 2])
    expect(nowSpy).not.toHaveBeenCalled()
    nowSpy.mockRestore()
    stream.stop()
  })

  it('caps the ring buffer at max, keeping the most recent entries', () => {
    const bus = freshBus()
    const stream = createEventStream(bus, { max: 3 })

    for (let i = 0; i < 5; i++) bus.emit('a', { n: i })

    const entries = stream.entries()
    expect(entries).toHaveLength(3)
    // Oldest two (seq 0,1) evicted; seq keeps climbing across eviction.
    expect(seqs(entries)).toEqual([2, 3, 4])
    expect(entries.map((e) => (e.payload as { n: number }).n)).toEqual([2, 3, 4])
    stream.stop()
  })

  it('defaults max to DEFAULT_EVENT_STREAM_MAX (200)', () => {
    const bus = freshBus()
    const stream = createEventStream(bus)

    for (let i = 0; i < DEFAULT_EVENT_STREAM_MAX + 25; i++) bus.emit('a', { n: i })

    const entries = stream.entries()
    expect(entries).toHaveLength(DEFAULT_EVENT_STREAM_MAX)
    expect(entries[0]!.seq).toBe(25)
    expect(entries[entries.length - 1]!.seq).toBe(DEFAULT_EVENT_STREAM_MAX + 24)
    stream.stop()
  })

  it('clamps a non-positive max to 1', () => {
    const bus = freshBus()
    const stream = createEventStream(bus, { max: 0 })
    bus.emit('a', { n: 1 })
    bus.emit('a', { n: 2 })
    expect(stream.entries()).toHaveLength(1)
    expect(seqs(stream.entries())).toEqual([1])
    stream.stop()
  })

  it('counts every emission cumulatively, even after ring-buffer eviction', () => {
    const bus = freshBus()
    const stream = createEventStream(bus, { max: 2 })

    bus.emit('a', { n: 1 })
    bus.emit('a', { n: 2 })
    bus.emit('b', { s: 'x' })
    bus.emit('a', { n: 3 })

    // Only the last two remain buffered…
    expect(stream.entries()).toHaveLength(2)
    // …but counts reflect all four emissions.
    expect(stream.counts()).toEqual({ a: 3, b: 1 })
    stream.stop()
  })

  it('handles undefined payloads', () => {
    const bus = freshBus()
    const stream = createEventStream(bus)
    bus.emit('c', undefined)
    const [entry] = stream.entries()
    expect(entry?.event).toBe('c')
    expect(entry?.payload).toBeUndefined()
    stream.stop()
  })

  it('clear() empties the buffer and counts but keeps the seq counter monotonic', () => {
    const bus = freshBus()
    const stream = createEventStream(bus)

    bus.emit('a', { n: 1 })
    bus.emit('b', { s: 'x' })
    expect(stream.entries()).toHaveLength(2)

    stream.clear()
    expect(stream.entries()).toEqual([])
    expect(stream.counts()).toEqual({})

    bus.emit('a', { n: 2 })
    const entries = stream.entries()
    expect(names(entries)).toEqual(['a'])
    // seq did not reset — it continues from before the clear.
    expect(entries[0]!.seq).toBe(2)
    expect(stream.counts()).toEqual({ a: 1 })
    stream.stop()
  })

  it('stop() unsubscribes: later emissions are not recorded', () => {
    const bus = freshBus()
    const stream = createEventStream(bus)

    bus.emit('a', { n: 1 })
    stream.stop()
    bus.emit('a', { n: 2 })
    bus.emit('b', { s: 'x' })

    expect(names(stream.entries())).toEqual(['a'])
    expect(stream.counts()).toEqual({ a: 1 })
  })

  it('stop() is idempotent and returns a callable unsubscribe', () => {
    const bus = freshBus()
    const stream = createEventStream(bus)
    const unsub = stream.stop()
    expect(typeof unsub).toBe('function')
    // Calling again (both stop and the returned fn) must not throw.
    expect(() => stream.stop()).not.toThrow()
    expect(() => unsub()).not.toThrow()
  })

  it('entries() returns a defensive copy', () => {
    const bus = freshBus()
    const stream = createEventStream(bus)
    bus.emit('a', { n: 1 })
    const first = stream.entries()
    first.push({ seq: 99, event: 'z', payload: null, at: 99 })
    expect(stream.entries()).toHaveLength(1)
    stream.stop()
  })

  it('counts() returns a snapshot that does not mutate internal state', () => {
    const bus = freshBus()
    const stream = createEventStream(bus)
    bus.emit('a', { n: 1 })
    const snap = stream.counts()
    snap.a = 999
    snap.injected = 1
    expect(stream.counts()).toEqual({ a: 1 })
    stream.stop()
  })

  it('two independent streams on the same bus record independently', () => {
    const bus = freshBus()
    const s1 = createEventStream(bus)
    bus.emit('a', { n: 1 })
    const s2 = createEventStream(bus)
    bus.emit('b', { s: 'x' })

    expect(names(s1.entries())).toEqual(['a', 'b'])
    expect(names(s2.entries())).toEqual(['b'])
    s1.stop()
    bus.emit('a', { n: 2 })
    // s1 stopped; s2 keeps going.
    expect(names(s1.entries())).toEqual(['a', 'b'])
    expect(names(s2.entries())).toEqual(['b', 'a'])
    s2.stop()
  })
})
