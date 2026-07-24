/**
 * Six single-purpose file primitives. No business semantics — reusable for
 * any hardened-write scenario, not just save games. `commitSlot`/
 * `recoverSlot` orchestrate these into a crash-safe protocol; the
 * primitives themselves stay dumb.
 */
export interface AtomicFileBackend {
  /** Create or wholesale-overwrite a file. No durability guarantee alone — pair with `syncFile`. */
  writeFile(path: string, bytes: Uint8Array): Promise<void>
  /** Force whatever was written to `path` to durable storage (fsync). */
  syncFile(path: string): Promise<void>
  /** Atomic replace: if `to` already exists it is replaced wholesale, never left half-written. */
  renameFile(from: string, to: string): Promise<void>
  /** `null` if `path` does not exist. Never throws for a missing file. */
  readFile(path: string): Promise<Uint8Array | null>
  /** No-op if `path` does not exist. */
  deleteFile(path: string): Promise<void>
  exists(path: string): Promise<boolean>
}
