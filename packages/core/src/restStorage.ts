import type { StateStorage } from 'zustand/middleware'

/**
 * REST cloud-save storage adapter for zustand's `persist` middleware.
 *
 * zustand's `StateStorage` natively supports async backends (`getItem` may
 * return `Promise<string | null>`), so the storage returned by
 * {@link createRestStorage} plugs straight into `persistOptions`'
 * `storage: () => StateStorage` — `createJSONStorage` handles the async
 * hydration transparently.
 */

/** Configuration for {@link createRestStorage}. */
export interface RestStorageConfig {
  /**
   * Base URL of the save endpoint. Keys are stored at
   * `${baseUrl}/${keyToPath(key)}` (a trailing slash on `baseUrl` is
   * tolerated and stripped).
   */
  baseUrl: string
  /**
   * Fetch implementation, injectable for tests / custom transports.
   * Defaults to `globalThis.fetch`.
   */
  fetch?: typeof fetch
  /**
   * Extra request headers, e.g. an auth token. Pass a function to have it
   * evaluated **per request** (fresh token on every call).
   */
  headers?: Record<string, string> | (() => Record<string, string>)
  /**
   * Map a storage key (e.g. `overworld:inventory`) to the URL path segment.
   * Defaults to `encodeURIComponent`.
   */
  keyToPath?: (key: string) => string
  /**
   * Debounce window for writes, **per key**, trailing edge: bursty zustand
   * writes within the window collapse into a single PUT carrying the last
   * value. Defaults to `300`.
   */
  debounceMs?: number
  /**
   * Called for every failed request (network error or non-2xx response,
   * except a 404 on GET/DELETE which is not an error). Defaults to
   * `console.warn`. Errors are never rethrown — saves must not crash the game.
   */
  onError?: (error: unknown, op: 'get' | 'set' | 'remove', key: string) => void
}

/**
 * The storage returned by {@link createRestStorage}: an async zustand
 * `StateStorage` plus a {@link RestStorage.flush} method for forcing out
 * pending debounced writes.
 */
export interface RestStorage extends StateStorage {
  getItem: (key: string) => Promise<string | null>
  setItem: (key: string, value: string) => Promise<void>
  removeItem: (key: string) => Promise<void>
  /**
   * Immediately perform all pending debounced writes and wait for every
   * in-flight request to settle. Call before the page unloads so the last
   * burst of saves reaches the server (see {@link flushRestStorage}).
   */
  flush: () => Promise<void>
}

/**
 * Create an async, zustand-compatible storage backed by a REST endpoint.
 *
 * REST contract (all URLs are `${baseUrl}/${keyToPath(key)}`):
 *
 * - **GET** — `200` with the raw persisted string as the response body;
 *   `404` when the key does not exist (`getItem` resolves `null`).
 * - **PUT** — request body is the raw string, `content-type: text/plain`.
 * - **DELETE** — removes the key; a `404` counts as success (idempotent).
 *
 * Any other non-2xx status, or a thrown/rejected fetch, is reported to
 * `onError` and swallowed: `getItem` resolves `null`, `setItem` /
 * `removeItem` resolve silently. A failing save server never crashes the
 * game.
 *
 * Write behavior: `setItem` is debounced per key (trailing edge,
 * `debounceMs`, default 300 ms) so rapid zustand updates coalesce into one
 * PUT with the last value. `getItem` for a key with a pending debounced
 * write resolves that buffered value, so reads never go backwards in time.
 * `removeItem` cancels any pending write for the key and issues the DELETE
 * immediately.
 *
 * ```ts
 * const storage = createRestStorage({
 *   baseUrl: 'https://api.example.com/saves',
 *   headers: () => ({ authorization: `Bearer ${getToken()}` }),
 * })
 * const useStore = create<State>()(
 *   persist(initializer, persistOptions({ name: 'inventory', storage: () => storage }))
 * )
 *
 * // Flush-before-unload: don't lose the last debounced burst.
 * window.addEventListener('beforeunload', () => {
 *   void storage.flush()
 * })
 * ```
 */
export function createRestStorage(config: RestStorageConfig): RestStorage {
  const baseUrl = config.baseUrl.replace(/\/+$/, '')
  const fetchFn: typeof fetch = config.fetch ?? ((input, init) => globalThis.fetch(input, init))
  const keyToPath = config.keyToPath ?? encodeURIComponent
  const debounceMs = config.debounceMs ?? 300
  const onError =
    config.onError ??
    ((error: unknown, op: 'get' | 'set' | 'remove', key: string) => {
      console.warn(`[overworld] rest storage: ${op} "${key}" failed`, error)
    })

  /** Writes buffered by the per-key debounce, waiting for their timer. */
  const pending = new Map<string, { timer: ReturnType<typeof setTimeout>; value: string }>()
  /** Requests currently on the wire; flush() awaits them all. */
  const inFlight = new Set<Promise<void>>()

  const urlFor = (key: string): string => `${baseUrl}/${keyToPath(key)}`
  const requestHeaders = (): Record<string, string> =>
    typeof config.headers === 'function' ? config.headers() : { ...(config.headers ?? {}) }

  const track = (promise: Promise<void>): Promise<void> => {
    inFlight.add(promise)
    void promise.finally(() => inFlight.delete(promise))
    return promise
  }

  const put = (key: string, value: string): Promise<void> =>
    track(
      (async () => {
        try {
          const res = await fetchFn(urlFor(key), {
            method: 'PUT',
            headers: { 'content-type': 'text/plain', ...requestHeaders() },
            body: value,
          })
          if (!res.ok) onError(new Error(`HTTP ${res.status}`), 'set', key)
        } catch (error) {
          onError(error, 'set', key)
        }
      })()
    )

  const cancelPending = (key: string): void => {
    const buffered = pending.get(key)
    if (buffered) {
      clearTimeout(buffered.timer)
      pending.delete(key)
    }
  }

  return {
    getItem: async (key) => {
      const buffered = pending.get(key)
      if (buffered) return buffered.value
      try {
        const res = await fetchFn(urlFor(key), { method: 'GET', headers: requestHeaders() })
        if (res.status === 404) return null
        if (!res.ok) {
          onError(new Error(`HTTP ${res.status}`), 'get', key)
          return null
        }
        return await res.text()
      } catch (error) {
        onError(error, 'get', key)
        return null
      }
    },

    setItem: (key, value) => {
      cancelPending(key)
      const timer = setTimeout(() => {
        pending.delete(key)
        void put(key, value)
      }, debounceMs)
      pending.set(key, { timer, value })
      return Promise.resolve()
    },

    removeItem: (key) => {
      cancelPending(key)
      return track(
        (async () => {
          try {
            const res = await fetchFn(urlFor(key), { method: 'DELETE', headers: requestHeaders() })
            if (!res.ok && res.status !== 404) onError(new Error(`HTTP ${res.status}`), 'remove', key)
          } catch (error) {
            onError(error, 'remove', key)
          }
        })()
      )
    },

    flush: async () => {
      for (const [key, buffered] of [...pending]) {
        clearTimeout(buffered.timer)
        pending.delete(key)
        void put(key, buffered.value)
      }
      await Promise.all([...inFlight])
    },
  }
}

/**
 * Force out all pending debounced writes of a {@link RestStorage} and wait
 * for in-flight requests to settle. Equivalent to `storage.flush()` — a
 * free-function spelling for call sites that only hold the storage:
 *
 * ```ts
 * window.addEventListener('beforeunload', () => {
 *   void flushRestStorage(storage)
 * })
 * ```
 */
export function flushRestStorage(storage: RestStorage): Promise<void> {
  return storage.flush()
}
