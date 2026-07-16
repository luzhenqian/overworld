import { create } from 'zustand'

/** Visual flavor of a toast; how it renders is entirely up to the game UI. */
export type ToastVariant = 'info' | 'success' | 'warning' | 'error'

/** Options accepted by {@link ToastState.show}. */
export interface ToastOptions {
  /**
   * Opaque toast content — the framework never interprets it. Games may pass
   * a string, a ReactNode, or any structured payload their renderer handles.
   */
  message: unknown
  /** Defaults to `'info'`. */
  variant?: ToastVariant
  /**
   * Auto-dismiss delay in ms. Defaults to the configured `defaultDuration`.
   * Values <= 0 make the toast sticky (manual dismiss only).
   */
  duration?: number
  /** Optional icon hint (emoji, icon name, …); opaque to the framework. */
  icon?: string
}

/** A queued toast. */
export interface Toast {
  id: string
  message: unknown
  variant: ToastVariant
  duration: number
  icon?: string
  createdAt: number
}

/**
 * Schedules `fn` to run after `ms` milliseconds and returns a cancel
 * function. The default wraps `setTimeout`/`clearTimeout`; inject a manual
 * scheduler for deterministic tests (capture `fn` and fire it yourself).
 */
export type ToastScheduler = (fn: () => void, ms: number) => () => void

/** Global toast queue configuration; see {@link configureToasts}. */
export interface ToastConfig {
  /** Maximum queue length; the oldest toast is dropped when exceeded. */
  max: number
  /** Auto-dismiss delay (ms) used when `show` omits `duration`. */
  defaultDuration: number
  /**
   * Injectable clock returning epoch milliseconds, used for `createdAt`.
   * Inject a deterministic clock for replay-exact tests. @default Date.now
   */
  clock: () => number
  /**
   * Scheduler driving auto-expiry. @default wraps `setTimeout`/`clearTimeout`
   */
  scheduler: ToastScheduler
}

const defaultScheduler: ToastScheduler = (fn, ms) => {
  const timer = setTimeout(fn, ms)
  return () => clearTimeout(timer)
}

const DEFAULT_CONFIG: ToastConfig = {
  max: 5,
  defaultDuration: 3000,
  clock: () => Date.now(),
  scheduler: defaultScheduler,
}

let config: ToastConfig = { ...DEFAULT_CONFIG }

/** Override queue limits/defaults. Unspecified fields keep their current value. */
export function configureToasts(overrides: Partial<ToastConfig>): void {
  config = { ...config, ...overrides }
}

/** Restore the default toast configuration (mainly for tests). */
export function resetToastConfig(): void {
  config = { ...DEFAULT_CONFIG }
}

let idCounter = 0
/** Per-toast auto-expire cancellers, as returned by the configured scheduler. */
const timers = new Map<string, () => void>()

function clearTimer(id: string): void {
  const cancel = timers.get(id)
  if (cancel !== undefined) {
    cancel()
    timers.delete(id)
  }
}

interface ToastState {
  /** Queued toasts, oldest first. */
  toasts: Toast[]
  /** Enqueue a toast; returns its id. Auto-expires after `duration` ms. */
  show: (options: ToastOptions) => string
  /** Remove a toast (cancels its auto-expire timer). */
  dismiss: (id: string) => void
  /** Remove all toasts. */
  dismissAll: () => void
}

/**
 * Headless toast queue. The framework only manages ordering, limits and
 * expiry — rendering is left to the game:
 *
 * ```tsx
 * const toasts = useToastStore((s) => s.toasts)
 * return toasts.map((t) => <MyToast key={t.id} toast={t} />)
 * ```
 */
export const useToastStore = create<ToastState>()((set, get) => ({
  toasts: [],

  show: (options) => {
    const id = `toast_${++idCounter}`
    const toast: Toast = {
      id,
      message: options.message,
      variant: options.variant ?? 'info',
      duration: options.duration ?? config.defaultDuration,
      icon: options.icon,
      createdAt: config.clock(),
    }

    set((state) => {
      const toasts = [...state.toasts, toast]
      // Enforce the queue limit by dropping the oldest toasts.
      while (toasts.length > config.max) {
        const dropped = toasts.shift()
        if (dropped) clearTimer(dropped.id)
      }
      return { toasts }
    })

    if (toast.duration > 0) {
      timers.set(
        id,
        config.scheduler(() => get().dismiss(id), toast.duration)
      )
    }

    return id
  },

  dismiss: (id) => {
    clearTimer(id)
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }))
  },

  dismissAll: () => {
    for (const cancel of timers.values()) cancel()
    timers.clear()
    set({ toasts: [] })
  },
}))
