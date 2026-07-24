import { afterEach, describe, expect, it, vi } from 'vitest'
import { createWebSaveFileBackend } from '../webSaveFileBackend'

function stubLocalStorage(): Map<string, string> {
  const backing = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => backing.get(k) ?? null,
    setItem: (k: string, v: string) => void backing.set(k, v),
    removeItem: (k: string) => void backing.delete(k),
  })
  return backing
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('createWebSaveFileBackend', () => {
  it('writes and reads bytes round-trip, under the given prefix', async () => {
    const backing = stubLocalStorage()
    const backend = createWebSaveFileBackend({ prefix: 'test:' })

    await backend.writeFile('slot', new Uint8Array([1, 2, 3]))
    expect(backing.has('test:slot')).toBe(true)
    expect(await backend.readFile('slot')).toEqual(new Uint8Array([1, 2, 3]))
  })

  it('readFile returns null for a missing path', async () => {
    stubLocalStorage()
    expect(await createWebSaveFileBackend().readFile('missing')).toBeNull()
  })

  it('exists reflects presence', async () => {
    stubLocalStorage()
    const backend = createWebSaveFileBackend()
    expect(await backend.exists('slot')).toBe(false)
    await backend.writeFile('slot', new Uint8Array([1]))
    expect(await backend.exists('slot')).toBe(true)
  })

  it('deleteFile removes the entry; is a no-op when missing', async () => {
    stubLocalStorage()
    const backend = createWebSaveFileBackend()
    await backend.writeFile('slot', new Uint8Array([1]))
    await backend.deleteFile('slot')
    expect(await backend.exists('slot')).toBe(false)
    await expect(backend.deleteFile('slot')).resolves.toBeUndefined()
  })

  it('renameFile moves the value and removes the source', async () => {
    stubLocalStorage()
    const backend = createWebSaveFileBackend()
    await backend.writeFile('a', new Uint8Array([9, 9]))

    await backend.renameFile('a', 'b')

    expect(await backend.exists('a')).toBe(false)
    expect(await backend.readFile('b')).toEqual(new Uint8Array([9, 9]))
  })

  it('renameFile throws when the source does not exist', async () => {
    stubLocalStorage()
    await expect(createWebSaveFileBackend().renameFile('missing', 'b')).rejects.toThrow(
      'does not exist'
    )
  })

  it('syncFile is a no-op that resolves', async () => {
    stubLocalStorage()
    await expect(createWebSaveFileBackend().syncFile('slot')).resolves.toBeUndefined()
  })
})
