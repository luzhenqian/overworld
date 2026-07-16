import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { configureToasts, resetToastConfig, useToastStore } from '../toastStore'

const store = () => useToastStore.getState()

/** A manually driven scheduler: records (fn, ms) and lets the test fire/inspect. */
function manualScheduler() {
  const scheduled: { fn: () => void; ms: number; cancelled: boolean }[] = []
  const scheduler = (fn: () => void, ms: number): (() => void) => {
    const entry = { fn, ms, cancelled: false }
    scheduled.push(entry)
    return () => {
      entry.cancelled = true
    }
  }
  return { scheduled, scheduler }
}

beforeEach(() => {
  store().dismissAll()
  resetToastConfig()
})

afterEach(() => {
  store().dismissAll()
  resetToastConfig()
})

describe('clock injection', () => {
  it('stamps createdAt from the injected clock', () => {
    let t = 1000
    configureToasts({ clock: () => t })

    store().show({ message: 'a', duration: 0 })
    t = 2500
    store().show({ message: 'b', duration: 0 })

    expect(store().toasts.map((toast) => toast.createdAt)).toEqual([1000, 2500])
  })
})

describe('scheduler injection', () => {
  it('routes auto-expiry through the injected scheduler and fires manually', () => {
    const { scheduled, scheduler } = manualScheduler()
    configureToasts({ scheduler })

    store().show({ message: 'a', duration: 1234 })
    expect(scheduled).toHaveLength(1)
    expect(scheduled[0]!.ms).toBe(1234)
    expect(store().toasts).toHaveLength(1)

    scheduled[0]!.fn() // manual fire → toast expires
    expect(store().toasts).toHaveLength(0)
  })

  it('does not schedule sticky toasts (duration <= 0)', () => {
    const { scheduled, scheduler } = manualScheduler()
    configureToasts({ scheduler })

    store().show({ message: 'sticky', duration: 0 })
    expect(scheduled).toHaveLength(0)
  })

  it('manual dismiss cancels via the scheduler-returned canceller', () => {
    const { scheduled, scheduler } = manualScheduler()
    configureToasts({ scheduler })

    const id = store().show({ message: 'a', duration: 1000 })
    store().dismiss(id)
    expect(scheduled[0]!.cancelled).toBe(true)
  })

  it('dismissAll cancels every pending canceller', () => {
    const { scheduled, scheduler } = manualScheduler()
    configureToasts({ scheduler })

    store().show({ message: 'a', duration: 1000 })
    store().show({ message: 'b', duration: 2000 })
    store().dismissAll()
    expect(scheduled.every((entry) => entry.cancelled)).toBe(true)
  })

  it('dropping the oldest toast over max cancels its scheduled expiry', () => {
    const { scheduled, scheduler } = manualScheduler()
    configureToasts({ scheduler, max: 1 })

    store().show({ message: 'a', duration: 500 })
    store().show({ message: 'b', duration: 5000 })
    expect(scheduled[0]!.cancelled).toBe(true)
    expect(scheduled[1]!.cancelled).toBe(false)
    expect(store().toasts.map((toast) => toast.message)).toEqual(['b'])
  })
})
