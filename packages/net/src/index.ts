// Transport abstraction + reference implementations
export {
  createLocalTransportHub,
  createBroadcastChannelTransport,
  isBroadcastChannelAvailable,
  createWebSocketTransport,
} from './transport'
export type {
  NetMessage,
  Transport,
  LocalTransportHub,
  BroadcastChannelTransportConfig,
  WebSocketTransportConfig,
  WebSocketLike,
  WebSocketConstructor,
} from './transport'

// Snapshot interpolation
export { createSnapshotBuffer } from './snapshotBuffer'
export type { SnapshotBuffer, SnapshotBufferConfig } from './snapshotBuffer'

// Presence replication
export { createPresenceSync } from './presence'
export type {
  PresenceSync,
  PresenceSyncConfig,
  PresenceLocal,
  PresenceEventSink,
  PeerSample,
  RemotePeer,
} from './presence'

// Event relay
export { relayEvents } from './relay'
export type { RelayBus, RelayOptions } from './relay'

// R3F components
export { RemotePlayers } from './RemotePlayers'
export type { RemotePlayersProps } from './RemotePlayers'
