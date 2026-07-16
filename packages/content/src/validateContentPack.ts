import { validateContent, type ValidationIssue, type ValidationReport } from '@overworld-engine/devtools'
import type { ContentPack, ValidateContentPackOptions } from './types'

/**
 * Validate a {@link ContentPack} as a unit.
 *
 * Runs two things and merges their findings into one report:
 * 1. **Pack metadata** — `id` must be a non-empty string and `version` a finite
 *    number (both errors when missing/malformed).
 * 2. **Content sections** — delegates the pack's `dialogues` / `quests` /
 *    `items` / `achievements` to devtools' `validateContent`, inheriting all its
 *    per-section checks and cross-section rules (e.g. dialogue `quest.start`
 *    effects must reference a quest present in the same pack).
 *
 * Pure and non-throwing. Pass `effectTypes` / `conditionTypes` to also flag
 * refs whose type is not registered (warnings, never errors).
 */
export function validateContentPack(
  pack: ContentPack,
  options: ValidateContentPackOptions = {}
): ValidationReport {
  const metaIssues: ValidationIssue[] = []
  const source = `content-pack:${typeof pack?.id === 'string' && pack.id ? pack.id : '?'}`

  if (typeof pack?.id !== 'string' || pack.id.length === 0) {
    metaIssues.push({
      severity: 'error',
      source: 'content-pack',
      path: 'id',
      message: 'content pack is missing a non-empty string "id"',
    })
  }
  if (typeof pack?.version !== 'number' || !Number.isFinite(pack.version)) {
    metaIssues.push({
      severity: 'error',
      source,
      path: 'version',
      message: 'content pack is missing a finite numeric "version"',
    })
  }

  const contentReport = validateContent(
    {
      dialogues: pack?.dialogues,
      quests: pack?.quests,
      items: pack?.items,
      achievements: pack?.achievements,
    },
    options
  )

  const issues = [...metaIssues, ...contentReport.issues]
  const errors = issues.filter((issue) => issue.severity === 'error')
  const warnings = issues.filter((issue) => issue.severity === 'warning')
  return { issues, errors, warnings, ok: errors.length === 0 }
}
