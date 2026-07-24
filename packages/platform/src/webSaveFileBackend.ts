import type { AtomicFileBackend } from '@overworld-engine/core'

export interface WebSaveFileBackendOptions {
  /** `localStorage` key prefix. @default 'overworld:savefile:' */
  prefix?: string
}

/**
 * `AtomicFileBackend` over `localStorage`. `syncFile` is a no-op: browsers
 * give JS no fsync-equivalent, and `localStorage.setItem` already commits
 * synchronously on the calling thread, so there is no separate "flush" step
 * to trigger. `renameFile` copies the value to `to` then removes `from`;
 * because JS is single-threaded, no other code can observe a state where
 * neither key holds the value, and the worst crash-mid-rename outcome is a
 * harmless leftover duplicate under the old key.
 */
export function createWebSaveFileBackend(options?: WebSaveFileBackendOptions): AtomicFileBackend {
  const prefix = options?.prefix ?? 'overworld:savefile:'
  const key = (path: string): string => `${prefix}${path}`

  return {
    async writeFile(path, bytes) {
      localStorage.setItem(key(path), bytesToBase64(bytes))
    },
    async syncFile() {
      // No-op — see module doc.
    },
    async renameFile(from, to) {
      const value = localStorage.getItem(key(from))
      if (value === null) {
        throw new Error(`[overworld] webSaveFileBackend: renameFile "${from}" does not exist`)
      }
      localStorage.setItem(key(to), value)
      localStorage.removeItem(key(from))
    },
    async readFile(path) {
      const value = localStorage.getItem(key(path))
      return value === null ? null : base64ToBytes(value)
    },
    async deleteFile(path) {
      localStorage.removeItem(key(path))
    },
    async exists(path) {
      return localStorage.getItem(key(path)) !== null
    },
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 8192
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}
