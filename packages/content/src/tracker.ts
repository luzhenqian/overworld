import type { ContentPackTracker } from './types'

/** Options for {@link createContentPackTracker}. */
export interface ContentPackTrackerOptions {
  /** Sink for downgrade warnings. Defaults to `console.warn`. */
  warn?: (message: string) => void
}

/**
 * Create a small in-memory tracker of applied content packs (MVP).
 *
 * Records the last applied `version` per pack `id` and warns when a pack is
 * re-applied at a **lower** version than last seen — a signal that a stale or
 * out-of-order pack is being pushed (e.g. a bad hot-update rollback). Same or
 * higher versions record silently.
 *
 * This is deliberately minimal: it does not persist, dedupe, or gate applies —
 * pair it with {@link applyContentPack} at your update site if you want to act
 * on the warning. State lives only for the tracker instance's lifetime.
 *
 * ```ts
 * const tracker = createContentPackTracker()
 * applyContentPack(v1, targets); tracker.record(v1) // records town@1
 * applyContentPack(v2, targets); tracker.record(v2) // records town@2
 * tracker.record({ id: 'town', version: 1 })         // warns: downgrade 2 → 1
 * ```
 */
export function createContentPackTracker(
  options: ContentPackTrackerOptions = {}
): ContentPackTracker {
  const warn = options.warn ?? ((message: string) => console.warn(message))
  const applied: Record<string, number> = {}

  return {
    applied,
    record(pack) {
      const previous = applied[pack.id]
      if (previous !== undefined && pack.version < previous) {
        warn(
          `[content] content pack "${pack.id}" re-applied at an older version: v${previous} → v${pack.version}`
        )
      }
      applied[pack.id] = pack.version
    },
    version(id) {
      return applied[id]
    },
  }
}
