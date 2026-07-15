import { create } from 'zustand'

/** A tracked unit of loading work (a phase, an asset group, a single file…). */
export interface LoadingTask {
  id: string
  /** Relative contribution to the overall progress. Defaults to `1`. */
  weight: number
  /** Task-local progress, 0–1. */
  progress: number
  /** Whether the task finished. */
  done: boolean
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

/**
 * Weighted overall progress (0–1) across all tasks.
 * Returns `0` when there are no tasks.
 */
export function computeProgress(tasks: Record<string, LoadingTask>): number {
  let totalWeight = 0
  let accumulated = 0
  for (const task of Object.values(tasks)) {
    totalWeight += task.weight
    accumulated += task.weight * task.progress
  }
  return totalWeight === 0 ? 0 : accumulated / totalWeight
}

function derive(tasks: Record<string, LoadingTask>): {
  tasks: Record<string, LoadingTask>
  progress: number
  isLoading: boolean
} {
  return {
    tasks,
    progress: computeProgress(tasks),
    isLoading: Object.values(tasks).some((task) => !task.done),
  }
}

export interface LoadingState {
  /** All tracked tasks, keyed by id. Cleared via `reset()`. */
  tasks: Record<string, LoadingTask>
  /** Derived weighted overall progress, 0–1. */
  progress: number
  /** Derived: `true` while any task is unfinished. */
  isLoading: boolean

  /**
   * Start (or restart) a task. `weight` scales its contribution to the
   * overall progress relative to other tasks (default `1`).
   */
  beginTask: (id: string, weight?: number) => void
  /** Update a task's local progress (clamped to 0–1). Unknown ids are created. */
  setTaskProgress: (id: string, progress: number) => void
  /** Mark a task finished (progress 1). Unknown ids are created as done. */
  completeTask: (id: string) => void
  /** Drop all tasks and reset derived state. */
  reset: () => void
}

/**
 * Headless loading-progress store. Register any number of weighted tasks
 * (per phase or per asset) and read the derived `progress` / `isLoading`:
 *
 * ```ts
 * const { beginTask, setTaskProgress, completeTask } = useLoadingStore.getState()
 * beginTask('models', 3)
 * beginTask('audio')            // weight 1
 * setTaskProgress('models', 0.5)
 * completeTask('audio')         // progress => (3*0.5 + 1*1) / 4 = 0.625
 * ```
 *
 * Completed tasks stay registered (keeping the total stable) until `reset()`.
 */
export const useLoadingStore = create<LoadingState>()((set) => ({
  tasks: {},
  progress: 0,
  isLoading: false,

  beginTask: (id, weight = 1) => {
    set((state) =>
      derive({
        ...state.tasks,
        [id]: { id, weight: weight > 0 ? weight : 1, progress: 0, done: false },
      })
    )
  },

  setTaskProgress: (id, progress) => {
    set((state) => {
      const existing = state.tasks[id]
      const task: LoadingTask = existing
        ? { ...existing, progress: clamp01(progress) }
        : { id, weight: 1, progress: clamp01(progress), done: false }
      return derive({ ...state.tasks, [id]: task })
    })
  },

  completeTask: (id) => {
    set((state) => {
      const existing = state.tasks[id]
      const task: LoadingTask = existing
        ? { ...existing, progress: 1, done: true }
        : { id, weight: 1, progress: 1, done: true }
      return derive({ ...state.tasks, [id]: task })
    })
  },

  reset: () => set({ tasks: {}, progress: 0, isLoading: false }),
}))
