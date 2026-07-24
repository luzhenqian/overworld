import { describe, expect, it } from 'vitest'
import { commitSlot } from '../saveFiles/commitSlot'
import { recoverSlot } from '../saveFiles/recoverSlot'
import { createInMemoryBackend } from './testBackend'

const enc = (s: string) => new TextEncoder().encode(s)
const dec = (bytes: Uint8Array) => new TextDecoder().decode(bytes)

describe('recoverSlot', () => {
  it('returns current when it is valid', async () => {
    const backend = createInMemoryBackend()
    await commitSlot(backend, 'slot', enc('gen0'))

    const outcome = await recoverSlot(backend, 'slot')
    expect(outcome.result?.source).toBe('current')
    expect(dec(outcome.result!.bytes)).toBe('gen0')
    expect(outcome.failures).toEqual([])
  })

  it('falls back to backup1 when current is missing, reporting the failure', async () => {
    const backend = createInMemoryBackend()
    await commitSlot(backend, 'slot', enc('gen1'))
    await commitSlot(backend, 'slot', enc('gen0'))
    await backend.deleteFile('slot')

    const outcome = await recoverSlot(backend, 'slot')
    expect(outcome.result?.source).toBe('backup1')
    expect(dec(outcome.result!.bytes)).toBe('gen1')
    expect(outcome.failures).toEqual([{ path: 'slot', reason: 'missing' }])
  })

  it('falls back to backup2 when current and backup1 are corrupt', async () => {
    const backend = createInMemoryBackend()
    await commitSlot(backend, 'slot', enc('gen0'))
    await commitSlot(backend, 'slot', enc('gen1'))
    await commitSlot(backend, 'slot', enc('gen2'))
    await backend.writeFile('slot', enc('corrupt'))
    await backend.writeFile('slot.bak1', enc('also-corrupt'))

    const outcome = await recoverSlot(backend, 'slot')
    expect(outcome.result?.source).toBe('backup2')
    expect(dec(outcome.result!.bytes)).toBe('gen0')
    expect(outcome.failures).toEqual([
      { path: 'slot', reason: 'envelope-invalid' },
      { path: 'slot.bak1', reason: 'envelope-invalid' },
    ])
  })

  it('returns null with three failures when every generation is unusable', async () => {
    const backend = createInMemoryBackend()
    const outcome = await recoverSlot(backend, 'slot')

    expect(outcome.result).toBeNull()
    expect(outcome.failures).toEqual([
      { path: 'slot', reason: 'missing' },
      { path: 'slot.bak1', reason: 'missing' },
      { path: 'slot.bak2', reason: 'missing' },
    ])
  })

  it('falls back to backup1 when reading current throws (e.g. a permission/I-O error)', async () => {
    const base = createInMemoryBackend()
    await commitSlot(base, 'slot', enc('gen1'))
    await commitSlot(base, 'slot', enc('gen0'))

    const throwing = {
      ...base,
      async readFile(path: string) {
        if (path === 'slot') throw new Error('EACCES: permission denied')
        return base.readFile(path)
      },
    }

    const outcome = await recoverSlot(throwing, 'slot')
    expect(outcome.result?.source).toBe('backup1')
    expect(dec(outcome.result!.bytes)).toBe('gen1')
    expect(outcome.failures).toEqual([{ path: 'slot', reason: 'read-error' }])
  })

  it('honors a caller-supplied isValid, falling back past a physically-valid generation', async () => {
    const backend = createInMemoryBackend()
    await commitSlot(backend, 'slot', enc('good-business-data'))
    await commitSlot(backend, 'slot', enc('bad-business-data'))

    const outcome = await recoverSlot(backend, 'slot', {
      isValid: (bytes) => dec(bytes) === 'good-business-data',
    })

    expect(outcome.result?.source).toBe('backup1')
    expect(dec(outcome.result!.bytes)).toBe('good-business-data')
    expect(outcome.failures).toEqual([{ path: 'slot', reason: 'validator-rejected' }])
  })
})
