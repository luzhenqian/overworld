/**
 * Transport abstraction: the single seam between Overworld's sync layers
 * (presence, event relay) and the actual wire. A transport is a broadcast
 * primitive — `send` delivers to every *other* peer, never back to the
 * sender. Reference implementations: in-memory hub (tests/local demos),
 * BroadcastChannel (same-browser tabs), WebSocket (real networking).
 */

/** A message received from another peer on a transport. */
export interface NetMessage {
  /** Peer id of the sender. */
  from: string
  /** The payload as sent. Must be JSON-serializable on real transports. */
  data: unknown
}

/**
 * Minimal broadcast transport. Implementations must never deliver a peer's
 * own messages back to it.
 */
export interface Transport {
  /** Stable id of the local peer on this transport. */
  readonly peerId: string
  /** Broadcast `data` to all other peers. */
  send(data: unknown): void
  /** Subscribe to incoming messages. Returns an unsubscribe function. */
  subscribe(cb: (msg: NetMessage) => void): () => void
  /** Tear down the transport. Further `send` calls become no-ops. */
  close(): void
}

let peerCounter = 0

/**
 * Generate a reasonably unique peer id: `crypto.randomUUID()` when
 * available, otherwise a counter + timestamp fallback.
 */
function generatePeerId(): string {
  const cryptoObj = globalThis.crypto
  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') {
    return cryptoObj.randomUUID()
  }
  peerCounter += 1
  return `peer-${Date.now().toString(36)}-${peerCounter}`
}

/** Runtime guard for the `{ from, data }` wire envelope. */
function isNetMessage(value: unknown): value is NetMessage {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { from?: unknown }).from === 'string' &&
    'data' in value
  )
}

// ---------------------------------------------------------------------------
// Local in-memory hub
// ---------------------------------------------------------------------------

/** A hub connecting in-memory transports. See {@link createLocalTransportHub}. */
export interface LocalTransportHub {
  /**
   * Create a new transport attached to this hub. `peerId` defaults to a
   * generated unique id.
   */
  createTransport(peerId?: string): Transport
}

interface HubPeer {
  peerId: string
  subscribers: Set<(msg: NetMessage) => void>
}

/**
 * In-memory transport hub for tests and single-process demos. Every
 * transport's `send()` is delivered **synchronously** to all *other*
 * transports on the hub (synchronous on purpose, so tests are deterministic
 * — no flushing needed). `close()` detaches a transport from the hub.
 */
export function createLocalTransportHub(): LocalTransportHub {
  const peers = new Set<HubPeer>()

  return {
    createTransport(peerId?: string): Transport {
      const me: HubPeer = { peerId: peerId ?? generatePeerId(), subscribers: new Set() }
      peers.add(me)
      let closed = false

      return {
        peerId: me.peerId,
        send(data) {
          if (closed) return
          const msg: NetMessage = { from: me.peerId, data }
          for (const peer of [...peers]) {
            if (peer === me) continue
            for (const cb of [...peer.subscribers]) cb(msg)
          }
        },
        subscribe(cb) {
          me.subscribers.add(cb)
          return () => me.subscribers.delete(cb)
        },
        close() {
          closed = true
          peers.delete(me)
        },
      }
    },
  }
}

// ---------------------------------------------------------------------------
// BroadcastChannel transport
// ---------------------------------------------------------------------------

/** Whether the current environment provides `BroadcastChannel`. */
export function isBroadcastChannelAvailable(): boolean {
  return typeof BroadcastChannel === 'function'
}

/** Config for {@link createBroadcastChannelTransport}. */
export interface BroadcastChannelTransportConfig {
  /** Channel name — all peers on the same name see each other. */
  channelName: string
  /** Local peer id. Defaults to a generated unique id. */
  peerId?: string
}

/**
 * Transport over the `BroadcastChannel` API: connects tabs/workers of the
 * same origin (browsers; also Node >= 18). Great for split-screen demos in
 * two tabs without any server.
 *
 * @throws when `BroadcastChannel` is unavailable — check
 * {@link isBroadcastChannelAvailable} first, or use
 * {@link createWebSocketTransport} / {@link createLocalTransportHub}.
 */
export function createBroadcastChannelTransport(
  config: BroadcastChannelTransportConfig
): Transport {
  if (!isBroadcastChannelAvailable()) {
    throw new Error(
      '[overworld/net] BroadcastChannel is not available in this environment. ' +
        'Use createWebSocketTransport() for real networking or ' +
        'createLocalTransportHub() for tests and local demos.'
    )
  }
  const peerId = config.peerId ?? generatePeerId()
  const channel = new BroadcastChannel(config.channelName)
  const subscribers = new Set<(msg: NetMessage) => void>()
  let closed = false

  channel.onmessage = (event: MessageEvent) => {
    const msg: unknown = event.data
    // Own messages are not echoed by the API, but stay defensive.
    if (!isNetMessage(msg) || msg.from === peerId) return
    for (const cb of [...subscribers]) cb(msg)
  }

  return {
    peerId,
    send(data) {
      if (closed) return
      channel.postMessage({ from: peerId, data } satisfies NetMessage)
    },
    subscribe(cb) {
      subscribers.add(cb)
      return () => subscribers.delete(cb)
    },
    close() {
      if (closed) return
      closed = true
      subscribers.clear()
      channel.close()
    },
  }
}

// ---------------------------------------------------------------------------
// WebSocket transport
// ---------------------------------------------------------------------------

/**
 * Structural subset of the standard `WebSocket` this transport needs —
 * inject anything matching it (Node `ws`, `undici`, a test fake).
 */
export interface WebSocketLike {
  readyState: number
  send(data: string): void
  close(code?: number, reason?: string): void
  onopen: (() => void) | null
  onmessage: ((event: { data: unknown }) => void) | null
  onclose: (() => void) | null
  onerror: ((event: unknown) => void) | null
}

/** Constructor shape for injected WebSocket implementations. */
export type WebSocketConstructor = new (
  url: string,
  protocols?: string | string[]
) => WebSocketLike

/** Config for {@link createWebSocketTransport}. */
export interface WebSocketTransportConfig {
  /** WebSocket server URL (e.g. `wss://example.com/room1`). */
  url: string
  /** Local peer id. Defaults to a generated unique id. */
  peerId?: string
  /** Subprotocols passed to the WebSocket constructor. */
  protocols?: string | string[]
  /** Reconnect policy after an unexpected close. */
  reconnect?: {
    /** Max consecutive reconnect attempts (reset on a successful open). @default 3 */
    retries?: number
    /** Delay before each reconnect attempt, in ms. @default 1000 */
    delayMs?: number
  }
  /**
   * WebSocket implementation for non-browser environments and tests.
   * Defaults to the global `WebSocket`.
   */
  WebSocketImpl?: WebSocketConstructor
}

const WS_OPEN = 1

/**
 * Transport over a plain WebSocket. Each `send` transmits one JSON envelope
 * `{ from, data }`; the server's only job is to broadcast every message,
 * verbatim, to all *other* connected clients (see the README for a
 * ~15-line Node `ws` server).
 *
 * - Sends made while the socket is still connecting (or between reconnect
 *   attempts) are buffered and flushed on open, in order.
 * - Unexpected closes trigger capped reconnects (`reconnect.retries`
 *   consecutive attempts, reset on success). `close()` stops everything.
 *
 * @throws when no WebSocket implementation is available (pass
 * `WebSocketImpl` in Node < 22 or tests).
 */
export function createWebSocketTransport(config: WebSocketTransportConfig): Transport {
  const peerId = config.peerId ?? generatePeerId()
  const maxRetries = config.reconnect?.retries ?? 3
  const delayMs = config.reconnect?.delayMs ?? 1000
  const Impl =
    config.WebSocketImpl ??
    (typeof WebSocket === 'function'
      ? // The DOM constructor is runtime-compatible with WebSocketLike; its
        // handler signatures are just declared wider (MessageEvent, etc.).
        (WebSocket as unknown as WebSocketConstructor)
      : undefined)
  if (!Impl) {
    throw new Error(
      '[overworld/net] No WebSocket implementation available in this environment. ' +
        'Pass `WebSocketImpl` (e.g. from the "ws" package) in createWebSocketTransport().'
    )
  }

  const subscribers = new Set<(msg: NetMessage) => void>()
  const buffer: string[] = []
  let socket: WebSocketLike
  let closed = false
  let attempts = 0
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null

  const connect = () => {
    socket = new Impl(config.url, config.protocols)
    socket.onopen = () => {
      attempts = 0
      for (const raw of buffer.splice(0, buffer.length)) socket.send(raw)
    }
    socket.onmessage = (event) => {
      if (typeof event.data !== 'string') return
      let parsed: unknown
      try {
        parsed = JSON.parse(event.data)
      } catch {
        return
      }
      if (!isNetMessage(parsed) || parsed.from === peerId) return
      for (const cb of [...subscribers]) cb(parsed)
    }
    socket.onclose = () => {
      if (closed || attempts >= maxRetries) return
      attempts += 1
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null
        connect()
      }, delayMs)
    }
    socket.onerror = () => {
      // The close event (and thus reconnect handling) follows errors.
    }
  }
  connect()

  return {
    peerId,
    send(data) {
      if (closed) return
      const raw = JSON.stringify({ from: peerId, data } satisfies NetMessage)
      if (socket.readyState === WS_OPEN) socket.send(raw)
      else buffer.push(raw)
    },
    subscribe(cb) {
      subscribers.add(cb)
      return () => subscribers.delete(cb)
    },
    close() {
      if (closed) return
      closed = true
      if (reconnectTimer !== null) {
        clearTimeout(reconnectTimer)
        reconnectTimer = null
      }
      subscribers.clear()
      socket.close()
    },
  }
}
