import type { AtomicFileBackend } from '../saveFiles/types'

/** An in-memory `AtomicFileBackend` for tests: a plain Map keyed by path. */
export function createInMemoryBackend(): AtomicFileBackend {
  const files = new Map<string, Uint8Array>()
  return {
    async writeFile(path, bytes) {
      files.set(path, bytes.slice())
    },
    async syncFile() {
      // No-op: the in-memory map has no separate "durable" state to flush.
    },
    async renameFile(from, to) {
      const value = files.get(from)
      if (value === undefined) {
        throw new Error(`[test] renameFile: "${from}" does not exist`)
      }
      files.set(to, value)
      files.delete(from)
    },
    async readFile(path) {
      return files.get(path) ?? null
    },
    async deleteFile(path) {
      files.delete(path)
    },
    async exists(path) {
      return files.has(path)
    },
  }
}

/**
 * Wrap a backend so the Nth method call across the whole backend (1-indexed,
 * counting every method in call order) throws instead of running —
 * simulating the process being killed at that exact point. Every other call
 * runs normally. Pass `null` to never fail (useful for learning how many
 * calls a scenario makes via `callCount()`).
 */
export function withFaultAt(
  base: AtomicFileBackend,
  failAtCallIndex: number | null
): { backend: AtomicFileBackend; callCount: () => number } {
  let count = 0
  const wrap = <A extends unknown[], R>(fn: (...args: A) => Promise<R>) => {
    return async (...args: A): Promise<R> => {
      count += 1
      if (failAtCallIndex !== null && count === failAtCallIndex) {
        throw new Error(`[test] injected fault at call #${count}`)
      }
      return fn(...args)
    }
  }
  const backend: AtomicFileBackend = {
    writeFile: wrap(base.writeFile.bind(base)),
    syncFile: wrap(base.syncFile.bind(base)),
    renameFile: wrap(base.renameFile.bind(base)),
    readFile: wrap(base.readFile.bind(base)),
    deleteFile: wrap(base.deleteFile.bind(base)),
    exists: wrap(base.exists.bind(base)),
  }
  return { backend, callCount: () => count }
}
