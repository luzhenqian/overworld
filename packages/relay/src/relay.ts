/**
 * Reference WebSocket relay server for `@overworld-engine/net`'s
 * `createWebSocketTransport` — the productized version of the proven
 * `examples/ws-server` semantics.
 *
 * Wire contract (see the net package's「线路协议规范」): broadcast every
 * incoming message, **verbatim**, to all OTHER OPEN sockets in the same
 * room. The envelope (`{ from, data }`) is opaque to the server — never
 * parsed, never rewritten, never echoed back to the sender. Rooms are the
 * URL path at connect time (`ws://host:8787/lobby`; default room `/`) —
 * there are no join/leave frames.
 *
 * This is a pure relay, not an authority: no validation, no arbitration,
 * no state. Authoritative logic (movement validation, anti-cheat, trade
 * settlement) belongs in your own game server — see
 * `examples/authority-server` and the authoritative-multiplayer guide.
 */
import type { Server as HttpServer } from 'http'
import { WebSocket, WebSocketServer } from 'ws'

/** Options for {@link createRelayServer}. */
export interface RelayServerOptions {
  /**
   * Port to listen on (own HTTP server; `0` = ephemeral, read the bound
   * port from {@link RelayServer.port} after {@link RelayServer.ready}).
   * Ignored when `server` is given. @default 8787
   */
  port?: number
  /**
   * Attach to an existing `http.Server` instead of listening on `port`
   * (the relay handles that server's WebSocket upgrades; closing the relay
   * does not close your server).
   */
  server?: HttpServer
  /**
   * Base path the relay lives under. With `path: '/ws'` a connection to
   * `/ws/lobby` joins room `/lobby` and `/ws` itself joins room `/`;
   * connections outside the prefix are closed with 1008. Default: no
   * prefix — every URL path is a room.
   */
  path?: string
  /**
   * Ping interval, in ms: a socket that misses a full cycle without a pong
   * is `terminate()`d, so dead connections can't squat in a room. `0`
   * disables the heartbeat. @default 30000
   */
  heartbeatMs?: number
  /**
   * Maximum accepted message size, in bytes. Larger frames close the
   * offending socket with code 1009 ("message too big"). @default 65536
   */
  maxPayloadBytes?: number
  /** Called after a peer joined a room, with the room's new peer count. */
  onJoin?: (room: string, peerCount: number) => void
  /** Called after a peer left a room, with the room's new peer count. */
  onLeave?: (room: string, peerCount: number) => void
  /** Line logger (e.g. `console.log`). Omitted or `false` = silent. */
  logger?: ((line: string) => void) | false
}

/** Handle returned by {@link createRelayServer}. */
export interface RelayServer {
  /**
   * Resolves once the server is listening (rejects if it can't, e.g.
   * EADDRINUSE). After this, {@link port} is final. Already resolved in
   * `server` attach mode.
   */
  ready: Promise<void>
  /** The bound port (`0` before listening; the attached server's port in `server` mode). */
  readonly port: number
  /** Snapshot of the current rooms: room path -> peer count. */
  rooms(): Map<string, number>
  /**
   * Close every socket (code 1001), stop accepting connections, and
   * resolve when the server is fully closed. Idempotent. Sockets that
   * never finish their close handshake are terminated after 1.5s so this
   * always settles.
   */
  close(): Promise<void>
}

/** `unref` a Node timer without fighting DOM/Node typing differences. */
function unrefTimer(timer: unknown): void {
  ;(timer as { unref?: () => void }).unref?.()
}

/** Create a relay server. See the module doc for the wire contract. */
export function createRelayServer(options: RelayServerOptions = {}): RelayServer {
  const heartbeatMs = options.heartbeatMs ?? 30_000
  const maxPayload = options.maxPayloadBytes ?? 64 * 1024
  const log = typeof options.logger === 'function' ? options.logger : null
  // Normalize the base path to no trailing slash ('' = no prefix).
  const rawBase = options.path ?? ''
  const basePath = rawBase.endsWith('/') ? rawBase.slice(0, -1) : rawBase

  const wss = options.server
    ? new WebSocketServer({ server: options.server, maxPayload })
    : new WebSocketServer({ port: options.port ?? 8787, maxPayload })

  /** room path -> sockets in it */
  const rooms = new Map<string, Set<WebSocket>>()
  /** socket -> passed the last heartbeat cycle */
  const alive = new Map<WebSocket, boolean>()

  const roomFromUrl = (url: string | undefined): string | null => {
    let pathname: string
    try {
      pathname = new URL(url ?? '/', 'ws://relay').pathname
    } catch {
      pathname = '/'
    }
    if (basePath) {
      if (pathname !== basePath && !pathname.startsWith(`${basePath}/`)) return null
      pathname = pathname.slice(basePath.length)
    }
    return pathname === '' ? '/' : pathname
  }

  wss.on('connection', (socket, req) => {
    const room = roomFromUrl(req.url)
    if (room === null) {
      socket.close(1008, 'path outside relay base path')
      return
    }
    let peers = rooms.get(room)
    if (!peers) rooms.set(room, (peers = new Set()))
    peers.add(socket)
    alive.set(socket, true)
    log?.(`[relay] + peer connected    room=${room} peers=${peers.size}`)
    options.onJoin?.(room, peers.size)

    socket.on('pong', () => {
      alive.set(socket, true)
    })

    // The whole relay: forward verbatim to every OTHER open socket in the
    // room. The payload is never parsed — text or binary, it goes out as
    // it came in.
    socket.on('message', (data, isBinary) => {
      for (const client of peers) {
        if (client !== socket && client.readyState === WebSocket.OPEN) {
          client.send(data, { binary: isBinary })
        }
      }
    })

    socket.on('close', () => {
      alive.delete(socket)
      if (!peers.delete(socket)) return
      if (peers.size === 0) rooms.delete(room)
      log?.(`[relay] - peer disconnected room=${room} peers=${peers.size}`)
      options.onLeave?.(room, peers.size)
    })

    socket.on('error', (err) => {
      log?.(`[relay] socket error (room=${room}): ${err.message}`)
    })
  })

  wss.on('error', (err) => {
    log?.(`[relay] server error: ${err.message}`)
  })

  // Reap dead sockets: any client that missed a whole ping cycle is gone.
  const heartbeat =
    heartbeatMs > 0
      ? setInterval(() => {
          for (const socket of wss.clients) {
            if (alive.get(socket) === false) {
              socket.terminate()
              continue
            }
            alive.set(socket, false)
            socket.ping()
          }
        }, heartbeatMs)
      : null
  if (heartbeat) unrefTimer(heartbeat)

  const ready = new Promise<void>((resolve, reject) => {
    if (options.server) {
      resolve()
      return
    }
    wss.once('listening', () => {
      log?.(
        `[relay] listening on ws://localhost:${portOf()} — rooms via path, e.g. ws://localhost:${portOf()}/lobby`
      )
      resolve()
    })
    wss.once('error', reject)
  })
  // The `ready` rejection is also surfaced via the 'error' log; don't turn
  // an ignored `ready` into an unhandled rejection crash.
  ready.catch(() => {})

  const portOf = (): number => {
    const addr = options.server ? options.server.address() : wss.address()
    return addr !== null && typeof addr === 'object' ? addr.port : 0
  }

  let closing: Promise<void> | null = null

  return {
    ready,
    get port() {
      return portOf()
    },
    rooms() {
      return new Map([...rooms].map(([room, peers]) => [room, peers.size]))
    },
    close() {
      if (closing) return closing
      if (heartbeat) clearInterval(heartbeat)
      for (const socket of wss.clients) socket.close(1001, 'server shutting down')
      // Fallback for sockets that never finish their close handshake.
      const reaper = setTimeout(() => {
        for (const socket of wss.clients) socket.terminate()
      }, 1500)
      unrefTimer(reaper)
      closing = new Promise<void>((resolve, reject) => {
        wss.close((err) => {
          clearTimeout(reaper)
          if (err) reject(err)
          else {
            log?.('[relay] closed')
            resolve()
          }
        })
      })
      return closing
    },
  }
}
