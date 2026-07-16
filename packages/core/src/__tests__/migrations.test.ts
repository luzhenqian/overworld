import { describe, expect, it } from 'vitest'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { defineMigrations } from '../migrations'
import { createMemoryStorage, persistOptions } from '../persist'

describe('defineMigrations', () => {
  it('applies every step whose key > fromVersion in ascending order (v0 → v3 runs 1,2,3)', () => {
    const order: number[] = []
    const migrate = defineMigrations({
      1: (s) => {
        order.push(1)
        return { ...s, steps: [...s.steps, 1] }
      },
      2: (s) => {
        order.push(2)
        return { ...s, steps: [...s.steps, 2] }
      },
      3: (s) => {
        order.push(3)
        return { ...s, steps: [...s.steps, 3] }
      },
    })

    const result = migrate({ steps: [] }, 0)

    expect(order).toEqual([1, 2, 3])
    expect(result).toEqual({ steps: [1, 2, 3] })
  })

  it('skips steps at or below fromVersion (already applied)', () => {
    const order: number[] = []
    const migrate = defineMigrations({
      1: (s) => {
        order.push(1)
        return s
      },
      2: (s) => {
        order.push(2)
        return s
      },
      3: (s) => {
        order.push(3)
        return s
      },
    })

    migrate({}, 2) // stored at v2 → only step 3 should run

    expect(order).toEqual([3])
  })

  it('is an identity passthrough when there are no matching migrations', () => {
    const noSteps = defineMigrations({})
    const state = { gold: 10 }
    expect(noSteps(state, 0)).toBe(state)

    // All steps already applied: current version == latest key.
    const migrate = defineMigrations({ 1: (s) => ({ ...s, migrated: true }) })
    const current = { gold: 5 }
    expect(migrate(current, 1)).toBe(current)
  })

  it('handles non-contiguous keys, still ascending', () => {
    const order: number[] = []
    const migrate = defineMigrations({
      5: (s) => {
        order.push(5)
        return { ...s, v: 5 }
      },
      2: (s) => {
        order.push(2)
        return { ...s, v: 2 }
      },
    })

    const result = migrate({ v: 0 }, 0)

    expect(order).toEqual([2, 5]) // sorted ascending regardless of declaration order
    expect(result).toEqual({ v: 5 })
  })

  it('threads state through steps (each sees the previous step output)', () => {
    const migrate = defineMigrations({
      1: (s: { n: number }) => ({ n: s.n + 1 }),
      2: (s: { n: number }) => ({ n: s.n * 10 }),
    })
    expect(migrate({ n: 1 }, 0)).toEqual({ n: 20 }) // (1+1)*10
  })

  it('plugs into persistOptions and upgrades a stale persisted payload on rehydrate', () => {
    const storage = createMemoryStorage()
    // Seed a v0 payload written by an older release: it used `coins`, not `gold`.
    storage.setItem(
      'overworld:wallet',
      JSON.stringify({ state: { coins: 7 }, version: 0 })
    )

    interface WalletState {
      gold: number
    }

    const migrate = defineMigrations({
      1: (s: { coins?: number }) => ({ gold: s.coins ?? 0 }),
    })

    const useStore = create<WalletState>()(
      persist(() => ({ gold: 0 }), {
        ...persistOptions<WalletState>({ name: 'wallet', version: 1, storage: () => storage }),
        migrate,
      })
    )

    expect(useStore.getState().gold).toBe(7) // migrated coins → gold on hydration
  })
})
