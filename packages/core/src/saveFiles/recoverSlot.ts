import { unwrapEnvelope } from './envelope'
import { backupPath } from './paths'
import type { AtomicFileBackend } from './types'

export interface RecoverResult {
  bytes: Uint8Array
  /** `'current'`, or `` `backup${n}` `` for the nth rotated backup. */
  source: string
}

export interface RecoverFailure {
  path: string
  reason: 'missing' | 'envelope-invalid' | 'validator-rejected' | 'read-error'
}

export interface RecoverOutcome {
  result: RecoverResult | null
  failures: RecoverFailure[]
}

export interface RecoverSlotOptions {
  /** Must match the `backupCount` the slot was written with. @default 2 */
  backupCount?: number
  /** Optional business-level validity check, applied after our own envelope check passes. */
  isValid?: (bytes: Uint8Array) => boolean
}

/**
 * Walk `current → backup1 → backup2 → ...` (newest to oldest), returning the
 * first generation that passes both the physical envelope check and the
 * optional caller-supplied `isValid`. Every rejected candidate is recorded
 * in `failures`, in order, so callers can surface "recovered from backup 2"
 * style messaging.
 *
 * A `readFile` that *throws* (permission error, locked file, I/O error —
 * anything other than "file doesn't exist") is treated the same as any
 * other rejected candidate: it's recorded as a `'read-error'` failure and
 * the walk continues to the next generation, rather than aborting the
 * entire recovery. Surviving exactly this class of failure is the point of
 * having a backup chain.
 */
export async function recoverSlot(
  backend: AtomicFileBackend,
  path: string,
  options?: RecoverSlotOptions
): Promise<RecoverOutcome> {
  const backupCount = options?.backupCount ?? 2
  const failures: RecoverFailure[] = []

  const candidates: { path: string; source: string }[] = [{ path, source: 'current' }]
  for (let n = 1; n <= backupCount; n++) {
    candidates.push({ path: backupPath(path, n), source: `backup${n}` })
  }

  for (const candidate of candidates) {
    let raw: Uint8Array | null
    try {
      raw = await backend.readFile(candidate.path)
    } catch {
      failures.push({ path: candidate.path, reason: 'read-error' })
      continue
    }
    if (raw === null) {
      failures.push({ path: candidate.path, reason: 'missing' })
      continue
    }
    const payload = await unwrapEnvelope(raw)
    if (payload === null) {
      failures.push({ path: candidate.path, reason: 'envelope-invalid' })
      continue
    }
    if (options?.isValid && !options.isValid(payload)) {
      failures.push({ path: candidate.path, reason: 'validator-rejected' })
      continue
    }
    return { result: { bytes: payload, source: candidate.source }, failures }
  }

  return { result: null, failures }
}
