import { EventBus, type OverworldEventMap } from '@overworld-engine/core'
import { describe, expect, it } from 'vitest'
import { createPresenceSync } from '../presence'
import { createLocalTransportHub } from '../transport'

/**
 * Clock injection: everything runs on real timers on purpose — the injected
 * clock alone drives lastSeenAt, the stale sweep, and the interpolation
 * buffers. Sweeps are triggered synchronously via the tick start() performs.
 */
describe('createPresenceSync clock injection', () => {
  it('stamps lastSeenAt from the injected clock', () => {
    let t = 50_000
    const hub = createLocalTransportHub()
    const sync = createPresenceSync({
      transport: hub.createTransport('local'),
      getLocal: () => ({ position: [0, 0, 0] }),
      events: new EventBus<OverworldEventMap>(),
      clock: () => t,
    })
    const remote = hub.createTransport('remote')

    sync.start()
    remote.send({ t: 'presence', position: [1, 2, 3] })
    expect(sync.store.getState()['remote']?.lastSeenAt).toBe(50_000)

    t = 50_250
    remote.send({ t: 'presence', position: [1, 2, 3] })
    expect(sync.store.getState()['remote']?.lastSeenAt).toBe(50_250)
    sync.stop()
  })

  it('sweeps stale peers by the injected clock, without fake timers', () => {
    let t = 50_000
    const hub = createLocalTransportHub()
    const bus = new EventBus<OverworldEventMap>()
    const left: string[] = []
    bus.on('net:peer-left', ({ peerId }) => left.push(peerId))
    const sync = createPresenceSync({
      transport: hub.createTransport('local'),
      getLocal: () => ({ position: [0, 0, 0] }),
      events: bus,
      staleAfterMs: 3000,
      clock: () => t,
    })
    const remote = hub.createTransport('remote')

    sync.start()
    remote.send({ t: 'presence', position: [1, 2, 3] })
    expect(sync.store.getState()['remote']).toBeDefined()

    // Exactly staleAfterMs later: not yet stale (sweep drops only when older).
    t = 53_000
    sync.stop()
    sync.start() // start() ticks (and sweeps) synchronously
    expect(sync.store.getState()['remote']).toBeDefined()

    // One ms past the threshold: swept.
    t = 53_001
    sync.stop()
    sync.start()
    expect(sync.store.getState()['remote']).toBeUndefined()
    expect(left).toEqual(['remote'])
    sync.stop()
  })

  it('interpolation buffers share the injected clock timebase', () => {
    let t = 10_000
    const hub = createLocalTransportHub()
    const sync = createPresenceSync({
      transport: hub.createTransport('local'),
      getLocal: () => ({ position: [0, 0, 0] }),
      events: new EventBus<OverworldEventMap>(),
      interpolation: { delayMs: 100 },
      clock: () => t,
    })
    const remote = hub.createTransport('remote')

    sync.start()
    remote.send({ t: 'presence', position: [0, 0, 0], rotationY: 0 })
    t = 10_100
    remote.send({ t: 'presence', position: [10, 0, 0], rotationY: 0 })

    // Render time = t - delayMs = 10_050 → halfway between the snapshots.
    t = 10_150
    const sample = sync.samplePeer('remote')
    expect(sample).not.toBeNull()
    expect(sample?.position[0]).toBeCloseTo(5)
    sync.stop()
  })
})
