import { invoke } from '@tauri-apps/api/core'
import type { AtomicFileBackend } from '@overworld-engine/core'

const PLUGIN = 'plugin:overworld-savefile'

function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  return invoke<T>(`${PLUGIN}|${command}`, args)
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

/**
 * `AtomicFileBackend` backed by the `overworld-savefile` Tauri plugin.
 * Every method is a single `invoke` round-trip to a Rust command that does
 * exactly one `std::fs` operation — see `src-tauri/src/lib.rs`. Paths are
 * relative to the app's `AppData` directory.
 */
export function createTauriSaveFileBackend(): AtomicFileBackend {
  return {
    async writeFile(path, bytes) {
      await call<void>('savefile_write', { path, bytesBase64: bytesToBase64(bytes) })
    },
    async syncFile(path) {
      await call<void>('savefile_sync', { path })
    },
    async renameFile(from, to) {
      await call<void>('savefile_rename', { from, to })
    },
    async readFile(path) {
      const result = await call<string | null>('savefile_read', { path })
      return result === null ? null : base64ToBytes(result)
    },
    async deleteFile(path) {
      await call<void>('savefile_delete', { path })
    },
    async exists(path) {
      return call<boolean>('savefile_exists', { path })
    },
  }
}
