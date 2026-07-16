/**
 * Real-socket tests: every test starts an actual relay on an ephemeral
 * port and talks to it with real `ws` clients.
 */
import { createServer, type Server as HttpServer } from 'http'
import { afterEach, describe, expect, it } from 'vitest'
import { WebSocket } from 'ws'
import { createRelayServer, type RelayServer } from '../relay'

const cleanups: Array<() => Promise<void> | void> = []
afterEach(async () => {
  while (cleanups.length > 0) await cleanups.pop()!()
})

function track(relay: RelayServer): RelayServer {
  cleanups.push(() => relay.close())
  return relay
}

function connect(port: number, path = '/'): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}${path}`)
    socket.once('open', () => resolve(socket))
    socket.once('error', reject)
    cleanups.push(() => {
      if (socket.readyState !== WebSocket.CLOSED) socket.terminate()
    })
  })
}

/** Collect incoming messages on a socket as `{ text, isBinary }`. */
function collect(socket: WebSocket): Array<{ text: string; isBinary: boolean }> {
  const received: Array<{ text: string; isBinary: boolean }> = []
  socket.on('message', (data, isBinary) => {
    received.push({ text: String(data), isBinary })
  })
  return received
}

function waitFor(cond: () => boolean, timeoutMs = 2000): Promise<void> {
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

function closedCode(socket: WebSocket): Promise<number> {
  return new Promise((resolve) => socket.once('close', (code) => resolve(code)))
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe('createRelayServer', () => {
  it('relays verbatim to same-room peers only, never echoing to the sender', async () => {
    const relay = track(createRelayServer({ port: 0 }))
    await relay.ready
    expect(relay.port).toBeGreaterThan(0)

    const a1 = await connect(relay.port, '/room-a')
    const a2 = await connect(relay.port, '/room-a')
    const b1 = await connect(relay.port, '/room-b')
    const [fromA1, fromA2, fromB1] = [collect(a1), collect(a2), collect(b1)]

    // Deliberately NOT valid JSON — proves the relay never parses payloads.
    a1.send('hello {not-json')
    await waitFor(() => fromA2.length === 1)
    expect(fromA2[0]).toEqual({ text: 'hello {not-json', isBinary: false })

    // Binary frames are forwarded verbatim too.
    a2.send(Buffer.from([1, 2, 3]), { binary: true })
    await waitFor(() => fromA1.length === 1)
    expect(fromA1[0]!.isBinary).toBe(true)
    expect(Buffer.from(fromA1[0]!.text)).toEqual(Buffer.from([1, 2, 3]))

    // Grace period: no self-echo, no cross-room leakage.
    await sleep(50)
    expect(fromA1).toHaveLength(1) // only a2's binary frame, not its own send
    expect(fromA2).toHaveLength(1)
    expect(fromB1).toHaveLength(0)
  })

  it('tracks rooms and fires onJoin/onLeave with peer counts', async () => {
    const joins: Array<[string, number]> = []
    const leaves: Array<[string, number]> = []
    const relay = track(
      createRelayServer({
        port: 0,
        onJoin: (room, n) => joins.push([room, n]),
        onLeave: (room, n) => leaves.push([room, n]),
      })
    )
    await relay.ready

    await connect(relay.port, '/lobby')
    const second = await connect(relay.port, '/lobby')
    await connect(relay.port) // default room '/'

    expect(relay.rooms()).toEqual(
      new Map([
        ['/lobby', 2],
        ['/', 1],
      ])
    )
    expect(joins).toEqual([
      ['/lobby', 1],
      ['/lobby', 2],
      ['/', 1],
    ])

    second.close()
    await waitFor(() => leaves.length === 1)
    expect(leaves).toEqual([['/lobby', 1]])
    expect(relay.rooms().get('/lobby')).toBe(1)
  })

  it('reaps sockets that stop answering heartbeat pings', async () => {
    const relay = track(createRelayServer({ port: 0, heartbeatMs: 25 }))
    await relay.ready

    const zombie = await connect(relay.port, '/room')
    const healthy = await connect(relay.port, '/room')
    // ws clients auto-pong on ping; suppressing the instance method fakes a
    // dead connection while the TCP socket stays open.
    zombie.pong = () => {}

    const code = await closedCode(zombie) // terminated by the reaper
    expect(code).toBe(1006) // terminate() = abnormal closure, no close frame
    await waitFor(() => relay.rooms().get('/room') === 1)
    expect(healthy.readyState).toBe(WebSocket.OPEN)
  })

  it('closes sockets exceeding maxPayloadBytes with 1009', async () => {
    const relay = track(createRelayServer({ port: 0, maxPayloadBytes: 256 }))
    await relay.ready

    const offender = await connect(relay.port, '/room')
    const bystander = await connect(relay.port, '/room')
    const seen = collect(bystander)

    offender.send('x'.repeat(1024))
    expect(await closedCode(offender)).toBe(1009)

    await sleep(50)
    expect(seen).toHaveLength(0) // the oversized frame was not relayed
    expect(bystander.readyState).toBe(WebSocket.OPEN)
  })

  it('close() resolves, closes clients with 1001, and refuses further connects', async () => {
    const relay = createRelayServer({ port: 0 })
    await relay.ready
    const port = relay.port
    const client = await connect(port, '/room')
    const code = closedCode(client)

    await relay.close()
    expect(await code).toBe(1001)
    await expect(connect(port, '/room')).rejects.toThrow()
    await relay.close() // idempotent
  })

  it('attaches to an existing http server under a base path', async () => {
    const httpServer: HttpServer = createServer()
    await new Promise<void>((resolve) => httpServer.listen(0, resolve))
    cleanups.push(() => new Promise<void>((resolve) => void httpServer.close(() => resolve())))
    const addr = httpServer.address()
    const port = typeof addr === 'object' && addr !== null ? addr.port : 0

    const relay = track(createRelayServer({ server: httpServer, path: '/ws' }))
    await relay.ready
    expect(relay.port).toBe(port)

    const a = await connect(port, '/ws/lobby')
    const b = await connect(port, '/ws/lobby')
    const seen = collect(b)
    a.send('hi')
    await waitFor(() => seen.length === 1)
    expect(seen[0]!.text).toBe('hi')
    expect(relay.rooms()).toEqual(new Map([['/lobby', 2]]))

    // Outside the base path: accepted upgrade, immediately closed with 1008.
    const outsider = await connect(port, '/elsewhere')
    expect(await closedCode(outsider)).toBe(1008)
  })
})
