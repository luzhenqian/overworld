import type { SteamFlushableStorage } from './types'

/** Shape of `bridge.ts`'s internal `callInvoke` helper, threaded in so this module never imports `@tauri-apps/api` directly. */
export type InvokeFn = <T>(
  command: string,
  args?: Record<string, unknown>
) => Promise<T | undefined>

/**
 * Hydrate a Steam Cloud-backed {@link SteamFlushableStorage}: lists every
 * existing file, reads each into an in-memory mirror, then returns a
 * storage whose reads are synchronous against that mirror and whose writes
 * update the mirror synchronously while flushing to Steam Cloud through a
 * serialized queue.
 *
 * Mirrors the pattern `@overworld-engine/platform` uses for
 * `createTauriFileStorage`/`createTelegramCloudStorage` (hydrate once,
 * sync reads, queued async writes, awaitable `flush()`), reimplemented
 * locally to avoid depending on `platform` (see the zero-cross-package-import
 * rule in `.dependency-cruiser.cjs`).
 */
export async function createSteamCloudStorage(
  callInvoke: InvokeFn
): Promise<SteamFlushableStorage> {
  const keys = (await callInvoke<string[]>('steam_cloud_list')) ?? []
  const entries = new Map<string, string>()
  for (const key of keys) {
    const value = await callInvoke<string | null>('steam_cloud_read', { key })
    if (typeof value === 'string') entries.set(key, value)
  }

  let pendingWrite: Promise<void> = Promise.resolve()
  const enqueue = (task: () => Promise<void>): void => {
    pendingWrite = pendingWrite.then(task).catch((error: unknown) => {
      console.error('[overworld] adapters-steam: cloud write failed', error)
    })
  }

  return {
    getItem: (key) => entries.get(key) ?? null,

    setItem: (key, value) => {
      entries.set(key, value)
      enqueue(async () => {
        await callInvoke('steam_cloud_write', { key, value })
      })
    },

    removeItem: (key) => {
      if (!entries.delete(key)) return
      enqueue(async () => {
        await callInvoke('steam_cloud_delete', { key })
      })
    },

    keys: () => [...entries.keys()],

    async flush() {
      let tail: Promise<void>
      do {
        tail = pendingWrite
        await tail
      } while (tail !== pendingWrite)
    },
  }
}
