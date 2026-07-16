import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createBroadcastChannelTransport,
  createLocalTransportHub,
  isBroadcastChannelAvailable,
  type NetMessage,
} from '../transport'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('createLocalTransportHub', () => {
  it('delivers a send to all other peers, never the sender', () => {
    const hub = createLocalTransportHub()
    const a = hub.createTransport('A')
    const b = hub.createTransport('B')
    const c = hub.createTransport('C')

    const seenA: NetMessage[] = []
    const seenB: NetMessage[] = []
    const seenC: NetMessage[] = []
    a.subscribe((msg) => seenA.push(msg))
    b.subscribe((msg) => seenB.push(msg))
    c.subscribe((msg) => seenC.push(msg))

    a.send({ hello: 1 })

    expect(seenA).toEqual([])
    expect(seenB).toEqual([{ from: 'A', data: { hello: 1 } }])
    expect(seenC).toEqual([{ from: 'A', data: { hello: 1 } }])
  })

  it('delivers synchronously', () => {
    const hub = createLocalTransportHub()
    const a = hub.createTransport('A')
    const b = hub.createTransport('B')
    let received = false
    b.subscribe(() => {
      received = true
    })
    a.send('ping')
    expect(received).toBe(true)
  })

  it('unsubscribe stops delivery', () => {
    const hub = createLocalTransportHub()
    const a = hub.createTransport('A')
    const b = hub.createTransport('B')
    const seen: NetMessage[] = []
    const unsubscribe = b.subscribe((msg) => seen.push(msg))
    a.send(1)
    unsubscribe()
    a.send(2)
    expect(seen).toHaveLength(1)
  })

  it('close() detaches the peer: no more receives, send becomes a no-op', () => {
    const hub = createLocalTransportHub()
    const a = hub.createTransport('A')
    const b = hub.createTransport('B')
    const seenA: NetMessage[] = []
    const seenB: NetMessage[] = []
    a.subscribe((msg) => seenA.push(msg))
    b.subscribe((msg) => seenB.push(msg))

    b.close()
    a.send('after-close')
    expect(seenB).toEqual([])

    b.send('from-closed')
    expect(seenA).toEqual([])
  })

  it('generates unique peer ids when omitted', () => {
    const hub = createLocalTransportHub()
    const a = hub.createTransport()
    const b = hub.createTransport()
    expect(a.peerId).toBeTruthy()
    expect(b.peerId).toBeTruthy()
    expect(a.peerId).not.toBe(b.peerId)
  })
})

describe('createBroadcastChannelTransport', () => {
  it('isBroadcastChannelAvailable() is false without the global', () => {
    vi.stubGlobal('BroadcastChannel', undefined)
    expect(isBroadcastChannelAvailable()).toBe(false)
  })

  it('constructor throws a clear error without the global', () => {
    vi.stubGlobal('BroadcastChannel', undefined)
    expect(() => createBroadcastChannelTransport({ channelName: 'room' })).toThrowError(
      /BroadcastChannel is not available.*createWebSocketTransport/s
    )
  })

  it.runIf(typeof BroadcastChannel === 'function')(
    'connects two transports on the same channel (native BroadcastChannel)',
    async () => {
      const a = createBroadcastChannelTransport({ channelName: 'net-test', peerId: 'A' })
      const b = createBroadcastChannelTransport({ channelName: 'net-test', peerId: 'B' })
      try {
        const received = new Promise<NetMessage>((resolve) => b.subscribe(resolve))
        a.send({ x: 42 })
        await expect(received).resolves.toEqual({ from: 'A', data: { x: 42 } })
      } finally {
        a.close()
        b.close()
      }
    }
  )
})
