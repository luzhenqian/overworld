import { create } from 'zustand'

/** Whether a queued dialog expects a boolean answer or just acknowledgement. */
export type AlertKind = 'alert' | 'confirm'

/** Options for {@link alert} and {@link confirm}. All content is opaque. */
export interface AlertOptions {
  /** Optional heading; opaque to the framework. */
  title?: unknown
  /** Dialog body; opaque to the framework. */
  message: unknown
  /** Label hint for the confirm/OK action. */
  confirmLabel?: string
  /** Label hint for the cancel action (confirm dialogs). */
  cancelLabel?: string
}

/** A dialog waiting for (or currently awaiting) user action. */
export interface PendingAlert extends AlertOptions {
  id: string
  kind: AlertKind
}

const resolvers = new Map<string, (result: boolean) => void>()
let idCounter = 0

interface AlertState {
  /** All pending dialogs, current first. */
  queue: PendingAlert[]
  /** The dialog the UI should render right now, or `null`. */
  current: PendingAlert | null
  /**
   * Resolve the current dialog with the user's answer and advance the queue.
   * `result` defaults to `false` (dismissal counts as cancel); it is ignored
   * for `alert`-kind dialogs, whose promises resolve with `void`.
   */
  resolveCurrent: (result?: boolean) => void
}

/**
 * Headless alert/confirm queue. The game renders `current` however it likes
 * and calls `resolveCurrent(...)` on user action, which settles the promise
 * returned by {@link alert} / {@link confirm}:
 *
 * ```tsx
 * const current = useAlertStore((s) => s.current)
 * const resolveCurrent = useAlertStore((s) => s.resolveCurrent)
 * if (!current) return null
 * return <MyDialog data={current} onConfirm={() => resolveCurrent(true)} />
 * ```
 */
export const useAlertStore = create<AlertState>()((set, get) => ({
  queue: [],
  current: null,

  resolveCurrent: (result = false) => {
    const current = get().current
    if (!current) return
    const resolve = resolvers.get(current.id)
    resolvers.delete(current.id)
    set((state) => {
      const queue = state.queue.slice(1)
      return { queue, current: queue[0] ?? null }
    })
    resolve?.(result)
  },
}))

function enqueue(kind: AlertKind, options: AlertOptions): Promise<boolean> {
  const id = `dialog_${++idCounter}`
  const pending: PendingAlert = { ...options, id, kind }
  const promise = new Promise<boolean>((resolve) => resolvers.set(id, resolve))
  useAlertStore.setState((state) => {
    const queue = [...state.queue, pending]
    return { queue, current: queue[0] ?? null }
  })
  return promise
}

/**
 * Show an acknowledgement dialog. Resolves once the user dismisses it
 * (i.e. the game UI calls `resolveCurrent()`).
 */
export function alert(options: AlertOptions): Promise<void> {
  return enqueue('alert', options).then(() => undefined)
}

/**
 * Ask the user a yes/no question. Resolves with the value the game UI passes
 * to `resolveCurrent(result)` — `true` for confirm, `false` for cancel.
 *
 * ```ts
 * if (await confirm({ message: 'Sell all items?' })) { ... }
 * ```
 */
export function confirm(options: AlertOptions): Promise<boolean> {
  return enqueue('confirm', options)
}
