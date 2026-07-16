import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSaveSlots } from '@overworld-engine/core'
import { createWeappStorage } from '../storage'

/** In-memory fake of the synchronous wx storage APIs. */
function makeFakeWxStorage() {
  const store = new Map<string, unknown>()
  return {
    store,
    wx: {
      // wx returns '' for missing keys — modeled faithfully.
      getStorageSync: (key: string) => store.get(key) ?? '',
      setStorageSync: (key: string, value: unknown) => {
        store.set(key, value)
      },
      removeStorageSync: (key: string) => {
        store.delete(key)
      },
      getStorageInfoSync: () => ({ keys: [...store.keys()] }),
    },
  }
}

beforeEach(() => {
  vi.stubGlobal('wx', makeFakeWxStorage().wx)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('createWeappStorage', () => {
  it('throws a helpful error outside a weapp environment', () => {
    vi.unstubAllGlobals()
    expect(() => createWeappStorage()).toThrowError(/wx.*not available/i)
  })

  it('roundtrips values and enumerates keys', () => {
    const { wx } = makeFakeWxStorage()
    vi.stubGlobal('wx', wx)
    const storage = createWeappStorage()

    storage.setItem('overworld:quest', '{"a":1}')
    storage.setItem('overworld:inventory', '{"b":2}')
    expect(storage.getItem('overworld:quest')).toBe('{"a":1}')
    expect(storage.keys().sort()).toEqual(['overworld:inventory', 'overworld:quest'])

    storage.removeItem('overworld:quest')
    expect(storage.getItem('overworld:quest')).toBeNull()
    expect(storage.keys()).toEqual(['overworld:inventory'])
  })

  it('reads missing and non-string values as null', () => {
    const { wx, store } = makeFakeWxStorage()
    vi.stubGlobal('wx', wx)
    store.set('object-key', { nested: true }) // Written by non-Overworld code.
    const storage = createWeappStorage()

    expect(storage.getItem('missing')).toBeNull()
    expect(storage.getItem('object-key')).toBeNull()
  })

  it('serves core createSaveSlots end to end (snapshot / restore / list)', () => {
    const { wx } = makeFakeWxStorage()
    vi.stubGlobal('wx', wx)
    const storage = createWeappStorage()

    storage.setItem('overworld:player', 'level-3')
    const slots = createSaveSlots({ storage })
    slots.saveTo('slot-1')

    storage.setItem('overworld:player', 'level-9')
    expect(slots.loadFrom('slot-1')).toBe(true)
    expect(storage.getItem('overworld:player')).toBe('level-3')
    expect(slots.listSlots().map((s) => s.slot)).toEqual(['slot-1'])
  })
})
