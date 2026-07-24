import { describe, expect, it } from 'vitest'
import { commitSlot } from '../saveFiles/commitSlot'
import { unwrapEnvelope } from '../saveFiles/envelope'
import { createInMemoryBackend } from './testBackend'

const enc = (s: string) => new TextEncoder().encode(s)
const dec = async (backend: ReturnType<typeof createInMemoryBackend>, path: string) => {
  const raw = await backend.readFile(path)
  if (raw === null) return null
  const payload = await unwrapEnvelope(raw)
  return payload === null ? null : new TextDecoder().decode(payload)
}

describe('commitSlot', () => {
  it('writes the first generation as current, no backups yet', async () => {
    const backend = createInMemoryBackend()
    await commitSlot(backend, 'slot', enc('gen0'))

    expect(await dec(backend, 'slot')).toBe('gen0')
    expect(await backend.exists('slot.bak1')).toBe(false)
    // tmp is consumed by the final atomic renameFile(tmp, path) on success —
    // it only survives when commitSlot aborts (see the read-back-mismatch
    // test below), not on the happy path.
    expect(await backend.exists('slot.tmp')).toBe(false)
  })

  it('rotates backups across three generations (default backupCount=2)', async () => {
    const backend = createInMemoryBackend()
    await commitSlot(backend, 'slot', enc('gen0'))
    await commitSlot(backend, 'slot', enc('gen1'))
    await commitSlot(backend, 'slot', enc('gen2'))

    expect(await dec(backend, 'slot')).toBe('gen2')
    expect(await dec(backend, 'slot.bak1')).toBe('gen1')
    expect(await dec(backend, 'slot.bak2')).toBe('gen0')
  })

  it('honors a custom backupCount', async () => {
    const backend = createInMemoryBackend()
    await commitSlot(backend, 'slot', enc('gen0'), { backupCount: 1 })
    await commitSlot(backend, 'slot', enc('gen1'), { backupCount: 1 })

    expect(await dec(backend, 'slot')).toBe('gen1')
    expect(await dec(backend, 'slot.bak1')).toBe('gen0')
    expect(await backend.exists('slot.bak2')).toBe(false)
  })

  it('aborts without touching current/backups when read-back does not match', async () => {
    const base = createInMemoryBackend()
    await commitSlot(base, 'slot', enc('good'))

    const corrupting = {
      ...base,
      async readFile(path: string) {
        if (path === 'slot.tmp') return enc('corrupted-on-disk')
        return base.readFile(path)
      },
    }

    await expect(commitSlot(corrupting, 'slot', enc('new-data'))).rejects.toThrow(
      'read-back verification failed'
    )
    expect(await dec(base, 'slot')).toBe('good')
    expect(await backend_bak1_absent(base)).toBe(true)
  })
})

async function backend_bak1_absent(backend: ReturnType<typeof createInMemoryBackend>): Promise<boolean> {
  return !(await backend.exists('slot.bak1'))
}
