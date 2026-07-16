import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { persistOptions } from '../persist'
import { createRestStorage, flushRestStorage } from '../restStorage'

/** Build a Response-shaped object without depending on the global Response. */
function response(status: number, body = ''): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(body),
  } as unknown as Response
}

type FetchMock = ReturnType<typeof vi.fn<typeof fetch>>

/** In-memory "server": maps full request URLs to stored bodies. */
function makeServer(initial?: Record<string, string>) {
  const data = new Map<string, string>(Object.entries(initial ?? {}))
  const fetchMock: FetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    if (method === 'GET') {
      const body = data.get(url)
      return body === undefined ? response(404) : response(200, body)
    }
    if (method === 'PUT') {
      data.set(url, String(init?.body))
      return response(204)
    }
    if (method === 'DELETE') {
      const existed = data.delete(url)
      return response(existed ? 204 : 404)
    }
    return response(405)
  })
  return { data, fetchMock }
}

const BASE = 'https://api.test/saves'

describe('createRestStorage', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('getItem GETs the encoded key and returns the body on 200', async () => {
    const { fetchMock } = makeServer({ [`${BASE}/overworld%3Ainventory`]: '{"state":{}}' })
    const storage = createRestStorage({ baseUrl: BASE, fetch: fetchMock })
    await expect(storage.getItem('overworld:inventory')).resolves.toBe('{"state":{}}')
    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE}/overworld%3Ainventory`,
      expect.objectContaining({ method: 'GET' })
    )
  })

  it('getItem returns null on 404 without reporting an error', async () => {
    const { fetchMock } = makeServer()
    const onError = vi.fn()
    const storage = createRestStorage({ baseUrl: BASE, fetch: fetchMock, onError })
    await expect(storage.getItem('missing')).resolves.toBeNull()
    expect(onError).not.toHaveBeenCalled()
  })

  it('getItem swallows non-2xx and network errors via onError and resolves null', async () => {
    const onError = vi.fn()
    const failing: FetchMock = vi.fn(async () => response(500))
    const storage = createRestStorage({ baseUrl: BASE, fetch: failing, onError })
    await expect(storage.getItem('k')).resolves.toBeNull()
    expect(onError).toHaveBeenCalledWith(expect.any(Error), 'get', 'k')

    const throwing: FetchMock = vi.fn(async () => {
      throw new Error('offline')
    })
    const storage2 = createRestStorage({ baseUrl: BASE, fetch: throwing, onError })
    await expect(storage2.getItem('k2')).resolves.toBeNull()
    expect(onError).toHaveBeenCalledWith(expect.any(Error), 'get', 'k2')
  })

  it('debounces setItem per key: 3 rapid writes coalesce into one PUT with the last value', async () => {
    const { data, fetchMock } = makeServer()
    const storage = createRestStorage({ baseUrl: BASE, fetch: fetchMock })
    await storage.setItem('save', 'v1')
    await storage.setItem('save', 'v2')
    await storage.setItem('save', 'v3')
    expect(fetchMock).not.toHaveBeenCalled()

    vi.advanceTimersByTime(300)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE}/save`,
      expect.objectContaining({ method: 'PUT', body: 'v3' })
    )
    await storage.flush()
    expect(data.get(`${BASE}/save`)).toBe('v3')
  })

  it('debounces independently per key', async () => {
    const { data, fetchMock } = makeServer()
    const storage = createRestStorage({ baseUrl: BASE, fetch: fetchMock })
    await storage.setItem('a', '1')
    await storage.setItem('b', '2')
    vi.advanceTimersByTime(300)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    await storage.flush()
    expect(data.get(`${BASE}/a`)).toBe('1')
    expect(data.get(`${BASE}/b`)).toBe('2')
  })

  it('getItem returns the buffered value while a write for the key is pending', async () => {
    const { fetchMock } = makeServer({ [`${BASE}/k`]: 'stale' })
    const storage = createRestStorage({ baseUrl: BASE, fetch: fetchMock })
    await storage.setItem('k', 'fresh')
    await expect(storage.getItem('k')).resolves.toBe('fresh')
    expect(fetchMock).not.toHaveBeenCalled() // answered from the buffer
  })

  it('flush() forces pending writes out immediately and awaits them', async () => {
    const { data, fetchMock } = makeServer()
    const storage = createRestStorage({ baseUrl: BASE, fetch: fetchMock })
    await storage.setItem('save', 'v1')
    await storage.flush()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(data.get(`${BASE}/save`)).toBe('v1')
    // Timer was cancelled: nothing fires later.
    vi.advanceTimersByTime(1000)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    // flushRestStorage is the free-function spelling of storage.flush().
    await expect(flushRestStorage(storage)).resolves.toBeUndefined()
  })

  it('setItem errors are swallowed via onError (PUT failure never rejects)', async () => {
    const onError = vi.fn()
    const failing: FetchMock = vi.fn(async () => response(503))
    const storage = createRestStorage({ baseUrl: BASE, fetch: failing, onError })
    await storage.setItem('k', 'v')
    await storage.flush()
    expect(onError).toHaveBeenCalledWith(expect.any(Error), 'set', 'k')
  })

  it('removeItem DELETEs immediately and cancels a pending write for the key', async () => {
    const { data, fetchMock } = makeServer({ [`${BASE}/k`]: 'old' })
    const storage = createRestStorage({ baseUrl: BASE, fetch: fetchMock })
    await storage.setItem('k', 'new')
    await storage.removeItem('k')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(`${BASE}/k`, expect.objectContaining({ method: 'DELETE' }))
    expect(data.has(`${BASE}/k`)).toBe(false)
    // The cancelled write never fires.
    vi.advanceTimersByTime(1000)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('removeItem treats 404 as success but reports other failures', async () => {
    const onError = vi.fn()
    const { fetchMock } = makeServer()
    const storage = createRestStorage({ baseUrl: BASE, fetch: fetchMock, onError })
    await storage.removeItem('missing') // server answers 404
    expect(onError).not.toHaveBeenCalled()

    const failing: FetchMock = vi.fn(async () => response(500))
    const storage2 = createRestStorage({ baseUrl: BASE, fetch: failing, onError })
    await storage2.removeItem('k')
    expect(onError).toHaveBeenCalledWith(expect.any(Error), 'remove', 'k')
  })

  it('evaluates a headers function per request and merges static headers', async () => {
    const { fetchMock } = makeServer()
    let token = 0
    const storage = createRestStorage({
      baseUrl: BASE,
      fetch: fetchMock,
      headers: () => ({ authorization: `Bearer ${++token}` }),
      debounceMs: 0,
    })
    await storage.getItem('a')
    await storage.getItem('b')
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      expect.any(String),
      expect.objectContaining({ headers: { authorization: 'Bearer 1' } })
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      expect.any(String),
      expect.objectContaining({ headers: { authorization: 'Bearer 2' } })
    )

    const staticStorage = createRestStorage({
      baseUrl: BASE,
      fetch: fetchMock,
      headers: { 'x-player': 'p1' },
    })
    await staticStorage.setItem('k', 'v')
    await staticStorage.flush()
    expect(fetchMock).toHaveBeenLastCalledWith(
      `${BASE}/k`,
      expect.objectContaining({
        method: 'PUT',
        headers: { 'content-type': 'text/plain', 'x-player': 'p1' },
      })
    )
  })

  it('respects a custom keyToPath and strips a trailing slash from baseUrl', async () => {
    const { fetchMock } = makeServer()
    const storage = createRestStorage({
      baseUrl: `${BASE}/`,
      fetch: fetchMock,
      keyToPath: (key) => key.replace(':', '/'),
    })
    await storage.getItem('overworld:inventory')
    expect(fetchMock).toHaveBeenCalledWith(`${BASE}/overworld/inventory`, expect.anything())
  })

  it('plugs into persistOptions and round-trips zustand state through the REST backend', async () => {
    vi.useRealTimers()
    const { data, fetchMock } = makeServer()
    const storage = createRestStorage({ baseUrl: BASE, fetch: fetchMock, debounceMs: 0 })

    interface CounterState {
      count: number
      inc: () => void
    }
    const options = persistOptions<CounterState, { count: number }>({
      name: 'cloud',
      storage: () => storage,
      partialize: (s) => ({ count: s.count }),
    })
    const useStore = create<CounterState>()(
      persist((set) => ({ count: 0, inc: () => set((s) => ({ count: s.count + 1 })) }), options)
    )
    useStore.getState().inc()
    await storage.flush()

    const raw = data.get(`${BASE}/overworld%3Acloud`) as string
    expect(JSON.parse(raw).state).toEqual({ count: 1 })
  })
})
