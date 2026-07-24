import { bytesEqual, wrapEnvelope } from './envelope'
import { backupPath, tmpPath } from './paths'
import type { AtomicFileBackend } from './types'

export interface CommitSlotOptions {
  /** How many rotated backups to keep alongside `current`. @default 2 */
  backupCount?: number
}

/**
 * Durably commit `bytes` as the new `current` generation at `path`:
 * temp write → fsync → read-back verify → rotate existing backups
 * oldest-first → atomic rename into place.
 *
 * Crash-safe at every step: `renameFile` is a single atomic filesystem
 * operation, so no matter where a kill lands, `path` always resolves to
 * either the previous complete generation or the new complete one — never
 * a partial file. See design doc §5 for the full argument.
 */
export async function commitSlot(
  backend: AtomicFileBackend,
  path: string,
  bytes: Uint8Array,
  options?: CommitSlotOptions
): Promise<void> {
  const backupCount = options?.backupCount ?? 2
  const tmp = tmpPath(path)
  const envelope = await wrapEnvelope(bytes)

  await backend.writeFile(tmp, envelope)
  await backend.syncFile(tmp)

  const readBack = await backend.readFile(tmp)
  if (readBack === null || !bytesEqual(readBack, envelope)) {
    throw new Error(`[overworld] commitSlot: read-back verification failed for "${tmp}"`)
  }

  // Rotate oldest-first: at no point does a backup slot go through an
  // "empty" state before being refilled by an already-verified file.
  for (let n = backupCount; n >= 2; n--) {
    const older = backupPath(path, n - 1)
    if (await backend.exists(older)) {
      await backend.renameFile(older, backupPath(path, n))
    }
  }
  if (backupCount >= 1 && (await backend.exists(path))) {
    await backend.renameFile(path, backupPath(path, 1))
  }
  await backend.renameFile(tmp, path)
}
