/**
 * R3F rendering for a presence store: one `<group>` per remote peer,
 * smoothly lerped toward its latest replicated transform every frame.
 */
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import type { Group } from 'three'
import { useStore } from 'zustand'
import type { StoreApi } from 'zustand/vanilla'
import type { PeerSample, RemotePeer } from './presence'

/** Props for {@link RemotePlayers}. */
export interface RemotePlayersProps {
  /**
   * A presence sync (or anything exposing its store shape) — typically the
   * return value of `createPresenceSync`. When the sync was created with
   * `interpolation` enabled, peers are positioned by sampling its snapshot
   * buffers instead of the exponential smoothing below.
   */
  sync: {
    store: StoreApi<Record<string, RemotePeer>>
    interpolationEnabled?: boolean
    samplePeer?: (peerId: string) => PeerSample | null
  }
  /**
   * Visual for one peer, rendered inside the moving group (so return it
   * centered at the origin). Re-invoked only when peers join/leave, not per
   * heartbeat — read live data in your own effects if you need it.
   * @default a translucent capsule
   */
  renderPeer?: (peer: RemotePeer) => ReactNode
  /** Per-frame smoothing factor in (0, 1]; 1 = snap. @default 0.15 */
  lerp?: number
}

function DefaultPeerAvatar() {
  return (
    <mesh position={[0, 0.9, 0]}>
      <capsuleGeometry args={[0.3, 0.9, 4, 12]} />
      <meshStandardMaterial color="#7fb4ff" transparent opacity={0.55} />
    </mesh>
  )
}

/**
 * Render every remote peer in a presence store. React re-renders only on
 * join/leave (a key-list selector); positions and rotations are applied
 * imperatively in `useFrame` with exponential smoothing and shortest-arc
 * rotation — no per-frame allocations, no per-heartbeat re-renders.
 * Removed peers unmount and their refs are cleaned up.
 */
export function RemotePlayers({ sync, renderPeer, lerp = 0.15 }: RemotePlayersProps) {
  // Re-render only when the set of peer ids changes.
  const idsKey = useStore(sync.store, (state) => Object.keys(state).sort().join('\n'))
  const ids = useMemo(() => (idsKey === '' ? [] : idsKey.split('\n')), [idsKey])

  const groups = useRef(new Map<string, Group>())
  // Ids whose group already got an initial snap-to-position, so re-attached
  // refs on unrelated re-renders don't teleport existing peers.
  const placed = useRef(new Set<string>())

  useEffect(() => {
    for (const id of [...placed.current]) {
      if (!ids.includes(id)) placed.current.delete(id)
    }
  }, [ids])

  useFrame(() => {
    const state = sync.store.getState()
    const samplePeer = sync.interpolationEnabled === true ? sync.samplePeer : undefined
    for (const [id, group] of groups.current) {
      const peer = state[id]
      if (!peer) continue
      if (samplePeer) {
        const sampled = samplePeer(id)
        if (sampled) {
          // The delay buffer already yields a continuous trajectory —
          // apply it directly, no extra smoothing on top.
          group.position.set(sampled.position[0], sampled.position[1], sampled.position[2])
          group.rotation.y = sampled.rotationY
          continue
        }
        // No sample yet (peer just joined): fall through to smoothing.
      }
      group.position.x += (peer.position[0] - group.position.x) * lerp
      group.position.y += (peer.position[1] - group.position.y) * lerp
      group.position.z += (peer.position[2] - group.position.z) * lerp
      const diff = peer.rotationY - group.rotation.y
      // Shortest-arc smoothing, same scheme as the scene Player.
      group.rotation.y += Math.atan2(Math.sin(diff), Math.cos(diff)) * lerp
    }
  })

  const state = sync.store.getState()
  return (
    <>
      {ids.map((id) => {
        const peer = state[id]
        if (!peer) return null
        return (
          <group
            key={id}
            ref={(group: Group | null) => {
              if (group) {
                if (!placed.current.has(id)) {
                  const current = sync.store.getState()[id]
                  if (current) {
                    group.position.set(current.position[0], current.position[1], current.position[2])
                    group.rotation.y = current.rotationY
                  }
                  placed.current.add(id)
                }
                groups.current.set(id, group)
              } else {
                groups.current.delete(id)
              }
            }}
          >
            {renderPeer ? renderPeer(peer) : <DefaultPeerAvatar />}
          </group>
        )
      })}
    </>
  )
}
