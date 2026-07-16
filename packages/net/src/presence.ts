/**
 * Presence replication: broadcast the local player's transform on a
 * heartbeat, mirror every remote peer into a zustand vanilla store, expire
 * peers that go silent. Headless — render the store with `<RemotePlayers>`
 * or your own component.
 */
import { gameEvents } from '@overworld-engine/core'
import { createStore, type StoreApi } from 'zustand/vanilla'
import { createSnapshotBuffer, type SnapshotBuffer } from './snapshotBuffer'
import type { NetMessage, Transport } from './transport'

/**
 * Framework event map extension — dogfoods `@overworld-engine/core`'s declaration
 * merging so `net:*` events are fully typed on any bus.
 */
declare module '@overworld-engine/core' {
  interface OverworldEventMap {
    'net:peer-joined': { peerId: string }
    'net:peer-left': { peerId: string }
  }
}

/** A remote peer as replicated into the presence store. */
export interface RemotePeer {
  /** The peer's transport id. */
  peerId: string
  /** Last received world position. */
  position: [number, number, number]
  /** Last received Y rotation (radians); 0 when the peer never sent one. */
  rotationY: number
  /** Free-form metadata (display name, avatar id…), if the peer sent any. */
  meta?: Record<string, unknown>
  /** Local timestamp (ms) of the last message from this peer. */
  lastSeenAt: number
}

/** Snapshot of the local player, returned by `getLocal`. */
export interface PresenceLocal {
  position: [number, number, number]
  rotationY?: number
  /** Must be JSON-serializable. */
  meta?: Record<string, unknown>
}

/**
 * Structural event sink for join/leave notifications. `EventBus` from
 * `@overworld-engine/core` (including the default `gameEvents`) satisfies it.
 */
export interface PresenceEventSink {
  emit(event: 'net:peer-joined' | 'net:peer-left', payload: { peerId: string }): void
}

/** Config for {@link createPresenceSync}. */
export interface PresenceSyncConfig {
  /** Transport to replicate over. */
  transport: Transport
  /**
   * Read the local player's transform. With `@overworld-engine/scene`:
   * `() => ({ position: getPlayerPosition(), rotationY: playerRotationRef.current })`.
   */
  getLocal: () => PresenceLocal
  /** Heartbeat / stale-sweep interval, in ms. @default 100 */
  intervalMs?: number
  /** Drop a peer after this long without a message, in ms. @default 3000 */
  staleAfterMs?: number
  /** Bus receiving `net:peer-joined` / `net:peer-left`. @default gameEvents */
  events?: PresenceEventSink
  /**
   * Snapshot-interpolation for remote transforms. When enabled, every
   * received presence packet is also pushed into a per-peer delay buffer
   * and `samplePeer()` returns the transform interpolated `delayMs` in the
   * past — smooth under real network jitter, at the cost of that fixed
   * latency. `delayMs` defaults to 120; ~1.5–2× the sender's `intervalMs`
   * is a good value. Disabled by default (`samplePeer` returns `null` and
   * `<RemotePlayers>` keeps its plain exponential smoothing).
   * @default false
   */
  interpolation?: { delayMs?: number } | false
  /**
   * Injectable clock returning epoch milliseconds. Used as the single
   * timebase for `lastSeenAt` timestamps, the stale sweep, and the
   * interpolation buffers — inject a deterministic clock for replay-exact
   * tests without fake timers. @default Date.now
   */
  clock?: () => number
}

/** An interpolated remote transform, returned by `PresenceSync.samplePeer`. */
export interface PeerSample {
  position: [number, number, number]
  rotationY: number
}

/** Handle returned by {@link createPresenceSync}. */
export interface PresenceSync {
  /** Vanilla zustand store: `Record<peerId, RemotePeer>`. */
  store: StoreApi<Record<string, RemotePeer>>
  /** Begin heartbeating and listening. Idempotent. */
  start(): void
  /** Stop, unsubscribe, and broadcast a `bye` so peers drop us immediately. */
  stop(): void
  /** Snapshot of the currently known remote peers. */
  peers(): RemotePeer[]
  /** Whether snapshot interpolation was enabled in the config. */
  readonly interpolationEnabled: boolean
  /**
   * Sample `peerId`'s transform at the interpolation delay (linear position
   * lerp, shortest-arc rotation lerp). `null` when interpolation is
   * disabled, the peer is unknown, or its buffer can't produce a sample
   * yet. See {@link SnapshotBuffer.sample} for the edge-case semantics.
   */
  samplePeer(peerId: string): PeerSample | null
}

interface PresenceEnvelope {
  t: 'presence'
  position: [number, number, number]
  rotationY?: number
  meta?: Record<string, unknown>
}

interface ByeEnvelope {
  t: 'bye'
}

function isPresenceEnvelope(value: unknown): value is PresenceEnvelope | ByeEnvelope {
  if (typeof value !== 'object' || value === null) return false
  const t = (value as { t?: unknown }).t
  if (t === 'bye') return true
  if (t !== 'presence') return false
  const position = (value as { position?: unknown }).position
  return (
    Array.isArray(position) &&
    position.length === 3 &&
    position.every((n) => typeof n === 'number')
  )
}

/** How many heartbeats may pass without a send before a keepalive goes out. */
const KEEPALIVE_EVERY = 5

/**
 * Create a presence replicator on `transport`.
 *
 * Mechanics:
 * - Every `intervalMs` the local transform is read; it is broadcast when it
 *   changed since the last send, **or** on every {@link KEEPALIVE_EVERY}th
 *   beat as a keepalive (so idle players don't go stale — with the defaults
 *   that's one packet per 500 ms while standing still).
 * - The first message from an unknown peer upserts it and emits
 *   `net:peer-joined`; every message refreshes `lastSeenAt`.
 * - Peers silent for `staleAfterMs` are swept out (emitting `net:peer-left`).
 * - `stop()` broadcasts a `bye` envelope so remote stores drop this peer
 *   immediately instead of waiting for the stale sweep. The local store
 *   keeps its last-known peers after `stop()`.
 *
 * Envelopes are namespaced with `t: 'presence' | 'bye'`, so presence can
 * share one transport with the event relay (`t: 'event'`).
 */
export function createPresenceSync(config: PresenceSyncConfig): PresenceSync {
  const { transport, getLocal } = config
  const intervalMs = config.intervalMs ?? 100
  const staleAfterMs = config.staleAfterMs ?? 3000
  const events: PresenceEventSink = config.events ?? gameEvents
  const clock = config.clock ?? (() => Date.now())
  const interpolation = config.interpolation ?? false
  const interpolationEnabled = interpolation !== false
  const interpolationDelayMs = interpolationEnabled ? (interpolation.delayMs ?? 120) : 120

  const store = createStore<Record<string, RemotePeer>>()(() => ({}))
  /** Per-peer delay buffers; only allocated when interpolation is enabled. */
  const buffers = interpolationEnabled ? new Map<string, SnapshotBuffer<PeerSample>>() : null

  const lerpSample = (a: PeerSample, b: PeerSample, t: number): PeerSample => {
    const dy = b.rotationY - a.rotationY
    return {
      position: [
        a.position[0] + (b.position[0] - a.position[0]) * t,
        a.position[1] + (b.position[1] - a.position[1]) * t,
        a.position[2] + (b.position[2] - a.position[2]) * t,
      ],
      // Shortest-arc angle lerp, so -π/π wraps don't spin the long way.
      rotationY: a.rotationY + Math.atan2(Math.sin(dy), Math.cos(dy)) * t,
    }
  }

  let timer: ReturnType<typeof setInterval> | null = null
  let unsubscribe: (() => void) | null = null
  let beat = 0
  let lastSentJson: string | null = null

  const removePeer = (peerId: string) => {
    buffers?.delete(peerId)
    const state = store.getState()
    if (!(peerId in state)) return
    const next = { ...state }
    delete next[peerId]
    store.setState(next, true)
    events.emit('net:peer-left', { peerId })
  }

  const handleMessage = (msg: NetMessage) => {
    if (msg.from === transport.peerId) return
    const data = msg.data
    if (!isPresenceEnvelope(data)) return
    if (data.t === 'bye') {
      removePeer(msg.from)
      return
    }
    const existing = store.getState()[msg.from]
    const peer: RemotePeer = {
      peerId: msg.from,
      position: [data.position[0], data.position[1], data.position[2]],
      rotationY: data.rotationY ?? 0,
      lastSeenAt: clock(),
      ...(data.meta !== undefined && { meta: data.meta }),
    }
    store.setState({ [msg.from]: peer })
    if (buffers) {
      let buffer = buffers.get(msg.from)
      if (!buffer) {
        // The presence clock (not performance.now) so timestamps share the
        // timebase of lastSeenAt and behave under injected/fake clocks.
        buffer = createSnapshotBuffer<PeerSample>({
          delayMs: interpolationDelayMs,
          now: clock,
        })
        buffers.set(msg.from, buffer)
      }
      buffer.push({ position: peer.position, rotationY: peer.rotationY })
    }
    if (!existing) events.emit('net:peer-joined', { peerId: msg.from })
  }

  const sweep = (now: number) => {
    const state = store.getState()
    for (const [peerId, peer] of Object.entries(state)) {
      if (now - peer.lastSeenAt > staleAfterMs) removePeer(peerId)
    }
  }

  const tick = () => {
    sweep(clock())
    const local = getLocal()
    const envelope: PresenceEnvelope = {
      t: 'presence',
      position: [local.position[0], local.position[1], local.position[2]],
      rotationY: local.rotationY ?? 0,
      ...(local.meta !== undefined && { meta: local.meta }),
    }
    const json = JSON.stringify(envelope)
    if (json !== lastSentJson || beat % KEEPALIVE_EVERY === 0) {
      transport.send(envelope)
      lastSentJson = json
    }
    beat += 1
  }

  return {
    store,
    start() {
      if (timer !== null) return
      beat = 0
      lastSentJson = null
      unsubscribe = transport.subscribe(handleMessage)
      tick()
      timer = setInterval(tick, intervalMs)
    },
    stop() {
      if (timer === null) return
      clearInterval(timer)
      timer = null
      unsubscribe?.()
      unsubscribe = null
      transport.send({ t: 'bye' } satisfies ByeEnvelope)
    },
    peers() {
      return Object.values(store.getState())
    },
    interpolationEnabled,
    samplePeer(peerId) {
      const buffer = buffers?.get(peerId)
      if (!buffer) return null
      return buffer.sample(lerpSample)
    },
  }
}
