/**
 * Minimal ambient typings for the `ws` package — only the surface this
 * package (and its tests) uses. Self-contained so the repo needs no
 * `@types/ws`; delete this file if `@types/ws` is ever installed.
 */
declare module 'ws' {
  import type { IncomingMessage, Server as HttpServer } from 'http'

  interface WsEventMap {
    open: []
    close: [code: number, reason: Buffer]
    error: [err: Error]
    message: [data: Buffer | ArrayBuffer | Buffer[], isBinary: boolean]
    ping: [data: Buffer]
    pong: [data: Buffer]
  }

  class WebSocket {
    static readonly CONNECTING: 0
    static readonly OPEN: 1
    static readonly CLOSING: 2
    static readonly CLOSED: 3

    constructor(address: string, protocols?: string | string[])

    readyState: number

    /** Browser-style handlers — what `createWebSocketTransport` binds to. */
    onopen: (() => void) | null
    onmessage: ((event: { data: unknown }) => void) | null
    onclose: (() => void) | null
    onerror: ((event: unknown) => void) | null

    send(data: unknown, options?: { binary?: boolean }, cb?: (err?: Error) => void): void
    ping(data?: unknown): void
    pong(data?: unknown): void
    close(code?: number, reason?: string): void
    terminate(): void

    on<K extends keyof WsEventMap>(event: K, listener: (...args: WsEventMap[K]) => void): this
    once<K extends keyof WsEventMap>(event: K, listener: (...args: WsEventMap[K]) => void): this
  }

  interface WebSocketServerOptions {
    port?: number
    host?: string
    server?: HttpServer
    maxPayload?: number
    noServer?: boolean
  }

  class WebSocketServer {
    constructor(options?: WebSocketServerOptions, callback?: () => void)

    clients: Set<WebSocket>
    address(): { port: number; family: string; address: string } | string | null

    on(event: 'connection', listener: (socket: WebSocket, request: IncomingMessage) => void): this
    on(event: 'listening' | 'close', listener: () => void): this
    on(event: 'error', listener: (err: Error) => void): this
    once(event: 'connection', listener: (socket: WebSocket, request: IncomingMessage) => void): this
    once(event: 'listening' | 'close', listener: () => void): this
    once(event: 'error', listener: (err: Error) => void): this
    close(callback?: (err?: Error) => void): void
  }

  export { WebSocket, WebSocketServer }
}
