/**
 * React/drei helpers, kept separate from the pure store so `loadingStore`
 * stays importable (and testable) without any React or three.js runtime.
 */
import { useEffect, useRef } from 'react'
import { useGLTF, useProgress } from '@react-three/drei'
import { useLoadingStore } from './loadingStore'

const preloaded = new Set<string>()

/**
 * Preload GLTF assets via drei's `useGLTF.preload`. Each URL is only ever
 * preloaded once per session, so calling this from several components (or
 * re-rendering with the same list) is cheap.
 *
 * ```tsx
 * useAssetPreload(['/models/player.glb', '/models/portal.glb'])
 * ```
 */
export function useAssetPreload(urls: string[]): void {
  useEffect(() => {
    for (const url of urls) {
      if (preloaded.has(url)) continue
      preloaded.add(url)
      useGLTF.preload(url)
    }
  }, [urls])
}

/** Snapshot of drei's loader state, as returned by {@link useSceneLoadProgress}. */
export interface SceneLoadProgress {
  /** Whether the three.js loading manager is currently active. */
  active: boolean
  /** Loader progress, 0–100. */
  progress: number
  /** URL of the item currently loading. */
  item: string
  /** Number of items loaded so far. */
  loaded: number
  /** Total number of items known to the loading manager. */
  total: number
}

/**
 * Bridge drei's `useProgress` into the loading store: while three.js is
 * loading, a task (default id `scene-assets`) mirrors its progress; when the
 * loader goes idle the task completes. Must render inside a Canvas tree.
 *
 * Returns the raw drei progress snapshot for convenience.
 */
export function useSceneLoadProgress(taskId = 'scene-assets'): SceneLoadProgress {
  const { active, progress, item, loaded, total } = useProgress()
  const startedRef = useRef(false)

  useEffect(() => {
    const store = useLoadingStore.getState()
    if (active) {
      if (!startedRef.current) {
        startedRef.current = true
        store.beginTask(taskId)
      }
      store.setTaskProgress(taskId, progress / 100)
    } else if (startedRef.current) {
      startedRef.current = false
      store.completeTask(taskId)
    }
  }, [active, progress, taskId])

  return { active, progress, item, loaded, total }
}
