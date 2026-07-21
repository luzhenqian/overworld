import { create } from 'zustand'
import {
  BASE_Z,
  anyWindowOpen,
  closeWindowState,
  focusWindowState,
  openWindowState,
  toggleWindowState,
  type WindowEntry,
} from './zOrder'

interface UiStoreState {
  windows: Record<string, WindowEntry>
  topZ: number
  openWindow: (id: string) => void
  closeWindow: (id: string) => void
  toggleWindow: (id: string) => void
  focusWindow: (id: string) => void
}

/**
 * Process-unique UI chrome state (window open/close registry + z-order).
 * Module-level singleton, matching the repo's infra/UI convention.
 */
export const useUiStore = create<UiStoreState>()((set) => ({
  windows: {},
  topZ: BASE_Z,
  openWindow: (id) => set((s) => openWindowState(s, id)),
  closeWindow: (id) => set((s) => closeWindowState(s, id)),
  toggleWindow: (id) => set((s) => toggleWindowState(s, id)),
  focusWindow: (id) => set((s) => focusWindowState(s, id)),
}))

/** Selector: is any game window open? Hosts use this to mute gameplay input. */
export const selectAnyWindowOpen = (s: { windows: Record<string, WindowEntry> }): boolean =>
  anyWindowOpen(s.windows)
