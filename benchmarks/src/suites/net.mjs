import { createPredictedState, createSnapshotBuffer } from '@overworld/net'
import { bench, mulberry32 } from '../lib.mjs'

const lerp = (a, b, t) => ({
  x: a.x + (b.x - a.x) * t,
  z: a.z + (b.z - a.z) * t,
})

export function run() {
  const results = []

  // Snapshot buffer: 10k pushes (deterministic injected clock, 50ms ticks).
  {
    let time = 0
    const buffer = createSnapshotBuffer({ delayMs: 120, maxSnapshots: 32, now: () => time })
    const rng = mulberry32(31337)
    results.push(
      bench('snapshotBuffer.push (maxSnapshots 32)', () => {
        time += 50
        buffer.push({ x: rng() * 100, z: rng() * 100 })
      }, { iterations: 10000, meta: { pushesPerRun: 10000, maxSnapshots: 32 } })
    )

    // 10k samples over a full buffer, render time inside the bracket window.
    let sampleTime = time - 200
    results.push(
      bench('snapshotBuffer.sample (interpolating)', () => {
        sampleTime += 0.001 // stay inside the buffered window
        const saved = sampleTime
        // sample uses the injected clock; point it at the sample time
        time = saved + 120
        buffer.sample(lerp)
      }, { iterations: 10000, meta: { samplesPerRun: 10000 } })
    )
  }

  // Prediction: 1k inputs with a server reconcile every 10 inputs.
  {
    const step = (state, input, dtMs) => ({
      x: state.x + input.dx * (dtMs / 1000),
      z: state.z + input.dz * (dtMs / 1000),
    })
    const predicted = createPredictedState({
      initialState: { x: 0, z: 0 },
      step,
      maxPending: 128,
    })
    let server = { x: 0, z: 0 }
    const queue = [] // inputs the server has not applied yet
    const rng = mulberry32(4242)
    const inputs = Array.from({ length: 1000 }, () => ({
      dx: rng() * 2 - 1,
      dz: rng() * 2 - 1,
    }))
    results.push(
      bench('applyInput + reconcile every 10', (i) => {
        const input = inputs[i % inputs.length]
        const seq = predicted.applyInput(input, 16.7)
        queue.push(input)
        if (seq % 10 === 0) {
          // Authoritative server applies everything it has, then acks.
          for (const queued of queue) server = step(server, queued, 16.7)
          queue.length = 0
          predicted.onServerState(server, seq)
        }
      }, { iterations: 1000, meta: { inputsPerRun: 1000, reconcileEvery: 10 } })
    )

    // Reconcile-only cost with a full pending queue (worst-case replay burst).
    const burst = createPredictedState({
      initialState: { x: 0, z: 0 },
      step,
      maxPending: 128,
      equals: (a, b) => a.x === b.x && a.z === b.z,
    })
    let ack = 0
    results.push(
      bench('onServerState replaying 100 pending inputs', () => {
        for (let k = 0; k < 100; k++) burst.applyInput({ dx: 1, dz: 0 }, 16.7)
        ack += 100
        burst.onServerState({ x: 0, z: 0 }, ack)
      }, { iterations: 100, warmup: 10, meta: { pendingReplayed: 100 } })
    )
  }

  return { name: 'net', results }
}
