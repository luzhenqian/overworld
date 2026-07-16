import type { ValidationReport } from '@overworld-engine/devtools'
import type { ApplyContentPackOptions, ApplyContentPackResult, ContentPack, ContentPackTargets } from './types'
import { validateContentPack } from './validateContentPack'

/** A passing, empty report — used when validation is explicitly skipped. */
function skippedReport(): ValidationReport {
  return { issues: [], errors: [], warnings: [], ok: true }
}

/**
 * Validate (by default) then apply a {@link ContentPack} into live engines.
 *
 * Unless `options.validate === false`, the pack is validated first via
 * {@link validateContentPack}; if the report has **errors**, the apply is
 * **refused** — nothing is registered and the result is
 * `{ applied: [], report, ok: false }`. Warnings never block.
 *
 * When applying, each present section is registered on its matching target via
 * the engine's own `registerX`, respecting the calling conventions:
 * `registerDialogues(...trees)` and `registerQuests(...quests)` take rest params;
 * `registerItems(items)` and `registerAchievements(defs)` take an array. A
 * section is only applied when both the pack carries it and a target is
 * provided for it; missing targets are silently skipped.
 *
 * Applying is additive and idempotent at the engine level: `registerX` upserts
 * by id and never removes, so re-applying an updated pack hot-swaps definitions
 * without discarding in-progress runtime state (see `docs/guides/content-hmr.md`).
 *
 * @returns `applied` (section names registered), the validation `report`, and
 *   `ok` (false only when validation ran and failed).
 */
export function applyContentPack(
  pack: ContentPack,
  targets: ContentPackTargets,
  options: ApplyContentPackOptions = {}
): ApplyContentPackResult {
  const shouldValidate = options.validate !== false

  const report = shouldValidate
    ? validateContentPack(pack, {
        effectTypes: options.effectTypes,
        conditionTypes: options.conditionTypes,
        knownEvents: options.knownEvents,
        questStartEffectType: options.questStartEffectType,
      })
    : skippedReport()

  if (shouldValidate && !report.ok) {
    return { applied: [], report, ok: false }
  }

  const applied: string[] = []

  if (pack.dialogues && targets.dialogue) {
    targets.dialogue.registerDialogues(...pack.dialogues)
    applied.push('dialogues')
  }
  if (pack.quests && targets.quest) {
    targets.quest.registerQuests(...pack.quests)
    applied.push('quests')
  }
  if (pack.items && targets.inventory) {
    targets.inventory.registerItems(pack.items)
    applied.push('items')
  }
  if (pack.achievements && targets.achievements) {
    targets.achievements.registerAchievements(pack.achievements)
    applied.push('achievements')
  }

  return { applied, report, ok: true }
}
