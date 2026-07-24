import { describe, expect, it } from 'vitest'
import { commitSlot } from '../saveFiles/commitSlot'
import { unwrapEnvelope } from '../saveFiles/envelope'
import { recoverSlot } from '../saveFiles/recoverSlot'
import { createInMemoryBackend, withFaultAt } from './testBackend'

const enc = (s: string) => new TextEncoder().encode(s)
const dec = async (backend: ReturnType<typeof createInMemoryBackend>, path: string) => {
  const raw = await backend.readFile(path)
  if (raw === null) return null
  const payload = await unwrapEnvelope(raw)
  return payload === null ? null : new TextDecoder().decode(payload)
}
const decBytes = (bytes: Uint8Array) => new TextDecoder().decode(bytes)

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

  it('always leaves a recoverable generation no matter which single backend call is interrupted', async () => {
    // Learn how many backend calls one commitSlot makes once two prior
    // generations already exist — the branch that exercises every rotation step.
    const probe = createInMemoryBackend()
    await commitSlot(probe, 'slot', enc('gen0'))
    await commitSlot(probe, 'slot', enc('gen1'))
    const probeFault = withFaultAt(probe, null)
    await commitSlot(probeFault.backend, 'slot', enc('gen2'))
    const totalCalls = probeFault.callCount()
    expect(totalCalls).toBeGreaterThan(0)

    for (let failAt = 1; failAt <= totalCalls; failAt++) {
      const attempt = createInMemoryBackend()
      await commitSlot(attempt, 'slot', enc('gen0'))
      await commitSlot(attempt, 'slot', enc('gen1'))

      const faulty = withFaultAt(attempt, failAt)
      await commitSlot(faulty.backend, 'slot', enc('gen2')).catch(() => {})

      const outcome = await recoverSlot(attempt, 'slot')
      expect(outcome.result).not.toBeNull()
      expect(['gen1', 'gen2']).toContain(decBytes(outcome.result!.bytes))
    }
  })
})

async function backend_bak1_absent(backend: ReturnType<typeof createInMemoryBackend>): Promise<boolean> {
  return !(await backend.exists('slot.bak1'))
}
