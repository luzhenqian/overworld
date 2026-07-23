import { describe, expect, it, vi } from 'vitest'
import { createSteamCloudStorage, type InvokeFn } from '../cloudStorage'

describe('createSteamCloudStorage', () => {
  it('hydrates existing keys via steam_cloud_list + steam_cloud_read', async () => {
    const callInvoke = vi.fn(async (command: string, args?: Record<string, unknown>) => {
      if (command === 'steam_cloud_list') return ['overworld:quest']
      if (command === 'steam_cloud_read' && args?.key === 'overworld:quest') return '{"a":1}'
      throw new Error(`unexpected call: ${command}`)
    }) as InvokeFn

    const storage = await createSteamCloudStorage(callInvoke)

    expect(storage.getItem('overworld:quest')).toBe('{"a":1}')
    expect(storage.keys()).toEqual(['overworld:quest'])
    expect(storage.getItem('missing')).toBeNull()
  })

  it('setItem updates the mirror synchronously; flush() awaits steam_cloud_write', async () => {
    const written: Array<[string, string]> = []
    const callInvoke = vi.fn(async (command: string, args?: Record<string, unknown>) => {
      if (command === 'steam_cloud_list') return []
      if (command === 'steam_cloud_write') {
        written.push([args?.key as string, args?.value as string])
        return undefined
      }
      throw new Error(`unexpected call: ${command}`)
    }) as InvokeFn

    const storage = await createSteamCloudStorage(callInvoke)
    storage.setItem('overworld:inventory', '{"b":2}')

    expect(storage.getItem('overworld:inventory')).toBe('{"b":2}')
    expect(written).toEqual([]) // not flushed yet

    await storage.flush()
    expect(written).toEqual([['overworld:inventory', '{"b":2}']])
  })

  it('removeItem deletes from the mirror; flush() awaits steam_cloud_delete', async () => {
    const deleted: string[] = []
    const callInvoke = vi.fn(async (command: string, args?: Record<string, unknown>) => {
      if (command === 'steam_cloud_list') return ['overworld:quest']
      if (command === 'steam_cloud_read') return '{}'
      if (command === 'steam_cloud_delete') {
        deleted.push(args?.key as string)
        return undefined
      }
      throw new Error(`unexpected call: ${command}`)
    }) as InvokeFn

    const storage = await createSteamCloudStorage(callInvoke)
    storage.removeItem('overworld:quest')
    await storage.flush()

    expect(storage.getItem('overworld:quest')).toBeNull()
    expect(deleted).toEqual(['overworld:quest'])
  })

  it('removeItem on a key that was never present does not enqueue a write', async () => {
    const callInvoke = vi.fn(async (command: string) => {
      if (command === 'steam_cloud_list') return []
      throw new Error(`unexpected call: ${command}`)
    }) as InvokeFn

    const storage = await createSteamCloudStorage(callInvoke)
    storage.removeItem('never-existed')
    await storage.flush()

    expect(callInvoke).toHaveBeenCalledTimes(1) // only the initial steam_cloud_list
  })
})
