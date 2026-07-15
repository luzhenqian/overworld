/**
 * Headless minimap marker registry. Game systems (NPC spawners, quest
 * engines, ...) register markers here; the `<MiniMap>` component only reads.
 * No React or canvas dependency — usable from any code, testable headlessly.
 */
import { create } from 'zustand'
import type { Vec3 } from '@overworld/core'

/** A dot on the minimap. */
export interface MinimapMarker {
  id: string
  /** Free-form category (`'npc'`, `'shop'`, ...) used for color lookup via `markerColors`. */
  kind?: string
  /** World position; only X/Z are projected onto the map. */
  position: Vec3
  /** Explicit dot color; takes precedence over the `markerColors[kind]` lookup. */
  color?: string
  /** Optional display label; the default renderer ignores it, custom UIs may use it. */
  label?: string
}

interface MinimapState {
  /** Registered markers by id. */
  markers: Record<string, MinimapMarker>
  /** Add a marker (replaces any marker with the same id). */
  registerMarker: (marker: MinimapMarker) => void
  /** Remove a marker. Missing ids are a no-op. */
  unregisterMarker: (id: string) => void
  /** Move a marker (e.g. a wandering NPC). Missing ids are a no-op. */
  setMarkerPosition: (id: string, position: Vec3) => void
  /** Remove all markers (scene teardown). */
  clearMarkers: () => void
}

/**
 * Global minimap marker store (zustand singleton):
 *
 * ```ts
 * const { registerMarker, unregisterMarker } = useMinimapStore.getState()
 * registerMarker({ id: 'npc:yi-he', kind: 'npc', position: [4, 0, -2] })
 * unregisterMarker('npc:yi-he')
 * ```
 */
export const useMinimapStore = create<MinimapState>()((set) => ({
  markers: {},

  registerMarker: (marker) =>
    set((state) => ({ markers: { ...state.markers, [marker.id]: marker } })),

  unregisterMarker: (id) =>
    set((state) => {
      if (!(id in state.markers)) return state
      const markers = { ...state.markers }
      delete markers[id]
      return { markers }
    }),

  setMarkerPosition: (id, position) =>
    set((state) => {
      const marker = state.markers[id]
      if (!marker) return state
      return { markers: { ...state.markers, [id]: { ...marker, position } } }
    }),

  clearMarkers: () => set({ markers: {} }),
}))
