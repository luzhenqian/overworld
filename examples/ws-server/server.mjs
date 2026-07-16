#!/usr/bin/env node
/**
 * Reference relay server for @overworld-engine/net's WebSocket transport.
 *
 * The relay itself now lives in the publishable @overworld-engine/relay
 * package (`npx overworld-relay` runs this exact behavior); this example is
 * a thin wrapper kept for discoverability. Semantics (see the net package's
 * wire-protocol spec): broadcast every incoming message, verbatim, to all
 * OTHER clients in the same room. The envelope (`{ from, data }`) is opaque
 * to the server. Rooms are the URL path: `ws://host:8787/lobby` (default
 * room `/`).
 */
import { createRelayServer } from '@overworld-engine/relay'

const relay = createRelayServer({
  port: Number(process.env.PORT ?? 8787),
  heartbeatMs: Number(process.env.HEARTBEAT_MS ?? 30_000),
  logger: (line) => console.log(line),
})

relay.ready.catch((err) => {
  console.error(`[relay] failed to start: ${err.message}`)
  process.exit(1)
})

process.on('SIGINT', () => {
  console.log('\n[relay] shutting down…')
  relay.close().then(() => process.exit(0))
  // Fallback in case some socket never finishes its close handshake.
  setTimeout(() => process.exit(0), 2000).unref()
})
