import { beforeEach, describe, expect, it, vi } from 'vitest'

const invokeMock = vi.fn()
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}))

const { createSteamBridge } = await import('../bridge')

beforeEach(() => {
  invokeMock.mockReset()
})

describe('createSteamBridge', () => {
  it('isAvailable() is false before ready() resolves', () => {
    const steam = createSteamBridge()
    expect(steam.isAvailable()).toBe(false)
  })

  it('ready() resolves true and flips isAvailable() when Steam is available', async () => {
    invokeMock.mockResolvedValueOnce(true) // steam_is_available

    const steam = createSteamBridge()
    const result = await steam.ready()

    expect(result).toBe(true)
    expect(steam.isAvailable()).toBe(true)
    expect(invokeMock).toHaveBeenCalledWith('plugin:steam|steam_is_available', undefined)
  })

  it('ready() resolves false when invoke rejects (no Tauri context / no Steam)', async () => {
    invokeMock.mockRejectedValueOnce(new Error('no Tauri context'))

    const steam = createSteamBridge()
    const result = await steam.ready()

    expect(result).toBe(false)
    expect(steam.isAvailable()).toBe(false)
  })

  it('unlockAchievement/clearAchievement/setStat are no-ops before ready()', () => {
    const steam = createSteamBridge()
    steam.unlockAchievement('FIRST_KILL')
    steam.clearAchievement('FIRST_KILL')
    steam.setStat('enemies_killed', 3)
    expect(invokeMock).not.toHaveBeenCalled()
  })

  it('unlockAchievement invokes steam_unlock_achievement once available', async () => {
    invokeMock.mockResolvedValueOnce(true)
    const steam = createSteamBridge()
    await steam.ready()
    invokeMock.mockClear()

    steam.unlockAchievement('FIRST_KILL')

    expect(invokeMock).toHaveBeenCalledWith('plugin:steam|steam_unlock_achievement', {
      id: 'FIRST_KILL',
    })
  })

  it('clearAchievement invokes steam_clear_achievement once available', async () => {
    invokeMock.mockResolvedValueOnce(true)
    const steam = createSteamBridge()
    await steam.ready()
    invokeMock.mockClear()

    steam.clearAchievement('FIRST_KILL')

    expect(invokeMock).toHaveBeenCalledWith('plugin:steam|steam_clear_achievement', {
      id: 'FIRST_KILL',
    })
  })

  it('setStat invokes steam_set_stat once available', async () => {
    invokeMock.mockResolvedValueOnce(true)
    const steam = createSteamBridge()
    await steam.ready()
    invokeMock.mockClear()

    steam.setStat('enemies_killed', 3)

    expect(invokeMock).toHaveBeenCalledWith('plugin:steam|steam_set_stat', {
      name: 'enemies_killed',
      value: 3,
    })
  })

  it('setRichPresence/clearRichPresence are no-ops before ready(), invoke once available', async () => {
    const steam = createSteamBridge()
    steam.setRichPresence('status', 'Exploring')
    steam.clearRichPresence()
    expect(invokeMock).not.toHaveBeenCalled()

    invokeMock.mockResolvedValueOnce(true)
    await steam.ready()
    invokeMock.mockClear()

    steam.setRichPresence('status', 'Exploring')
    expect(invokeMock).toHaveBeenCalledWith('plugin:steam|steam_set_rich_presence', {
      key: 'status',
      value: 'Exploring',
    })

    steam.clearRichPresence()
    expect(invokeMock).toHaveBeenCalledWith('plugin:steam|steam_clear_rich_presence', undefined)
  })

  it('cloudStorage() is undefined before ready(), defined after ready() succeeds', async () => {
    const steam = createSteamBridge()
    expect(steam.cloudStorage()).toBeUndefined()

    invokeMock.mockResolvedValueOnce(true) // steam_is_available
    invokeMock.mockResolvedValueOnce([]) // steam_cloud_list (hydration, empty)
    await steam.ready()

    expect(steam.cloudStorage()).toBeDefined()
    expect(steam.cloudStorage()?.keys()).toEqual([])
  })

  it('cloudStorage() stays undefined when ready() fails', async () => {
    invokeMock.mockRejectedValueOnce(new Error('no Tauri context'))
    const steam = createSteamBridge()
    await steam.ready()

    expect(steam.cloudStorage()).toBeUndefined()
  })
})
