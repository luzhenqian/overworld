/**
 * Shared player transform, exposed as module-level mutable refs instead of
 * store state. The player controller writes these every frame; per-frame
 * consumers (proximity detection, minimaps, cameras) read them inside
 * `useFrame` without triggering React re-renders.
 *
 * Systems that need reactive, throttled position updates should subscribe to
 * the `player:moved` event on the bus instead.
 */
import type { Vec3 } from '@overworld/core'

/**
 * Current player world position. Mutated in place every frame by
 * {@link Player} — read it per frame, do not capture the tuple.
 */
export const playerPositionRef: { current: Vec3 } = { current: [0, 0, 0] }

/** Current player Y rotation (radians), updated every frame by {@link Player}. */
export const playerRotationRef: { current: number } = { current: 0 }

/** Return a snapshot copy of the current player position. */
export function getPlayerPosition(): Vec3 {
  const [x, y, z] = playerPositionRef.current
  return [x, y, z]
}

let pendingTeleport: Vec3 | null = null

/**
 * Request the player be snapped to a new position on the next frame — the
 * generic replacement for the source game's "teleport on scene change"
 * behavior. Call it alongside `useSceneStore.getState().setScene(...)`.
 */
export function teleportPlayer(position: Vec3): void {
  pendingTeleport = [position[0], position[1], position[2]]
}

/**
 * Consume a pending teleport request, if any. Called by {@link Player} each
 * frame; games normally never need this.
 */
export function consumePlayerTeleport(): Vec3 | null {
  const teleport = pendingTeleport
  pendingTeleport = null
  return teleport
}
