#!/usr/bin/env node
/**
 * `overworld-relay` — start the reference relay from the command line.
 *
 *   npx overworld-relay                 # listen on 8787
 *   PORT=9000 npx overworld-relay      # pick the port
 *   HEARTBEAT_MS=10000 npx overworld-relay
 */
import { createRelayServer } from './relay'

const port = Number(process.env.PORT ?? 8787)
const heartbeatMs = Number(process.env.HEARTBEAT_MS ?? 30_000)

const relay = createRelayServer({
  port,
  heartbeatMs,
  logger: (line) => console.log(line),
})

relay.ready.catch((err: unknown) => {
  console.error(`[relay] failed to start: ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
})

const shutdown = () => {
  console.log('\n[relay] shutting down…')
  void relay.close().then(() => process.exit(0))
  // Fallback in case some socket never finishes its close handshake.
  const timer = setTimeout(() => process.exit(0), 2000)
  ;(timer as { unref?: () => void }).unref?.()
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
