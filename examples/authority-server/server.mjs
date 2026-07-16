#!/usr/bin/env node
/**
 * Reference AUTHORITATIVE movement server for @overworld/net's client-side
 * prediction (`createPredictedState` + `createInputChannel`).
 *
 * Unlike examples/ws-server (a pure relay), this server owns the truth:
 * it keeps every peer's position `{ x, z }`, applies received inputs
 * through THE SAME deterministic step the client predicts with (see
 * README), validates them (anti-cheat clamps), and acks each peer with
 * `{ t: 'state', state, lastSeq }` at 20 Hz so clients can reconcile.
 * All positions go out to everyone as `{ t: 'world', players }` at 10 Hz.
 *
 * Wire format matches createWebSocketTransport: every message is a JSON
 * envelope `{ from: peerId, data }` — `data` is the `t:`-namespaced packet.
 */
import { WebSocketServer, WebSocket } from 'ws'

const PORT = Number(process.env.PORT ?? 8788)
const STATE_HZ = 20 // per-peer authoritative ack rate
const WORLD_HZ = 10 // everyone-sees-everyone broadcast rate

// --- Shared deterministic simulation (keep in lockstep with the client!) ---
const SPEED = 5 // units per second
const BOUND = 50 // world half-extent: positions clamp to ±50

const clamp = (v, min, max) => Math.min(max, Math.max(min, v))

/** Pure step — identical to the client's `step` passed to createPredictedState. */
function step(state, input, dtMs) {
  const len = Math.hypot(input.dx, input.dz)
  const nx = len > 1 ? input.dx / len : input.dx
  const nz = len > 1 ? input.dz / len : input.dz
  return {
    x: clamp(state.x + nx * SPEED * (dtMs / 1000), -BOUND, BOUND),
    z: clamp(state.z + nz * SPEED * (dtMs / 1000), -BOUND, BOUND),
  }
}

// --- Authoritative world -----------------------------------------------
/** peerId -> { x, z } — the one true copy. */
const players = {}
/** peerId -> highest processed input seq. */
const lastSeqs = {}
/** peerId -> socket (for the per-peer state ack). */
const sockets = new Map()

const send = (socket, data) => {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ from: 'server', data }))
  }
}

const wss = new WebSocketServer({ port: PORT })

wss.on('connection', (socket) => {
  let peerId = null // learned from the first envelope's `from`

  socket.on('message', (raw) => {
    let envelope
    try {
      envelope = JSON.parse(raw.toString())
    } catch {
      return
    }
    if (typeof envelope?.from !== 'string') return
    if (peerId === null) {
      peerId = envelope.from
      players[peerId] ??= { x: 0, z: 0 }
      sockets.set(peerId, socket)
      console.log(`[authority] + ${peerId} joined (players=${sockets.size})`)
    }

    const data = envelope.data
    if (data?.t !== 'input' || typeof data.seq !== 'number') return
    const { input, dtMs } = data
    if (typeof input?.dx !== 'number' || typeof input?.dz !== 'number') return

    // Anti-cheat: never trust the client. Clamp the direction to the unit
    // box and the timestep to 100 ms — a hacked client sending dx=50 or
    // dtMs=10000 moves no faster than an honest one. Because the client
    // predicted with the raw values, its prediction diverges and its next
    // reconciliation snaps it back (onCorrection fires client-side).
    const safeInput = { dx: clamp(input.dx, -1, 1), dz: clamp(input.dz, -1, 1) }
    const safeDt = clamp(Number(dtMs) || 0, 0, 100)

    players[peerId] = step(players[peerId], safeInput, safeDt)
    lastSeqs[peerId] = Math.max(lastSeqs[peerId] ?? 0, data.seq)
  })

  socket.on('close', () => {
    if (peerId === null) return
    sockets.delete(peerId)
    delete players[peerId]
    delete lastSeqs[peerId]
    console.log(`[authority] - ${peerId} left (players=${sockets.size})`)
  })

  socket.on('error', (err) => console.error(`[authority] socket error: ${err.message}`))
})

// 20 Hz: ack each peer with ITS OWN authoritative state + last processed
// seq — exactly what PredictedState.onServerState wants.
const stateTick = setInterval(() => {
  for (const [peerId, socket] of sockets) {
    send(socket, { t: 'state', state: players[peerId], lastSeq: lastSeqs[peerId] ?? 0 })
  }
}, 1000 / STATE_HZ)

// 10 Hz: broadcast the whole world for rendering the other players.
const worldTick = setInterval(() => {
  if (sockets.size === 0) return
  const world = { t: 'world', players }
  for (const socket of sockets.values()) send(socket, world)
}, 1000 / WORLD_HZ)

wss.on('listening', () => {
  console.log(`[authority] listening on ws://localhost:${PORT} (state ${STATE_HZ}Hz, world ${WORLD_HZ}Hz)`)
})

process.on('SIGINT', () => {
  console.log('\n[authority] shutting down…')
  clearInterval(stateTick)
  clearInterval(worldTick)
  for (const socket of wss.clients) socket.close(1001, 'server shutting down')
  wss.close(() => process.exit(0))
  setTimeout(() => process.exit(0), 1500).unref()
})
