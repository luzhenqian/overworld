import { afterEach, describe, expect, it, vi } from 'vitest'
import { createInputChannel, createPredictedState } from '../prediction'
import { createPresenceSync } from '../presence'
import { createLocalTransportHub } from '../transport'

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

// ---------------------------------------------------------------------------
// Shared deterministic movement sim (the same shape the authority-server
// example uses): normalized direction × speed × dt, clamped to world bounds.
// ---------------------------------------------------------------------------

interface Pos {
  x: number
  z: number
}

interface Move {
  dx: number
  dz: number
}

const SPEED = 5 // units per second
const BOUND = 50

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

function step(state: Pos, input: Move, dtMs: number): Pos {
  const len = Math.hypot(input.dx, input.dz)
  const nx = len > 1 ? input.dx / len : input.dx
  const nz = len > 1 ? input.dz / len : input.dz
  return {
    x: clamp(state.x + nx * SPEED * (dtMs / 1000), -BOUND, BOUND),
    z: clamp(state.z + nz * SPEED * (dtMs / 1000), -BOUND, BOUND),
  }
}

const origin = (): Pos => ({ x: 0, z: 0 })

describe('createPredictedState', () => {
  it('applies inputs to the local state immediately with monotonic seqs from 1', () => {
    const predicted = createPredictedState<Pos, Move>({ initialState: origin(), step })

    expect(predicted.state).toEqual({ x: 0, z: 0 })
    const s1 = predicted.applyInput({ dx: 1, dz: 0 }, 100)
    expect(predicted.state.x).toBeCloseTo(0.5)
    const s2 = predicted.applyInput({ dx: 1, dz: 0 }, 100)
    const s3 = predicted.applyInput({ dx: 0, dz: 1 }, 100)
    expect([s1, s2, s3]).toEqual([1, 2, 3])
    expect(predicted.state.x).toBeCloseTo(1)
    expect(predicted.state.z).toBeCloseTo(0.5)
    expect(predicted.pendingCount).toBe(3)
    expect(predicted.lastAckedSeq).toBe(0)
  })

  it('reconciles without correction when the server ran the same inputs', () => {
    const onCorrection = vi.fn()
    const predicted = createPredictedState<Pos, Move>({
      initialState: origin(),
      step,
      onCorrection,
    })

    const inputs: Move[] = [
      { dx: 1, dz: 0 },
      { dx: 1, dz: 1 },
      { dx: 0, dz: -1 },
    ]
    for (const input of inputs) predicted.applyInput(input, 50)
    const predictedAfterAll = predicted.state

    // Server ran the first two inputs through the same step.
    let server = origin()
    server = step(server, inputs[0]!, 50)
    server = step(server, inputs[1]!, 50)
    predicted.onServerState(server, 2)

    expect(predicted.state).toEqual(predictedAfterAll) // rewind + replay is a no-op
    expect(predicted.pendingCount).toBe(1) // only seq 3 remains
    expect(predicted.lastAckedSeq).toBe(2)
    expect(onCorrection).not.toHaveBeenCalled()
  })

  it('converges to the server under latency: scripted authoritative loop, acks N ticks late', () => {
    const hub = createLocalTransportHub()
    const clientTransport = hub.createTransport('client')
    const serverTransport = hub.createTransport('server')
    const clientChannel = createInputChannel<Pos, Move>(clientTransport)
    const serverChannel = createInputChannel<Pos, Move>(serverTransport)

    const corrections: Array<[Pos, Pos]> = []
    const predicted = createPredictedState<Pos, Move>({
      initialState: origin(),
      step,
      onCorrection: (before, after) => corrections.push([before, after]),
    })
    clientChannel.onServerState((state, lastSeq) => predicted.onServerState(state, lastSeq))

    // Authoritative loop: same step fn, but each input is only processed
    // LAG ticks after it arrives (simulated latency on a sync hub).
    const LAG = 3
    let serverState = origin()
    let serverLastSeq = 0
    let serverTickNo = 0
    const inbox: Array<{ arrivedAt: number; seq: number; input: Move; dtMs: number }> = []
    serverChannel.onInput((_from, seq, input, dtMs) => {
      inbox.push({ arrivedAt: serverTickNo, seq, input, dtMs })
    })
    const serverTick = () => {
      serverTickNo += 1
      let processed = false
      while (inbox.length > 0 && inbox[0]!.arrivedAt <= serverTickNo - LAG) {
        const { seq, input, dtMs } = inbox.shift()!
        serverState = step(serverState, input, dtMs)
        serverLastSeq = seq
        processed = true
      }
      if (processed) serverChannel.sendState(serverState, serverLastSeq)
    }

    // Client keeps predicting a scripted 20-input stream, one server tick
    // per client tick — so every ack arrives while newer inputs are already
    // pending and reconciliation must rewind + replay.
    const TICKS = 20
    for (let i = 0; i < TICKS; i += 1) {
      const input: Move = { dx: i % 3 === 0 ? 1 : 0.4, dz: i % 4 === 0 ? -1 : 0.6 }
      const seq = predicted.applyInput(input, 50)
      clientChannel.sendInput(seq, input, 50)
      expect(predicted.pendingCount).toBeGreaterThan(0) // still ahead of the authority
      serverTick()
    }
    // Drain: let the server catch up on the lagged tail.
    for (let i = 0; i < LAG + 1; i += 1) serverTick()

    expect(serverLastSeq).toBe(TICKS)
    expect(predicted.lastAckedSeq).toBe(TICKS)
    expect(predicted.pendingCount).toBe(0)
    expect(predicted.state).toEqual(serverState) // client converged on the authority
    expect(corrections).toEqual([]) // determinism held → never a correction
  })

  it('fires onCorrection once on misprediction and replays from the corrected base', () => {
    const corrections: Array<{ before: Pos; after: Pos }> = []
    const predicted = createPredictedState<Pos, Move>({
      initialState: origin(),
      step,
      onCorrection: (before, after) => corrections.push({ before, after }),
    })

    // Server-side rule the client doesn't know about: dx clamped to 0.5.
    const serverStep = (state: Pos, input: Move, dtMs: number): Pos =>
      step(state, { dx: clamp(input.dx, -0.5, 0.5), dz: input.dz }, dtMs)

    predicted.applyInput({ dx: 1, dz: 0 }, 100) // client predicts x = 0.5
    let server = serverStep(origin(), { dx: 1, dz: 0 }, 100) // server says x = 0.25
    predicted.onServerState(server, 1)

    expect(corrections).toHaveLength(1)
    expect(corrections[0]!.before.x).toBeCloseTo(0.5)
    expect(corrections[0]!.after.x).toBeCloseTo(0.25)
    expect(predicted.state).toEqual(server) // snapped to the authority

    // A compliant input predicted from the corrected base then reconciles
    // cleanly — no further corrections.
    predicted.applyInput({ dx: 0.5, dz: 0 }, 100)
    server = serverStep(server, { dx: 0.5, dz: 0 }, 100)
    predicted.onServerState(server, 2)

    expect(corrections).toHaveLength(1)
    expect(predicted.state).toEqual(server)
    expect(predicted.pendingCount).toBe(0)
  })

  it('drops the oldest pending input past maxPending, warning once', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const predicted = createPredictedState<Pos, Move>({
      initialState: origin(),
      step,
      maxPending: 3,
    })

    for (let i = 0; i < 5; i += 1) predicted.applyInput({ dx: 1, dz: 0 }, 100)
    expect(predicted.pendingCount).toBe(3)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0]![0]).toMatch(/maxPending \(3\)/)

    predicted.applyInput({ dx: 1, dz: 0 }, 100) // overflow again — no re-warn
    expect(warn).toHaveBeenCalledTimes(1)

    // Seqs 1–3 were dropped: acking seq 3 trims nothing (4, 5, 6 remain).
    predicted.onServerState(origin(), 3)
    expect(predicted.pendingCount).toBe(3)
  })

  it('reset clears pending and replaces state; seq stays monotonic', () => {
    const predicted = createPredictedState<Pos, Move>({ initialState: origin(), step })
    predicted.applyInput({ dx: 1, dz: 0 }, 100)
    predicted.applyInput({ dx: 1, dz: 0 }, 100)

    predicted.reset({ x: 9, z: -9 })
    expect(predicted.state).toEqual({ x: 9, z: -9 })
    expect(predicted.pendingCount).toBe(0)
    expect(predicted.applyInput({ dx: 0, dz: 0 }, 100)).toBe(3) // counter not rewound
  })

  it('ignores stale and duplicate server acks (lastProcessedSeq <= lastAckedSeq)', () => {
    const onCorrection = vi.fn()
    const predicted = createPredictedState<Pos, Move>({
      initialState: origin(),
      step,
      onCorrection,
    })

    for (let i = 0; i < 3; i += 1) predicted.applyInput({ dx: 1, dz: 0 }, 100)
    let server = origin()
    for (let i = 0; i < 3; i += 1) server = step(server, { dx: 1, dz: 0 }, 100)
    predicted.onServerState(server, 3)
    expect(predicted.lastAckedSeq).toBe(3)
    const settled = predicted.state

    // Out-of-order older ack with a bogus state: must be ignored entirely.
    predicted.onServerState({ x: -42, z: 42 }, 2)
    expect(predicted.state).toEqual(settled)
    expect(predicted.lastAckedSeq).toBe(3)

    // Duplicate of the current ack: same story.
    predicted.onServerState({ x: -42, z: 42 }, 3)
    expect(predicted.state).toEqual(settled)
    expect(onCorrection).not.toHaveBeenCalled()
  })
})

describe('createInputChannel', () => {
  it('delivers inputs to the server and states to the client over a local hub', () => {
    const hub = createLocalTransportHub()
    const clientChannel = createInputChannel<Pos, Move>(hub.createTransport('client'))
    const serverChannel = createInputChannel<Pos, Move>(hub.createTransport('server'))

    const inputs: Array<{ from: string; seq: number; input: Move; dtMs: number }> = []
    serverChannel.onInput((from, seq, input, dtMs) => inputs.push({ from, seq, input, dtMs }))
    const states: Array<{ state: Pos; lastSeq: number }> = []
    clientChannel.onServerState((state, lastSeq) => states.push({ state, lastSeq }))

    clientChannel.sendInput(1, { dx: 1, dz: 0 }, 50)
    expect(inputs).toEqual([{ from: 'client', seq: 1, input: { dx: 1, dz: 0 }, dtMs: 50 }])

    serverChannel.sendState({ x: 0.25, z: 0 }, 1)
    expect(states).toEqual([{ state: { x: 0.25, z: 0 }, lastSeq: 1 }])
  })

  it('coexists with presence on the same transport without cross-talk', () => {
    vi.useFakeTimers()
    const hub = createLocalTransportHub()
    const clientTransport = hub.createTransport('client')
    const serverTransport = hub.createTransport('server')
    const clientChannel = createInputChannel<Pos, Move>(clientTransport)
    const serverChannel = createInputChannel<Pos, Move>(serverTransport)

    const inputs: number[] = []
    serverChannel.onInput((_from, seq) => inputs.push(seq))
    const states: Pos[] = []
    clientChannel.onServerState((state) => states.push(state))

    // Presence heartbeats share the wire with input/state envelopes.
    const events = { emit: vi.fn() }
    const presence = createPresenceSync({
      transport: serverTransport,
      getLocal: () => ({ position: [1, 2, 3] as [number, number, number] }),
      events,
    })
    presence.start()

    const clientPresence = createPresenceSync({
      transport: clientTransport,
      getLocal: () => ({ position: [0, 0, 0] as [number, number, number] }),
      events,
    })
    clientPresence.start() // sends a presence packet the input channel must ignore
    vi.advanceTimersByTime(500) // let the earlier-started server presence keepalive

    clientChannel.sendInput(1, { dx: 1, dz: 0 }, 50)
    serverChannel.sendState({ x: 0.25, z: 0 }, 1)

    // Channel callbacks saw exactly their own envelopes…
    expect(inputs).toEqual([1])
    expect(states).toEqual([{ x: 0.25, z: 0 }])
    // …and presence replicated normally despite the extra traffic.
    expect(presence.store.getState()['client']?.position).toEqual([0, 0, 0])
    expect(clientPresence.store.getState()['server']?.position).toEqual([1, 2, 3])

    presence.stop()
    clientPresence.stop()
  })

  it('drops received inputs failing the optional isInput guard', () => {
    const hub = createLocalTransportHub()
    const clientChannel = createInputChannel<Pos, Move>(hub.createTransport('client'))
    const serverChannel = createInputChannel<Pos, Move>(hub.createTransport('server'), {
      isInput: (v): v is Move =>
        typeof v === 'object' &&
        v !== null &&
        typeof (v as Move).dx === 'number' &&
        typeof (v as Move).dz === 'number',
    })

    const seen: unknown[] = []
    serverChannel.onInput((_from, _seq, input) => seen.push(input))

    clientChannel.sendInput(1, { dx: 1, dz: 0 }, 50)
    clientChannel.sendInput(2, 'garbage' as unknown as Move, 50)
    expect(seen).toEqual([{ dx: 1, dz: 0 }])
  })
})
