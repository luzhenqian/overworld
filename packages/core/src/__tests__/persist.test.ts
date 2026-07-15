import { describe, expect, it } from 'vitest'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { createMemoryStorage, persistOptions } from '../persist'

interface CounterState {
  count: number
  transient: number
  inc: () => void
}

describe('persistOptions', () => {
  it('namespaces the storage key and round-trips state through a custom storage', () => {
    const storage = createMemoryStorage()
    const options = persistOptions<CounterState, { count: number }>({
      name: 'counter',
      version: 2,
      storage: () => storage,
      partialize: (s) => ({ count: s.count }),
    })
    expect(options.name).toBe('overworld:counter')

    const useStore = create<CounterState>()(
      persist(
        (set) => ({
          count: 0,
          transient: 7,
          inc: () => set((s) => ({ count: s.count + 1 })),
        }),
        options
      )
    )
    useStore.getState().inc()

    const raw = storage.getItem('overworld:counter') as string
    const saved = JSON.parse(raw)
    expect(saved.state).toEqual({ count: 1 })
    expect(saved.version).toBe(2)
  })

  it('supports a custom prefix', () => {
    const options = persistOptions<{ a: 1 }>({ name: 'x', prefix: 'mygame' })
    expect(options.name).toBe('mygame:x')
  })
})
