import { create } from 'zustand'

export type ScenePhase = 'idle' | 'module' | 'geometry' | 'texture' | 'first-frame' | 'ready'
export const SCENE_PHASES: ScenePhase[] = ['idle', 'module', 'geometry', 'texture', 'first-frame', 'ready']
/** The four phases that carry real load work and feed aggregate progress. */
const LOADING_PHASES: ScenePhase[] = ['module', 'geometry', 'texture', 'first-frame']

export interface PhaseState { progress: number; done: boolean }
export interface SceneLoadError { zone?: string; message: string }

export interface SceneLoadState {
  phase: ScenePhase
  progress: number
  phases: Record<ScenePhase, PhaseState>
  errors: SceneLoadError[]
  setPhaseProgress: (phase: ScenePhase, p: number) => void
  completePhase: (phase: ScenePhase) => void
  failZone: (zone: string, message: string) => void
  retryZone: (zone: string) => void
  reset: () => void
}

/** Average progress of the four loading phases (idle/ready excluded). */
export function aggregateSceneProgress(phases: Record<ScenePhase, PhaseState>): number {
  const sum = LOADING_PHASES.reduce((acc, p) => acc + (phases[p]?.progress ?? 0), 0)
  return sum / LOADING_PHASES.length
}

function earliestIncomplete(phases: Record<ScenePhase, PhaseState>): ScenePhase {
  const allLoadingDone = LOADING_PHASES.every((p) => phases[p].done)
  if (allLoadingDone) return 'ready'
  return LOADING_PHASES.find((p) => !phases[p].done) ?? 'ready'
}

function freshPhases(): Record<ScenePhase, PhaseState> {
  return SCENE_PHASES.reduce((acc, p) => {
    acc[p] = { progress: p === 'idle' ? 1 : 0, done: p === 'idle' }
    return acc
  }, {} as Record<ScenePhase, PhaseState>)
}

function recompute(phases: Record<ScenePhase, PhaseState>) {
  return { phase: earliestIncomplete(phases), progress: aggregateSceneProgress(phases), phases }
}

export const useSceneLoadStore = create<SceneLoadState>((set) => ({
  phase: 'idle',
  progress: 0,
  phases: freshPhases(),
  errors: [],
  setPhaseProgress: (phase, p) =>
    set((s) => {
      const next = { ...s.phases, [phase]: { progress: Math.max(0, Math.min(1, p)), done: p >= 1 } }
      return recompute(next)
    }),
  completePhase: (phase) =>
    set((s) => recompute({ ...s.phases, [phase]: { progress: 1, done: true } })),
  failZone: (zone, message) => set((s) => ({ errors: [...s.errors, { zone, message }] })),
  retryZone: (zone) => set((s) => ({ errors: s.errors.filter((e) => e.zone !== zone) })),
  reset: () => set({ phase: 'idle', progress: 0, phases: freshPhases(), errors: [] }),
}))

/** Weighted-average progress across zones (0..1). Empty list = 1 (nothing to load). */
export function aggregateZoneProgress(zones: Array<{ progress: number; weight?: number }>): number {
  if (zones.length === 0) return 1
  let sum = 0
  let wsum = 0
  for (const z of zones) {
    const w = z.weight ?? 1
    sum += Math.max(0, Math.min(1, z.progress)) * w
    wsum += w
  }
  return wsum === 0 ? 1 : sum / wsum
}
