import { EventBus, type OverworldEventMap } from '@overworld-engine/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPresenceSync, type PresenceSync } from '../presence'
import { createLocalTransportHub, type LocalTransportHub } from '../transport'

type Vec3 = [number, number, number]

function trackPeerEvents(bus: EventBus<OverworldEventMap>) {
  const joined: string[] = []
  const left: string[] = []
  bus.on('net:peer-joined', ({ peerId }) => joined.push(peerId))
  bus.on('net:peer-left', ({ peerId }) => left.push(peerId))
  return { joined, left }
}

describe('createPresenceSync', () => {
  let hub: LocalTransportHub
  let posA: Vec3
  let posB: Vec3
  let busA: EventBus<OverworldEventMap>
  let busB: EventBus<OverworldEventMap>
  let syncA: PresenceSync
  let syncB: PresenceSync

  beforeEach(() => {
    vi.useFakeTimers()
    hub = createLocalTransportHub()
    posA = [1, 0, 2]
    posB = [5, 0, 6]
    busA = new EventBus<OverworldEventMap>()
    busB = new EventBus<OverworldEventMap>()
    syncA = createPresenceSync({
      transport: hub.createTransport('A'),
      getLocal: () => ({ position: posA, rotationY: 0.5, meta: { name: 'Alice' } }),
      events: busA,
    })
    syncB = createPresenceSync({
      transport: hub.createTransport('B'),
      getLocal: () => ({ position: posB }),
      events: busB,
    })
  })

  afterEach(() => {
    syncA.stop()
    syncB.stop()
    vi.useRealTimers()
  })

  it('two started peers see each other with position/rotation/meta', () => {
    syncA.start()
    syncB.start()
    // A subscribed before B's first beat, so A sees B immediately; B catches
    // A's keepalive (every 5th beat) within 500 ms.
    vi.advanceTimersByTime(600)

    const aSeesB = syncA.store.getState()['B']
    expect(aSeesB).toBeDefined()
    expect(aSeesB?.position).toEqual([5, 0, 6])
    expect(aSeesB?.rotationY).toBe(0)

    const bSeesA = syncB.store.getState()['A']
    expect(bSeesA).toBeDefined()
    expect(bSeesA?.position).toEqual([1, 0, 2])
    expect(bSeesA?.rotationY).toBe(0.5)
    expect(bSeesA?.meta).toEqual({ name: 'Alice' })

    expect(syncA.peers().map((p) => p.peerId)).toEqual(['B'])
  })

  it('emits net:peer-joined exactly once per peer on the provided bus', () => {
    const eventsA = trackPeerEvents(busA)
    syncA.start()
    syncB.start()
    vi.advanceTimersByTime(2000)
    expect(eventsA.joined).toEqual(['B'])
    expect(eventsA.left).toEqual([])
  })

  it('position changes are sent on the next beat', () => {
    syncA.start()
    syncB.start()
    vi.advanceTimersByTime(600)
    expect(syncB.store.getState()['A']?.position).toEqual([1, 0, 2])

    posA[0] = 9
    vi.advanceTimersByTime(100)
    expect(syncB.store.getState()['A']?.position).toEqual([9, 0, 2])
  })

  it('unchanged transforms still keep the peer alive via keepalives', () => {
    syncA.start()
    syncB.start()
    // Way past staleAfterMs (3000) with nobody moving: keepalives every
    // 500 ms must keep both peers fresh.
    vi.advanceTimersByTime(10_000)
    expect(syncA.store.getState()['B']).toBeDefined()
    expect(syncB.store.getState()['A']).toBeDefined()
  })

  it('stop() broadcasts bye so peers drop immediately and emit net:peer-left', () => {
    const eventsA = trackPeerEvents(busA)
    syncA.start()
    syncB.start()
    vi.advanceTimersByTime(600)
    expect(syncA.store.getState()['B']).toBeDefined()

    syncB.stop()
    expect(syncA.store.getState()['B']).toBeUndefined()
    expect(eventsA.left).toEqual(['B'])
  })

  it('silent peers expire after staleAfterMs and emit net:peer-left', () => {
    const eventsA = trackPeerEvents(busA)
    syncA.start()

    // A raw transport that sends a single presence envelope, then goes silent.
    const ghost = hub.createTransport('ghost')
    ghost.send({ t: 'presence', position: [0, 0, 0] })
    expect(syncA.store.getState()['ghost']).toBeDefined()
    expect(eventsA.joined).toEqual(['ghost'])

    vi.advanceTimersByTime(3200)
    expect(syncA.store.getState()['ghost']).toBeUndefined()
    expect(eventsA.left).toEqual(['ghost'])
  })

  it('ignores non-presence envelopes and malformed data', () => {
    syncA.start()
    const other = hub.createTransport('other')
    other.send({ t: 'event', event: 'x', payload: 1 })
    other.send('junk')
    other.send({ t: 'presence', position: 'nope' })
    expect(syncA.store.getState()['other']).toBeUndefined()
  })

  it('start() is idempotent and stop() before start() is a no-op', () => {
    syncB.start()
    const before = Object.keys(syncB.store.getState())
    syncA.start()
    syncA.start()
    vi.advanceTimersByTime(600)
    expect(Object.keys(syncB.store.getState())).not.toEqual(before)
    expect(() => createPresenceSync({
      transport: hub.createTransport('C'),
      getLocal: () => ({ position: [0, 0, 0] }),
      events: new EventBus<OverworldEventMap>(),
    }).stop()).not.toThrow()
  })

  it('respects custom intervalMs and staleAfterMs', () => {
    const bus = new EventBus<OverworldEventMap>()
    const events = trackPeerEvents(bus)
    const fast = createPresenceSync({
      transport: hub.createTransport('fast'),
      getLocal: () => ({ position: [0, 0, 0] }),
      intervalMs: 10,
      staleAfterMs: 50,
      events: bus,
    })
    fast.start()

    const ghost = hub.createTransport('ghost2')
    ghost.send({ t: 'presence', position: [1, 1, 1] })
    expect(events.joined).toEqual(['ghost2'])
    vi.advanceTimersByTime(70)
    expect(events.left).toEqual(['ghost2'])
    fast.stop()
  })
})
