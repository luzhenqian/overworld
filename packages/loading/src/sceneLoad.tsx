import { useEffect, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Vec3 } from '@overworld-engine/core'
import { preloadManifest } from './manifest'
import { aggregateZoneProgress, useSceneLoadStore } from './sceneLoadStore'
import { orderZones, type ZoneManifest } from './zoneStreaming'

export interface ZoneStreamingResult {
  pending: string[]
  loaded: string[]
  failed: string[]
  /** Weighted-average progress (0..1) across all zones — see `aggregateZoneProgress`. */
  progress: number
  /** Clears the started marker and error for `id`, then re-kicks its preload. */
  retry: (id: string) => void
}

/**
 * Priority-bucket-first zone streaming: preloads each zone's manifest,
 * higher-priority zones first and nearest-first within a bucket (see
 * `orderZones`). Fire-and-forget — `preloadManifest` is invoked without
 * blocking rendering; its returned promise only drives local state
 * (`loaded`/`progress`) and failure surfacing via `useSceneLoadStore().failZone`.
 * Re-orders whenever the zone set changes.
 */
export function useZoneStreaming(
  zones: ZoneManifest[],
  playerPosRef: { current: Vec3 }
): ZoneStreamingResult {
  const [loaded, setLoaded] = useState<string[]>([])
  const [progressById, setProgressById] = useState<Record<string, number>>({})
  const startedRef = useRef<Set<string>>(new Set())

  const start = (z: ZoneManifest) => {
    if (startedRef.current.has(z.id)) return
    startedRef.current.add(z.id)
    preloadManifest(z.manifest, {
      onProgress: (f) => setProgressById((m) => ({ ...m, [z.id]: f })),
    })
      .then(() => setLoaded((l) => (l.includes(z.id) ? l : [...l, z.id])))
      .catch((err) =>
        useSceneLoadStore.getState().failZone(z.id, String((err as Error)?.message ?? err))
      )
  }

  useEffect(() => {
    // playerPosRef read once per zone-set change; streaming is coarse-grained.
    orderZones(zones, playerPosRef.current).forEach(start)
  }, [zones, playerPosRef])

  const retry = (id: string) => {
    startedRef.current.delete(id)
    setLoaded((l) => l.filter((x) => x !== id))
    setProgressById((m) => ({ ...m, [id]: 0 }))
    useSceneLoadStore.getState().retryZone(id)
    const z = zones.find((x) => x.id === id)
    if (z) start(z)
  }

  const pending = zones.map((z) => z.id).filter((id) => !loaded.includes(id))
  const failed = useSceneLoadStore((s) => s.errors).map((e) => e.zone).filter(Boolean) as string[]
  const progress = aggregateZoneProgress(zones.map((z) => ({ progress: progressById[z.id] ?? 0 })))
  return { pending, loaded, failed, progress, retry }
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
