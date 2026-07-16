/**
 * WeChat storage as core's `EnumerableStorage`: feed it to
 * `persistOptions({ storage: ... })` and `createSaveSlots({ storage })`
 * exactly like a wrapped `localStorage`.
 */
import type { EnumerableStorage } from '@overworld-engine/core'
import { getWx } from './wxTypes'

/**
 * Create an {@link EnumerableStorage} over the synchronous `wx` storage
 * APIs (`getStorageSync` / `setStorageSync` / `removeStorageSync`, keys
 * enumerated via `getStorageInfoSync().keys`).
 *
 * Note: `wx.getStorageSync` returns `''` for missing keys, so the empty
 * string is not representable and reads as `null` — irrelevant in practice,
 * because the persistence layer only ever stores JSON documents. Non-string
 * values written by other code also read as `null`.
 *
 * @throws outside a WeChat environment (see `getWx`).
 */
export function createWeappStorage(): EnumerableStorage {
  const wx = getWx()
  return {
    getItem: (key) => {
      const value = wx.getStorageSync(key)
      return typeof value === 'string' && value !== '' ? value : null
    },
    setItem: (key, value) => {
      wx.setStorageSync(key, value)
    },
    removeItem: (key) => {
      wx.removeStorageSync(key)
    },
    keys: () => [...wx.getStorageInfoSync().keys],
  }
}
