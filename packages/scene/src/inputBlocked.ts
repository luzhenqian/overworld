import { inputLock } from '@overworld-engine/core'

/**
 * Resolve the effective input-blocked predicate: the caller's explicit
 * callback if given, otherwise the shared inputLock. This is why a single
 * `inputLock.acquire('dialogue')` blocks movement, the interact key, and the
 * orbit camera at once without per-source wiring.
 */
export function resolveInputBlocked(explicit: (() => boolean) | undefined): () => boolean {
  return explicit ?? (() => inputLock.isLocked())
}
