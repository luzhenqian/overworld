/**
 * Client-side input prediction + server reconciliation. The client applies
 * its inputs to a local copy of the state immediately (zero perceived
 * latency), queues each input with a sequence number, and sends it to an
 * authoritative server. When a server state arrives (tagged with the last
 * input seq the server processed), the client rewinds to the server state
 * and replays the still-unacked inputs — so local prediction stays ahead of
 * the wire without ever diverging from the authority for long.
 *
 * Pure and transport-agnostic: the core knows nothing about sockets. The
 * only contract is that `step` is **deterministic** and shared verbatim by
 * client and server — same state + same input + same dt must produce the
 * same next state on both sides, or every ack becomes a correction.
 * {@link createInputChannel} is the thin envelope helper that pairs the
 * core with a {@link Transport}.
 */
import type { NetMessage, Transport } from './transport'

/** A queued, not-yet-acknowledged input. */
export interface PendingInput<TInput> {
  /** Client-assigned sequence number (monotonic from 1). */
  seq: number
  input: TInput
  /** Simulation delta the input was applied with, in ms. */
  dtMs: number
}

/** Config for {@link createPredictedState}. */
export interface PredictedStateConfig<TState, TInput> {
  /** Starting state (also what the server starts from). */
  initialState: TState
  /**
   * Pure deterministic simulation step, run by **both** client and server.
   * Must not mutate `state` — return the next state.
   */
  step: (state: TState, input: TInput, dtMs: number) => TState
  /**
   * Cap on retained unacknowledged inputs. On overflow the oldest is
   * dropped (with a single console warning per instance) — hitting this
   * means the server is not acking, and unbounded growth would only make
   * the eventual replay burst worse. @default 128
   */
  maxPending?: number
  /**
   * State equality used for misprediction detection. The default
   * `JSON.stringify` comparison is correct for plain-data states but costs
   * a full serialization of both states per server ack — pass a cheap
   * field-wise comparison (e.g. epsilon on positions) for hot paths or
   * states with non-JSON parts.
   */
  equals?: (a: TState, b: TState) => boolean
  /**
   * Fired after reconciliation **only** when the replayed state differs
   * (per `equals`) from what the client had predicted — i.e. the server
   * disagreed (it clamped, corrected, or saw different inputs). `before`
   * is the discarded prediction, `after` the corrected state (already set
   * as `state`). Use it to snap/blend visuals or log divergence.
   */
  onCorrection?: (before: TState, after: TState) => void
}

/** Handle returned by {@link createPredictedState}. */
export interface PredictedState<TState, TInput> {
  /** Current predicted state (server state + replayed unacked inputs). */
  readonly state: TState
  /** Number of inputs applied locally but not yet acknowledged. */
  readonly pendingCount: number
  /** Highest server-acknowledged input seq (0 before the first ack). */
  readonly lastAckedSeq: number
  /**
   * Advance the local prediction by one input: runs `step`, queues the
   * input for reconciliation, and returns its sequence number (monotonic
   * from 1) — send it to the server along with the input and `dtMs`.
   */
  applyInput(input: TInput, dtMs: number): number
  /**
   * Reconcile against an authoritative server state. `lastProcessedSeq` is
   * the highest input seq the server had applied when producing
   * `serverState`. Acked inputs (`seq <= lastProcessedSeq`) are dropped,
   * the state rewinds to `serverState`, and the remaining pending inputs
   * replay in order through `step`. Stale or out-of-order acks
   * (`lastProcessedSeq <= lastAckedSeq`) are ignored entirely.
   */
  onServerState(serverState: TState, lastProcessedSeq: number): void
  /**
   * Hard-set the local state (respawn, teleport, scene change): clears the
   * pending queue and replaces `state`. The seq counter keeps counting up
   * and `lastAckedSeq` is preserved, so acks that were in flight across
   * the reset stay unambiguous.
   */
  reset(state: TState): void
}

/** Create a {@link PredictedState}. See the module doc for the loop. */
export function createPredictedState<TState, TInput>(
  config: PredictedStateConfig<TState, TInput>
): PredictedState<TState, TInput> {
  const { step, onCorrection } = config
  const maxPending = config.maxPending ?? 128
  const equals =
    config.equals ?? ((a: TState, b: TState) => Object.is(JSON.stringify(a), JSON.stringify(b)))

  let state = config.initialState
  let nextSeq = 1
  let lastAckedSeq = 0
  let warnedOverflow = false
  const pending: PendingInput<TInput>[] = []

  return {
    get state() {
      return state
    },
    get pendingCount() {
      return pending.length
    },
    get lastAckedSeq() {
      return lastAckedSeq
    },
    applyInput(input, dtMs) {
      const seq = nextSeq
      nextSeq += 1
      state = step(state, input, dtMs)
      pending.push({ seq, input, dtMs })
      if (pending.length > maxPending) {
        pending.splice(0, pending.length - maxPending)
        if (!warnedOverflow) {
          warnedOverflow = true
          console.warn(
            `[overworld/net] prediction: pending inputs exceeded maxPending (${maxPending}); ` +
              'dropping oldest. The server is not acknowledging inputs — dropped inputs can no ' +
              'longer be replayed on reconciliation.'
          )
        }
      }
      return seq
    },
    onServerState(serverState, lastProcessedSeq) {
      // Stale or duplicate ack (out-of-order delivery): already reconciled
      // past this point — replaying from it would resurrect acked inputs.
      if (lastProcessedSeq <= lastAckedSeq) return
      lastAckedSeq = lastProcessedSeq

      // Drop everything the server has already applied…
      let firstUnacked = 0
      while (firstUnacked < pending.length && pending[firstUnacked]!.seq <= lastProcessedSeq) {
        firstUnacked += 1
      }
      if (firstUnacked > 0) pending.splice(0, firstUnacked)

      // …rewind to the authority, and replay what it hasn't seen yet.
      const before = state
      let replayed = serverState
      for (const p of pending) replayed = step(replayed, p.input, p.dtMs)
      state = replayed

      if (onCorrection && !equals(before, replayed)) onCorrection(before, replayed)
    },
    reset(nextState) {
      pending.length = 0
      state = nextState
    },
  }
}

// ---------------------------------------------------------------------------
// Input channel: envelopes over a Transport
// ---------------------------------------------------------------------------

interface InputEnvelope<TInput> {
  t: 'input'
  seq: number
  input: TInput
  dtMs: number
}

interface StateEnvelope<TState> {
  t: 'state'
  state: TState
  lastSeq: number
}

function isInputEnvelope(value: unknown): value is InputEnvelope<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { t?: unknown }).t === 'input' &&
    typeof (value as { seq?: unknown }).seq === 'number' &&
    typeof (value as { dtMs?: unknown }).dtMs === 'number' &&
    'input' in value
  )
}

function isStateEnvelope(value: unknown): value is StateEnvelope<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { t?: unknown }).t === 'state' &&
    typeof (value as { lastSeq?: unknown }).lastSeq === 'number' &&
    'state' in value
  )
}

/** Options for {@link createInputChannel}. */
export interface InputChannelOptions<TInput> {
  /**
   * Optional runtime guard for received input payloads (server side).
   * Envelopes whose `input` fails the guard are dropped. Without it,
   * received inputs are trusted to be `TInput` — validate/clamp them in
   * your authority logic regardless (never trust the client).
   */
  isInput?: (value: unknown) => value is TInput
}

/**
 * Handle returned by {@link createInputChannel}. One object carries both
 * roles — a client uses `sendInput` + `onServerState`, an authoritative
 * server uses `onInput` + `sendState`.
 */
export interface InputChannel<TState, TInput> {
  /** Client → server: broadcast `{ t: 'input', seq, input, dtMs }`. */
  sendInput(seq: number, input: TInput, dtMs: number): void
  /**
   * Client side: receive authoritative `{ t: 'state', state, lastSeq }`
   * envelopes. Wire the callback straight into
   * `PredictedState.onServerState`. Returns an unsubscribe function.
   */
  onServerState(cb: (state: TState, lastSeq: number) => void): () => void
  /**
   * Server side: receive inputs from peers, tagged with the sender's
   * transport peer id. Returns an unsubscribe function.
   */
  onInput(cb: (from: string, seq: number, input: TInput, dtMs: number) => void): () => void
  /** Server → clients: broadcast `{ t: 'state', state, lastSeq }`. */
  sendState(state: TState, lastSeq: number): void
}

/**
 * Thin envelope helper pairing {@link createPredictedState} with a
 * {@link Transport}. Envelopes are namespaced with `t: 'input' | 'state'`,
 * so the channel coexists with presence (`t: 'presence' | 'bye'`) and the
 * event relay (`t: 'event'`) on a single transport.
 *
 * Note the transport is a *broadcast* primitive: `sendState` reaches every
 * other peer. On a shared many-client transport, pair each client with the
 * authority over its own transport/room (or address states in your own
 * envelope) when per-client state differs.
 */
export function createInputChannel<TState, TInput>(
  transport: Transport,
  options: InputChannelOptions<TInput> = {}
): InputChannel<TState, TInput> {
  const { isInput } = options

  return {
    sendInput(seq, input, dtMs) {
      transport.send({ t: 'input', seq, input, dtMs } satisfies InputEnvelope<TInput>)
    },
    onServerState(cb) {
      return transport.subscribe((msg: NetMessage) => {
        if (!isStateEnvelope(msg.data)) return
        cb(msg.data.state as TState, msg.data.lastSeq)
      })
    },
    onInput(cb) {
      return transport.subscribe((msg: NetMessage) => {
        if (!isInputEnvelope(msg.data)) return
        if (isInput && !isInput(msg.data.input)) return
        cb(msg.from, msg.data.seq, msg.data.input as TInput, msg.data.dtMs)
      })
    },
    sendState(state, lastSeq) {
      transport.send({ t: 'state', state, lastSeq } satisfies StateEnvelope<TState>)
    },
  }
}
