/**
 * The money test: the published `@overworld-engine/net` client stack
 * (createWebSocketTransport + createPresenceSync) running a real presence
 * handshake through this relay, over real sockets.
 */
import { afterEach, describe, expect, it } from 'vitest'
import {
  createPresenceSync,
  createWebSocketTransport,
  type PresenceSync,
  type Transport,
} from '@overworld-engine/net'
import { WebSocket } from 'ws'
import { createRelayServer } from '../relay'

const cleanups: Array<() => Promise<void> | void> = []
afterEach(async () => {
  while (cleanups.length > 0) await cleanups.pop()!()
})

function waitFor(cond: () => boolean, timeoutMs = 3000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now()
    const poll = () => {
      if (cond()) return resolve()
      if (Date.now() - start > timeoutMs) return reject(new Error('waitFor timed out'))
      setTimeout(poll, 5)
    }
    poll()
  })
}

interface Client {
  transport: Transport
  sync: PresenceSync
  events: Array<[string, string]> // [event, peerId]
}

function createClient(url: string, peerId: string, position: [number, number, number]): Client {
  const transport = createWebSocketTransport({ url, peerId, WebSocketImpl: WebSocket })
  const events: Array<[string, string]> = []
  const sync = createPresenceSync({
    transport,
    getLocal: () => ({ position, meta: { name: `player-${peerId}` } }),
    intervalMs: 25,
    staleAfterMs: 2000,
    events: { emit: (event, payload) => events.push([event, payload.peerId]) },
  })
  cleanups.push(() => {
    sync.stop()
    transport.close()
  })
  sync.start()
  return { transport, sync, events }
}

describe('interop with @overworld-engine/net', () => {
  it('runs a real presence handshake between two transports through the relay', async () => {
    const relay = createRelayServer({ port: 0 })
    cleanups.push(() => relay.close())
    await relay.ready
    const url = `ws://127.0.0.1:${relay.port}/plaza`

    const alice = createClient(url, 'alice', [1, 0, 2])
    const bob = createClient(url, 'bob', [3, 0, 4])
    // Same server, different room: must stay invisible to /plaza.
    const stranger = createClient(`ws://127.0.0.1:${relay.port}/other-room`, 'stranger', [9, 9, 9])

    // Both sides see exactly the other peer (peerId announced via `from`).
    await waitFor(() => alice.sync.peers().length === 1 && bob.sync.peers().length === 1)
    const bobSeenByAlice = alice.sync.store.getState()['bob']
    expect(bobSeenByAlice).toMatchObject({
      peerId: 'bob',
      position: [3, 0, 4],
      rotationY: 0,
      meta: { name: 'player-bob' },
    })
    expect(bob.sync.store.getState()['alice']).toMatchObject({
      peerId: 'alice',
      position: [1, 0, 2],
    })
    // No self-echo: the relay never sent anyone their own presence back.
    expect(alice.sync.store.getState()['alice']).toBeUndefined()
    expect(bob.sync.store.getState()['bob']).toBeUndefined()
    // Room isolation end to end.
    expect(alice.sync.store.getState()['stranger']).toBeUndefined()
    expect(stranger.sync.peers()).toHaveLength(0)
    // Join events fired on the injected bus.
    expect(alice.events).toContainEqual(['net:peer-joined', 'bob'])
    expect(bob.events).toContainEqual(['net:peer-joined', 'alice'])

    // Graceful leave: bob's `bye` drops him from alice immediately (no
    // 2000ms stale sweep involved — the test finishes well before that).
    bob.sync.stop()
    await waitFor(() => alice.sync.peers().length === 0)
    expect(alice.events).toContainEqual(['net:peer-left', 'bob'])
  })
})
