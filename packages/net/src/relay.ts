/**
 * Event relay: mirror selected EventBus events across a transport so an
 * emit on one peer re-emits on every other peer. The multiplayer building
 * block for "world events everyone should see" (doors opening, trades,
 * weather sync…).
 */
import type { NetMessage, Transport } from './transport'

/**
 * Structural bus shape the relay needs — `EventBus` from `@overworld-engine/core`
 * (including `gameEvents`) satisfies it.
 */
export interface RelayBus {
  onAny(fn: (event: string, payload: unknown) => void): () => void
  emit(event: string, payload: unknown): void
}

/** Options for {@link relayEvents}. */
export interface RelayOptions {
  /** Names of the bus events to relay. Only these cross the wire. */
  events: readonly string[]
}

interface EventEnvelope {
  t: 'event'
  event: string
  payload: unknown
}

function isEventEnvelope(value: unknown): value is EventEnvelope {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { t?: unknown }).t === 'event' &&
    typeof (value as { event?: unknown }).event === 'string'
  )
}

/**
 * Forward the listed `bus` events to all peers on `transport` (envelope
 * `{ t: 'event', event, payload }`) and re-emit received ones locally.
 * Returns an unbind function that stops both directions.
 *
 * Payloads must be JSON-serializable — they cross a wire on real
 * transports (no functions, class instances, or circular references).
 *
 * Echo-loop prevention: while a received event is being re-emitted locally,
 * a re-entrancy flag suppresses forwarding, so the re-emit never goes back
 * onto the transport. Each original emit therefore reaches every peer
 * exactly once. (Marking payload objects wouldn't survive serialization;
 * the flag works because both the bus and reference transports deliver
 * synchronously.)
 */
export function relayEvents(
  bus: RelayBus,
  transport: Transport,
  options: RelayOptions
): () => void {
  const relayed = new Set(options.events)
  let reEmitting = false

  const unbindAny = bus.onAny((event, payload) => {
    if (reEmitting || !relayed.has(event)) return
    transport.send({ t: 'event', event, payload } satisfies EventEnvelope)
  })

  const unsubscribe = transport.subscribe((msg: NetMessage) => {
    const data = msg.data
    if (!isEventEnvelope(data) || !relayed.has(data.event)) return
    reEmitting = true
    try {
      bus.emit(data.event, data.payload)
    } finally {
      reEmitting = false
    }
  })

  return () => {
    unbindAny()
    unsubscribe()
  }
}
