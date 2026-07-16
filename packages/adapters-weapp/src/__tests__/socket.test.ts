import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WeappWebSocket, WS_CLOSED, WS_CLOSING, WS_CONNECTING, WS_OPEN } from '../socket'

/** Scripted SocketTask fake: records calls, lets the test fire wx callbacks. */
class FakeSocketTask {
  sent: string[] = []
  closeCalls: Array<{ code?: number; reason?: string } | undefined> = []
  private openCbs: Array<() => void> = []
  private messageCbs: Array<(result: { data: string | ArrayBuffer }) => void> = []
  private closeCbs: Array<() => void> = []
  private errorCbs: Array<(error: unknown) => void> = []

  send(options: { data: string }): void {
    this.sent.push(options.data)
  }
  close(options?: { code?: number; reason?: string }): void {
    this.closeCalls.push(options)
  }
  onOpen(cb: () => void): void {
    this.openCbs.push(cb)
  }
  onMessage(cb: (result: { data: string | ArrayBuffer }) => void): void {
    this.messageCbs.push(cb)
  }
  onClose(cb: () => void): void {
    this.closeCbs.push(cb)
  }
  onError(cb: (error: unknown) => void): void {
    this.errorCbs.push(cb)
  }

  fireOpen(): void {
    for (const cb of this.openCbs) cb()
  }
  fireMessage(data: string | ArrayBuffer): void {
    for (const cb of this.messageCbs) cb({ data })
  }
  fireClose(): void {
    for (const cb of this.closeCbs) cb()
  }
  fireError(error: unknown): void {
    for (const cb of this.errorCbs) cb(error)
  }
}

// Compile-time parity with net's structural WebSocketLike/WebSocketConstructor
// (redeclared locally — adapters-weapp deliberately does not depend on net).
interface NetWebSocketLike {
  readyState: number
  send(data: string): void
  close(code?: number, reason?: string): void
  onopen: (() => void) | null
  onmessage: ((event: { data: unknown }) => void) | null
  onclose: (() => void) | null
  onerror: ((event: unknown) => void) | null
}
type NetWebSocketConstructor = new (url: string, protocols?: string | string[]) => NetWebSocketLike
const ctorParityCheck: NetWebSocketConstructor = WeappWebSocket
void ctorParityCheck

let tasks: FakeSocketTask[]
let connectCalls: Array<{ url: string; protocols?: string[] }>

beforeEach(() => {
  tasks = []
  connectCalls = []
  vi.stubGlobal('wx', {
    connectSocket: (options: { url: string; protocols?: string[] }) => {
      connectCalls.push(options)
      const task = new FakeSocketTask()
      tasks.push(task)
      return task
    },
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('WeappWebSocket', () => {
  it('throws a helpful error outside a weapp environment', () => {
    vi.unstubAllGlobals()
    expect(() => new WeappWebSocket('wss://x')).toThrowError(/wx.*not available/i)
  })

  it('connects on construction and completes the open handshake', () => {
    const ws = new WeappWebSocket('wss://example.com/room1')
    expect(connectCalls).toEqual([{ url: 'wss://example.com/room1', protocols: undefined }])
    expect(ws.readyState).toBe(WS_CONNECTING)

    const opened = vi.fn()
    ws.onopen = opened
    tasks[0]!.fireOpen()
    expect(ws.readyState).toBe(WS_OPEN)
    expect(opened).toHaveBeenCalledOnce()
  })

  it('normalizes protocols to the wx string[] shape', () => {
    void new WeappWebSocket('wss://a', 'proto-1')
    void new WeappWebSocket('wss://b', ['p1', 'p2'])
    expect(connectCalls[0]!.protocols).toEqual(['proto-1'])
    expect(connectCalls[1]!.protocols).toEqual(['p1', 'p2'])
  })

  it('sends strings through the task and delivers incoming messages', () => {
    const ws = new WeappWebSocket('wss://x')
    const task = tasks[0]!
    task.fireOpen()

    // The exact JSON envelope net's transport produces goes through verbatim.
    const envelope = JSON.stringify({ from: 'peer-1', data: { hello: true } })
    ws.send(envelope)
    expect(task.sent).toEqual([envelope])

    const received: unknown[] = []
    ws.onmessage = (event) => received.push(event.data)
    task.fireMessage('{"from":"peer-2","data":1}')
    expect(received).toEqual(['{"from":"peer-2","data":1}'])
  })

  it('close() goes CLOSING → task.close, server close completes to CLOSED', () => {
    const ws = new WeappWebSocket('wss://x')
    const task = tasks[0]!
    task.fireOpen()

    const closed = vi.fn()
    ws.onclose = closed
    ws.close(1000, 'bye')
    expect(ws.readyState).toBe(WS_CLOSING)
    expect(task.closeCalls).toEqual([{ code: 1000, reason: 'bye' }])

    // Repeated close() is a no-op (browser WebSocket semantics).
    ws.close()
    expect(task.closeCalls).toHaveLength(1)

    task.fireClose()
    expect(ws.readyState).toBe(WS_CLOSED)
    expect(closed).toHaveBeenCalledOnce()
  })

  it('close() without arguments passes no options to the task', () => {
    const ws = new WeappWebSocket('wss://x')
    ws.close()
    expect(tasks[0]!.closeCalls).toEqual([undefined])
  })

  it('reaches CLOSED on an unexpected (server-side) close — the reconnect trigger', () => {
    const ws = new WeappWebSocket('wss://x')
    const task = tasks[0]!
    task.fireOpen()

    const closed = vi.fn()
    ws.onclose = closed
    task.fireClose() // Server dropped us; net's transport reconnects off onclose.
    expect(ws.readyState).toBe(WS_CLOSED)
    expect(closed).toHaveBeenCalledOnce()
  })

  it('forwards errors to onerror', () => {
    const ws = new WeappWebSocket('wss://x')
    const errors: unknown[] = []
    ws.onerror = (error) => errors.push(error)
    tasks[0]!.fireError({ errMsg: 'boom' })
    expect(errors).toEqual([{ errMsg: 'boom' }])
  })
})
