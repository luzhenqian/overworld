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
