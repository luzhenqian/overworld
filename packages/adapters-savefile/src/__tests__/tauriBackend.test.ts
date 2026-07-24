import { beforeEach, describe, expect, it, vi } from 'vitest'

const invokeMock = vi.fn()
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}))

const { createTauriSaveFileBackend } = await import('../tauriBackend')

beforeEach(() => {
  invokeMock.mockReset()
})

describe('createTauriSaveFileBackend', () => {
  it('writeFile base64-encodes bytes and invokes savefile_write', async () => {
    invokeMock.mockResolvedValueOnce(undefined)
    const backend = createTauriSaveFileBackend()

    await backend.writeFile('slot', new Uint8Array([1, 2, 3]))

    expect(invokeMock).toHaveBeenCalledWith('plugin:overworld-savefile|savefile_write', {
      path: 'slot',
      bytesBase64: 'AQID',
    })
  })

  it('syncFile invokes savefile_sync', async () => {
    invokeMock.mockResolvedValueOnce(undefined)
    await createTauriSaveFileBackend().syncFile('slot')
    expect(invokeMock).toHaveBeenCalledWith('plugin:overworld-savefile|savefile_sync', { path: 'slot' })
  })

  it('renameFile invokes savefile_rename', async () => {
    invokeMock.mockResolvedValueOnce(undefined)
    await createTauriSaveFileBackend().renameFile('a', 'b')
    expect(invokeMock).toHaveBeenCalledWith('plugin:overworld-savefile|savefile_rename', {
      from: 'a',
      to: 'b',
    })
  })

  it('readFile base64-decodes to bytes, or returns null when missing', async () => {
    invokeMock.mockResolvedValueOnce('AQID')
    expect(await createTauriSaveFileBackend().readFile('slot')).toEqual(new Uint8Array([1, 2, 3]))

    invokeMock.mockResolvedValueOnce(null)
    expect(await createTauriSaveFileBackend().readFile('missing')).toBeNull()
  })

  it('deleteFile invokes savefile_delete', async () => {
    invokeMock.mockResolvedValueOnce(undefined)
    await createTauriSaveFileBackend().deleteFile('slot')
    expect(invokeMock).toHaveBeenCalledWith('plugin:overworld-savefile|savefile_delete', { path: 'slot' })
  })

  it('exists invokes savefile_exists and returns its result', async () => {
    invokeMock.mockResolvedValueOnce(true)
    expect(await createTauriSaveFileBackend().exists('slot')).toBe(true)
    expect(invokeMock).toHaveBeenCalledWith('plugin:overworld-savefile|savefile_exists', { path: 'slot' })
  })
})
