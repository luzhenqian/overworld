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
  reason: 'missing' | 'envelope-invalid' | 'validator-rejected'
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
    const raw = await backend.readFile(candidate.path)
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
