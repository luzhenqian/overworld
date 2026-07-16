/**
 * `WeappWebSocket`: the browser-`WebSocket` surface over WeChat's
 * `wx.connectSocket` SocketTask.
 *
 * It is **constructor-compatible with `@overworld-engine/net`'s
 * `WebSocketConstructor`** (structurally — this package does not depend on
 * net), so WeChat networking is one injection away from the existing
 * transport, inheriting its `{ from, data }` envelope, buffered sends
 * while connecting, capped reconnects and close semantics unchanged:
 *
 * ```ts
 * import { createWebSocketTransport } from '@overworld-engine/net'
 * import { WeappWebSocket } from '@overworld-engine/adapters-weapp'
 *
 * const transport = createWebSocketTransport({
 *   url: 'wss://example.com/room1',
 *   WebSocketImpl: WeappWebSocket,
 * })
 * ```
 */
import { getWx, type WxSocketTask } from './wxTypes'

/** Standard WebSocket readyState values (mirrored by this wrapper). */
export const WS_CONNECTING = 0
export const WS_OPEN = 1
export const WS_CLOSING = 2
export const WS_CLOSED = 3

/**
 * A minimal `WebSocket` implementation backed by `wx.connectSocket`.
 * Matches net's structural `WebSocketLike`/`WebSocketConstructor`
 * (readyState, `send(string)`, `close()`, `onopen`/`onmessage`/`onclose`/
 * `onerror` handler properties).
 *
 * @throws outside a WeChat environment (see `getWx`).
 */
export class WeappWebSocket {
  readyState: number = WS_CONNECTING

  onopen: (() => void) | null = null
  onmessage: ((event: { data: unknown }) => void) | null = null
  onclose: (() => void) | null = null
  onerror: ((event: unknown) => void) | null = null

  private task: WxSocketTask

  constructor(url: string, protocols?: string | string[]) {
    const wx = getWx()
    this.task = wx.connectSocket({
      url,
      protocols:
        protocols === undefined ? undefined : typeof protocols === 'string' ? [protocols] : protocols,
    })
    this.task.onOpen(() => {
      this.readyState = WS_OPEN
      this.onopen?.()
    })
    this.task.onMessage((result) => {
      this.onmessage?.({ data: result.data })
    })
    this.task.onClose(() => {
      this.readyState = WS_CLOSED
      this.onclose?.()
    })
    this.task.onError((error) => {
      this.onerror?.(error)
    })
  }

  send(data: string): void {
    this.task.send({ data })
  }

  close(code?: number, reason?: string): void {
    if (this.readyState === WS_CLOSING || this.readyState === WS_CLOSED) return
    this.readyState = WS_CLOSING
    this.task.close(code === undefined && reason === undefined ? undefined : { code, reason })
  }
}
