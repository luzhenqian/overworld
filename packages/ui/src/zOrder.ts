/** Base z-index for game windows (HUD overlay sits at CSS z-index 100). */
export const BASE_Z = 10

export interface WindowEntry {
  open: boolean
  z: number
}

export interface WindowsState {
  windows: Record<string, WindowEntry>
  topZ: number
}

/** Open (or refocus) a window, assigning it the next topmost z. */
export function openWindowState(state: WindowsState, id: string): WindowsState {
  const topZ = state.topZ + 1
  return { topZ, windows: { ...state.windows, [id]: { open: true, z: topZ } } }
}

/** Mark a window closed. No-op for unknown ids. */
export function closeWindowState(state: WindowsState, id: string): WindowsState {
  const entry = state.windows[id]
  if (!entry || !entry.open) return state
  return { ...state, windows: { ...state.windows, [id]: { ...entry, open: false } } }
}

/** Open if closed/unknown, close if open. */
export function toggleWindowState(state: WindowsState, id: string): WindowsState {
  return state.windows[id]?.open ? closeWindowState(state, id) : openWindowState(state, id)
}

/** Bring an open window to the front. No-op for closed/unknown ids. */
export function focusWindowState(state: WindowsState, id: string): WindowsState {
  const entry = state.windows[id]
  if (!entry?.open) return state
  const topZ = state.topZ + 1
  return { topZ, windows: { ...state.windows, [id]: { ...entry, z: topZ } } }
}

/** True when at least one window is open (host wires this to input layers). */
export function anyWindowOpen(windows: Record<string, WindowEntry>): boolean {
  return Object.values(windows).some((w) => w.open)
}
