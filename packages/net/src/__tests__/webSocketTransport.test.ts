import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createWebSocketTransport,
  type NetMessage,
  type WebSocketConstructor,
} from '../transport'

/** Scriptable stand-in for a real WebSocket. */
class FakeWebSocket {
  static instances: FakeWebSocket[] = []

  readyState = 0 // CONNECTING
  sent: string[] = []
  onopen: (() => void) | null = null
  onmessage: ((event: { data: unknown }) => void) | null = null
  onclose: (() => void) | null = null
  onerror: ((event: unknown) => void) | null = null

  constructor(
    public url: string,
    public protocols?: string | string[]
  ) {
    FakeWebSocket.instances.push(this)
  }

  send(data: string): void {
    this.sent.push(data)
  }

  close(): void {
    this.readyState = 3
    this.onclose?.()
  }

  // -- test drivers --
  open(): void {
    this.readyState = 1
    this.onopen?.()
  }

  receive(data: string): void {
    this.onmessage?.({ data })
  }

  serverClose(): void {
    this.readyState = 3
    this.onclose?.()
  }
}

const Impl = FakeWebSocket as unknown as WebSocketConstructor

const latest = () => {
  const socket = FakeWebSocket.instances[FakeWebSocket.instances.length - 1]
  if (!socket) throw new Error('no FakeWebSocket instance')
  return socket
}

afterEach(() => {
  FakeWebSocket.instances = []
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('createWebSocketTransport', () => {
  it('throws a clear error when no implementation is available', () => {
    vi.stubGlobal('WebSocket', undefined)
    expect(() => createWebSocketTransport({ url: 'ws://x' })).toThrowError(
      /No WebSocket implementation.*WebSocketImpl/s
    )
  })

  it('buffers sends while connecting and flushes them in order on open', () => {
    const transport = createWebSocketTransport({ url: 'ws://x', peerId: 'A', WebSocketImpl: Impl })
    const socket = latest()

    transport.send({ n: 1 })
    transport.send({ n: 2 })
    expect(socket.sent).toEqual([])

    socket.open()
    expect(socket.sent).toEqual([
      JSON.stringify({ from: 'A', data: { n: 1 } }),
      JSON.stringify({ from: 'A', data: { n: 2 } }),
    ])

    transport.send({ n: 3 })
    expect(socket.sent).toHaveLength(3)
  })

  it('parses incoming envelopes, ignoring malformed JSON and own messages', () => {
    const transport = createWebSocketTransport({ url: 'ws://x', peerId: 'A', WebSocketImpl: Impl })
    const socket = latest()
    socket.open()

    const seen: NetMessage[] = []
    transport.subscribe((msg) => seen.push(msg))

    socket.receive(JSON.stringify({ from: 'B', data: { hello: true } }))
    socket.receive('not json{{{')
    socket.receive(JSON.stringify({ nope: 1 }))
    socket.receive(JSON.stringify({ from: 'A', data: 'echo' }))

    expect(seen).toEqual([{ from: 'B', data: { hello: true } }])
  })

  it('reconnects after an unexpected close, flushes buffered sends, caps retries', () => {
    vi.useFakeTimers()
    const transport = createWebSocketTransport({
      url: 'ws://x',
      peerId: 'A',
      WebSocketImpl: Impl,
      reconnect: { retries: 2, delayMs: 500 },
    })
    const first = latest()
    first.open()
    expect(FakeWebSocket.instances).toHaveLength(1)

    // Unexpected drop → sends buffer, a reconnect is scheduled.
    first.serverClose()
    transport.send({ queued: true })
    expect(FakeWebSocket.instances).toHaveLength(1)
    vi.advanceTimersByTime(500)
    expect(FakeWebSocket.instances).toHaveLength(2)

    // Second socket opens and flushes the buffer (retry counter resets).
    const second = latest()
    second.open()
    expect(second.sent).toEqual([JSON.stringify({ from: 'A', data: { queued: true } })])

    // Two consecutive failures exhaust the cap; no further attempts.
    second.serverClose()
    vi.advanceTimersByTime(500)
    expect(FakeWebSocket.instances).toHaveLength(3)
    latest().serverClose() // fails before opening
    vi.advanceTimersByTime(500)
    expect(FakeWebSocket.instances).toHaveLength(4)
    latest().serverClose()
    vi.advanceTimersByTime(5000)
    expect(FakeWebSocket.instances).toHaveLength(4)
  })

  it('close() stops reconnects and makes send a no-op', () => {
    vi.useFakeTimers()
    const transport = createWebSocketTransport({
      url: 'ws://x',
      peerId: 'A',
      WebSocketImpl: Impl,
      reconnect: { retries: 5, delayMs: 500 },
    })
    const socket = latest()
    socket.open()

    socket.serverClose() // schedules a reconnect…
    transport.close() // …which close() must cancel
    vi.advanceTimersByTime(10_000)
    expect(FakeWebSocket.instances).toHaveLength(1)

    transport.send('ignored')
    expect(socket.sent).toEqual([])
  })

  it('closing while connected does not trigger a reconnect', () => {
    vi.useFakeTimers()
    const transport = createWebSocketTransport({ url: 'ws://x', WebSocketImpl: Impl })
    latest().open()
    transport.close()
    vi.advanceTimersByTime(10_000)
    expect(FakeWebSocket.instances).toHaveLength(1)
  })
})
