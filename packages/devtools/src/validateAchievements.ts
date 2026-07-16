import { buildReport, checkRefTypes, error, warning } from './report'
import type { AchievementLike, KnownTypeOptions, ValidationIssue, ValidationReport } from './types'

/** Options for {@link validateAchievements}. */
export interface AchievementValidationOptions extends KnownTypeOptions {
  /** Known event names; `trigger.event` values outside the list warn. */
  knownEvents?: string[]
}

/**
 * Statically validate achievement definitions. Pure and non-throwing.
 *
 * Errors:
 * - duplicate achievement ids
 * - `trigger.count < 1` (the achievement would unlock at zero progress)
 *
 * Warnings:
 * - `trigger` missing entirely. Verified against `@overworld-engine/achievements`:
 *   the schema requires `trigger: AchievementTrigger | null`, where `null`
 *   explicitly means manual-only (valid, no issue). The runtime treats a
 *   missing trigger like `null`, so an omitted field still works but hides
 *   intent — write `trigger: null` explicitly.
 * - `trigger.event` outside `options.knownEvents` (when provided)
 * - reward effect types outside `options.effectTypes` (when provided)
 */
export function validateAchievements(
  defs: AchievementLike[],
  options: AchievementValidationOptions = {}
): ValidationReport {
  const issues: ValidationIssue[] = []
  const seen = new Set<string>()

  for (const def of defs) {
    const source = `achievement:${def.id}`
    if (seen.has(def.id)) {
      issues.push(error(source, 'id', `duplicate achievement id "${def.id}"`))
      continue
    }
    seen.add(def.id)

    if (def.trigger === undefined) {
      issues.push(
        warning(
          source,
          'trigger',
          'trigger is missing; use "trigger: null" explicitly for manual-only achievements'
        )
      )
    } else if (def.trigger !== null) {
      if (def.trigger.count !== undefined && def.trigger.count < 1) {
        issues.push(
          error(source, 'trigger.count', `count must be >= 1 (got ${def.trigger.count})`)
        )
      }
      if (options.knownEvents && !options.knownEvents.includes(def.trigger.event)) {
        issues.push(
          warning(
            source,
            'trigger.event',
            `event "${def.trigger.event}" is not in the provided known-event list`
          )
        )
      }
    }

    checkRefTypes(issues, def.rewards, options.effectTypes, 'effect', source, 'rewards')
  }

  return buildReport(issues)
}
