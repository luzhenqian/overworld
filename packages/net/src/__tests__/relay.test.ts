import { EventBus, type OverworldEventMap } from '@overworld/core'
import { describe, expect, it } from 'vitest'
import { relayEvents } from '../relay'
import { createLocalTransportHub } from '../transport'

function setup(peerIds: string[], events: string[]) {
  const hub = createLocalTransportHub()
  return peerIds.map((peerId) => {
    const bus = new EventBus<OverworldEventMap>()
    const transport = hub.createTransport(peerId)
    const unbind = relayEvents(bus, transport, { events })
    return { bus, transport, unbind }
  })
}

describe('relayEvents', () => {
  it('re-emits a listed event on every other peer with the payload intact', () => {
    const [a, b, c] = setup(['A', 'B', 'C'], ['quest:started'])
    if (!a || !b || !c) throw new Error('setup failed')

    const seenB: string[] = []
    const seenC: string[] = []
    b.bus.on('quest:started', ({ questId }) => seenB.push(questId))
    c.bus.on('quest:started', ({ questId }) => seenC.push(questId))

    a.bus.emit('quest:started', { questId: 'q1' })

    expect(seenB).toEqual(['q1'])
    expect(seenC).toEqual(['q1'])
  })

  it('does not echo-amplify: one emit is seen exactly once per peer', () => {
    const [a, b, c] = setup(['A', 'B', 'C'], ['item:used'])
    if (!a || !b || !c) throw new Error('setup failed')

    let countA = 0
    let countB = 0
    let countC = 0
    a.bus.on('item:used', () => (countA += 1))
    b.bus.on('item:used', () => (countB += 1))
    c.bus.on('item:used', () => (countC += 1))

    a.bus.emit('item:used', { itemId: 'potion' })

    // A sees only its own original emit; B/C see exactly one re-emit — the
    // re-entrancy flag keeps re-emits off the wire.
    expect(countA).toBe(1)
    expect(countB).toBe(1)
    expect(countC).toBe(1)
  })

  it('only forwards listed events', () => {
    const [a, b] = setup(['A', 'B'], ['quest:started'])
    if (!a || !b) throw new Error('setup failed')

    let count = 0
    b.bus.on('quest:completed', () => (count += 1))
    a.bus.emit('quest:completed', { questId: 'q1' })
    expect(count).toBe(0)
  })

  it('ignores non-event envelopes and unlisted incoming events', () => {
    const hub = createLocalTransportHub()
    const bus = new EventBus<OverworldEventMap>()
    relayEvents(bus, hub.createTransport('A'), { events: ['quest:started'] })

    let count = 0
    bus.on('quest:started', () => (count += 1))

    const other = hub.createTransport('B')
    other.send({ t: 'presence', position: [0, 0, 0] })
    other.send({ t: 'event', event: 'quest:completed', payload: { questId: 'x' } })
    other.send('junk')
    expect(count).toBe(0)

    other.send({ t: 'event', event: 'quest:started', payload: { questId: 'q9' } })
    expect(count).toBe(1)
  })

  it('unbind stops both forwarding and re-emitting', () => {
    const [a, b] = setup(['A', 'B'], ['quest:started'])
    if (!a || !b) throw new Error('setup failed')

    let countB = 0
    b.bus.on('quest:started', () => (countB += 1))

    a.bus.emit('quest:started', { questId: 'q1' })
    expect(countB).toBe(1)

    a.unbind()
    a.bus.emit('quest:started', { questId: 'q2' })
    expect(countB).toBe(1)

    // B unbinds its receive side too.
    b.unbind()
    a.transport.send({ t: 'event', event: 'quest:started', payload: { questId: 'q3' } })
    expect(countB).toBe(1)
  })
})
