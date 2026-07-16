import { buildReport, error, formatReport } from './report'
import type {
  AchievementLike,
  DialogueTreeLike,
  ItemLike,
  KnownTypeOptions,
  QuestLike,
  ValidationIssue,
  ValidationReport,
} from './types'
import { validateAchievements } from './validateAchievements'
import { validateDialogues } from './validateDialogues'
import { validateItems } from './validateItems'
import { validateQuests } from './validateQuests'

/** All content of a game, every section optional. */
export interface ContentBundle {
  dialogues?: DialogueTreeLike[]
  quests?: QuestLike[]
  items?: ItemLike[]
  achievements?: AchievementLike[]
}

/** Options for {@link validateContent}, shared across all validators. */
export interface ContentValidationOptions extends KnownTypeOptions {
  /** Known event names, reused for quest and achievement triggers. */
  knownEvents?: string[]
  /**
   * Effect type that starts a quest by id, used for the cross-check of
   * dialogue effects against quest ids (expects `params.questId`).
   * @default 'quest.start'
   */
  questStartEffectType?: string
}

interface QuestStartRef {
  source: string
  path: string
  questId: unknown
}

/** Collect every dialogue effect ref of the quest-start type. */
function collectQuestStartRefs(dialogues: DialogueTreeLike[], effectType: string): QuestStartRef[] {
  const refs: QuestStartRef[] = []
  for (const tree of dialogues) {
    const source = `dialogue:${tree.id}`
    for (const node of tree.nodes) {
      node.effects?.forEach((effect, index) => {
        if (effect.type === effectType) {
          refs.push({ source, path: `nodes.${node.id}.effects[${index}]`, questId: effect.params?.['questId'] })
        }
      })
      for (const response of node.responses ?? []) {
        response.effects?.forEach((effect, index) => {
          if (effect.type === effectType) {
            refs.push({
              source,
              path: `nodes.${node.id}.responses.${response.id}.effects[${index}]`,
              questId: effect.params?.['questId'],
            })
          }
        })
      }
    }
  }
  return refs
}

/**
 * Validate a whole content bundle: runs every per-section validator with the
 * shared options, plus cross-cutting checks between sections.
 *
 * Cross-cutting checks (only when both sections are provided):
 * - dialogue effects of type `options.questStartEffectType` (default
 *   `'quest.start'`) whose `params.questId` is missing or not a known quest
 *   id → error;
 * - quests started by such dialogue effects are exempt from the
 *   "quest is never started by content" warning.
 *
 * Pure and non-throwing; use {@link assertValidContent} to throw on errors.
 */
export function validateContent(
  content: ContentBundle,
  options: ContentValidationOptions = {}
): ValidationReport {
  const issues: ValidationIssue[] = []
  const questStartEffectType = options.questStartEffectType ?? 'quest.start'

  const questStartRefs = content.dialogues
    ? collectQuestStartRefs(content.dialogues, questStartEffectType)
    : []
  const externallyStartedQuests = questStartRefs
    .map((ref) => ref.questId)
    .filter((id): id is string => typeof id === 'string')

  if (content.dialogues) {
    issues.push(...validateDialogues(content.dialogues, options).issues)
  }
  if (content.quests) {
    issues.push(...validateQuests(content.quests, { ...options, externallyStartedQuests }).issues)
  }
  if (content.items) {
    issues.push(...validateItems(content.items, options).issues)
  }
  if (content.achievements) {
    issues.push(...validateAchievements(content.achievements, options).issues)
  }

  if (content.dialogues && content.quests) {
    const questIds = new Set(content.quests.map((quest) => quest.id))
    for (const ref of questStartRefs) {
      if (typeof ref.questId !== 'string') {
        issues.push(
          error(
            ref.source,
            `${ref.path}.params.questId`,
            `"${questStartEffectType}" effect is missing a string "questId" param`
          )
        )
      } else if (!questIds.has(ref.questId)) {
        issues.push(
          error(
            ref.source,
            `${ref.path}.params.questId`,
            `"${questStartEffectType}" effect references unknown quest "${ref.questId}"`
          )
        )
      }
    }
  }

  return buildReport(issues)
}

/**
 * Run {@link validateContent} and throw an `Error` carrying the formatted
 * report when it contains errors (warnings never throw). Intended for dev
 * boot code and tests:
 *
 * ```ts
 * if (import.meta.env.DEV) {
 *   assertValidContent({ dialogues, quests, items, achievements }, {
 *     effectTypes: effects.types(),
 *     conditionTypes: conditions.types(),
 *   })
 * }
 * ```
 *
 * @returns the report (so callers can still surface warnings).
 */
export function assertValidContent(
  content: ContentBundle,
  options: ContentValidationOptions = {}
): ValidationReport {
  const report = validateContent(content, options)
  if (!report.ok) {
    throw new Error(formatReport(report))
  }
  return report
}
