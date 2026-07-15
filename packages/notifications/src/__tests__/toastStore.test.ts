import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { configureToasts, resetToastConfig, useToastStore } from '../toastStore'

const store = () => useToastStore.getState()

beforeEach(() => {
  vi.useFakeTimers()
  store().dismissAll()
  resetToastConfig()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('show / dismiss', () => {
  it('enqueues toasts in order and returns unique ids', () => {
    const a = store().show({ message: 'first' })
    const b = store().show({ message: 'second', variant: 'success', icon: '✓' })

    expect(a).not.toBe(b)
    const toasts = store().toasts
    expect(toasts.map((t) => t.message)).toEqual(['first', 'second'])
    expect(toasts[0]!.variant).toBe('info') // default variant
    expect(toasts[1]!.variant).toBe('success')
    expect(toasts[1]!.icon).toBe('✓')
  })

  it('keeps the message opaque', () => {
    const payload = { node: 'anything', count: 3 }
    store().show({ message: payload, duration: 0 })
    expect(store().toasts[0]!.message).toBe(payload)
  })

  it('dismisses a toast by id', () => {
    const a = store().show({ message: 'a' })
    store().show({ message: 'b' })
    store().dismiss(a)
    expect(store().toasts.map((t) => t.message)).toEqual(['b'])
  })

  it('dismissAll empties the queue', () => {
    store().show({ message: 'a' })
    store().show({ message: 'b' })
    store().dismissAll()
    expect(store().toasts).toHaveLength(0)
  })
})

describe('auto-expire', () => {
  it('removes toasts after their duration', () => {
    store().show({ message: 'short', duration: 1000 })
    store().show({ message: 'long', duration: 5000 })

    vi.advanceTimersByTime(1000)
    expect(store().toasts.map((t) => t.message)).toEqual(['long'])

    vi.advanceTimersByTime(4000)
    expect(store().toasts).toHaveLength(0)
  })

  it('uses the configured defaultDuration when duration is omitted', () => {
    configureToasts({ defaultDuration: 2000 })
    store().show({ message: 'default' })

    vi.advanceTimersByTime(1999)
    expect(store().toasts).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(store().toasts).toHaveLength(0)
  })

  it('duration <= 0 makes a toast sticky', () => {
    store().show({ message: 'sticky', duration: 0 })
    vi.advanceTimersByTime(60_000)
    expect(store().toasts).toHaveLength(1)
  })

  it('manual dismiss cancels the pending timer', () => {
    const id = store().show({ message: 'a', duration: 1000 })
    store().dismiss(id)
    expect(() => vi.advanceTimersByTime(2000)).not.toThrow()
    expect(store().toasts).toHaveLength(0)
  })
})

describe('max queue length', () => {
  it('drops the oldest toast when exceeding max', () => {
    configureToasts({ max: 2 })
    store().show({ message: 'a', duration: 0 })
    store().show({ message: 'b', duration: 0 })
    store().show({ message: 'c', duration: 0 })

    expect(store().toasts.map((t) => t.message)).toEqual(['b', 'c'])
  })

  it('a dropped toast does not later dismiss a live one via its stale timer', () => {
    configureToasts({ max: 1 })
    store().show({ message: 'a', duration: 500 })
    store().show({ message: 'b', duration: 5000 })

    vi.advanceTimersByTime(1000) // 'a' timer would have fired
    expect(store().toasts.map((t) => t.message)).toEqual(['b'])
  })
})
