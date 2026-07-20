import { useEffect, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Vec3 } from '@overworld-engine/core'
import { preloadManifest } from './manifest'
import { useSceneLoadStore } from './sceneLoadStore'
import { orderZonesByDistance, type ZoneManifest } from './zoneStreaming'

export interface ZoneStreamingResult { pending: string[]; loaded: string[]; failed: string[] }

/**
 * Nearby-first zone streaming: preloads each zone's manifest in
 * distance order from the player. Fire-and-forget; failures surface via
 * useSceneLoadStore().failZone. Re-orders whenever the zone set changes.
 */
export function useZoneStreaming(
  zones: ZoneManifest[],
  playerPosRef: { current: Vec3 }
): ZoneStreamingResult {
  const [loaded, setLoaded] = useState<string[]>([])
  const startedRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    const ordered = orderZonesByDistance(zones, playerPosRef.current)
    ordered.forEach((z) => {
      if (startedRef.current.has(z.id)) return
      startedRef.current.add(z.id)
      try {
        preloadManifest(z.manifest)
        setLoaded((l) => [...l, z.id])
      } catch (err) {
        useSceneLoadStore.getState().failZone(z.id, String((err as Error)?.message ?? err))
      }
    })
    // playerPosRef read once per zone-set change; streaming is coarse-grained.
  }, [zones, playerPosRef])

  const pending = zones.map((z) => z.id).filter((id) => !loaded.includes(id))
  const failed = useSceneLoadStore((s) => s.errors).map((e) => e.zone).filter(Boolean) as string[]
  return { pending, loaded, failed }
}

/**
 * Marks the `first-frame` phase done on the first rendered frame after the
 * geometry phase completed. Mount inside the Canvas below your scene content.
 */
export function FirstFramePhase() {
  const doneRef = useRef(false)
  useFrame(() => {
    if (doneRef.current) return
    const s = useSceneLoadStore.getState()
    if (s.phases.geometry.done && !s.phases['first-frame'].done) {
      doneRef.current = true
      s.completePhase('first-frame')
    }
  })
  return null
}

/**
 * Dev-only: mirror the scene-load store onto window.__overworldSceneLoad so
 * end-to-end tests (Playwright) can await `phase === 'ready'` without sampling
 * canvas pixels. No-op in production builds and non-browser environments.
 *
 * Reads `import.meta.env.DEV` via a structural cast rather than a direct
 * property access: this package's tsconfig has no `vite/client` ambient
 * types, so `ImportMeta` has no `env` field to the type checker even though
 * bundlers (Vite, esbuild define) populate it at build/runtime.
 */
export function installSceneLoadDebugHandle(): () => void {
  if (typeof window === 'undefined') return () => {}
  const env = (import.meta as unknown as { env?: { DEV?: boolean } }).env
  if (!env?.DEV) return () => {}
  const w = window as unknown as { __overworldSceneLoad?: unknown }
  const sync = () => {
    w.__overworldSceneLoad = useSceneLoadStore.getState()
  }
  sync()
  return useSceneLoadStore.subscribe(sync)
}
