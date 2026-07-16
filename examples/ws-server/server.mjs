#!/usr/bin/env node
/**
 * Reference relay server for @overworld/net's WebSocket transport.
 *
 * Contract (see the @overworld/net README): broadcast every incoming
 * message, verbatim, to all OTHER clients in the same room. The envelope
 * (`{ from, data }`) is opaque to the server — no parsing, no state, no
 * authority. Rooms are the URL path: `ws://host:8787/lobby` only relays
 * to other sockets that connected with `/lobby` (default room `/`).
 */
import { WebSocketServer, WebSocket } from 'ws'

const PORT = Number(process.env.PORT ?? 8787)
const HEARTBEAT_MS = 30_000

/** room path -> Set<WebSocket> */
const rooms = new Map()

function roomOf(req) {
  try {
    const { pathname } = new URL(req.url ?? '/', 'ws://localhost')
    return pathname === '' ? '/' : pathname
  } catch {
    return '/'
  }
}

const wss = new WebSocketServer({ port: PORT })

wss.on('connection', (socket, req) => {
  const room = roomOf(req)
  let peers = rooms.get(room)
  if (!peers) rooms.set(room, (peers = new Set()))
  peers.add(socket)
  console.log(`[relay] + peer connected    room=${room} peers=${peers.size}`)

  socket.isAlive = true
  socket.on('pong', () => {
    socket.isAlive = true
  })

  socket.on('message', (data, isBinary) => {
    for (const client of peers) {
      if (client !== socket && client.readyState === WebSocket.OPEN) {
        client.send(data, { binary: isBinary })
      }
    }
  })

  socket.on('close', () => {
    peers.delete(socket)
    if (peers.size === 0) rooms.delete(room)
    console.log(`[relay] - peer disconnected room=${room} peers=${peers.size}`)
  })

  socket.on('error', (err) => {
    console.error(`[relay] socket error (room=${room}): ${err.message}`)
  })
})

// Reap dead sockets: any client that missed a whole ping cycle is gone.
const heartbeat = setInterval(() => {
  for (const socket of wss.clients) {
    if (!socket.isAlive) {
      socket.terminate()
      continue
    }
    socket.isAlive = false
    socket.ping()
  }
}, HEARTBEAT_MS)

wss.on('listening', () => {
  console.log(
    `[relay] listening on ws://localhost:${PORT} — rooms via path, e.g. ws://localhost:${PORT}/lobby`
  )
})

process.on('SIGINT', () => {
  console.log('\n[relay] shutting down…')
  clearInterval(heartbeat)
  for (const socket of wss.clients) socket.close(1001, 'server shutting down')
  wss.close(() => process.exit(0))
  // Fallback in case some socket never finishes its close handshake.
  setTimeout(() => process.exit(0), 1500).unref()
})
