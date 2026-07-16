import { buildReport, checkRefTypes, error, warning } from './report'
import type { KnownTypeOptions, QuestLike, ValidationIssue, ValidationReport } from './types'

/** Options for {@link validateQuests}. */
export interface QuestValidationOptions extends KnownTypeOptions {
  /**
   * Known event names (framework map plus game extensions). When provided,
   * objective `trigger.event` values outside the list produce warnings.
   */
  knownEvents?: string[]
  /**
   * Quest ids known to be started from outside the quest system (e.g. via
   * dialogue `quest.start` effects). Suppresses the "unreachable quest"
   * warning for those ids. `validateContent` fills this in automatically
   * from dialogue effects.
   */
  externallyStartedQuests?: string[]
}

/**
 * Statically validate quest definitions. Pure and non-throwing.
 *
 * Errors:
 * - duplicate quest ids (duplicates are reported and skipped)
 * - duplicate objective ids within a quest
 * - zero objectives (the quest could never complete)
 * - `objective.target < 1`
 * - `prerequisites.quests` / `chainNext` referencing unknown quest ids
 * - prerequisite cycles (A requires B requires A — such quests can never start)
 *
 * Warnings:
 * - reward effect / prerequisite condition types outside the provided lists
 * - `trigger.event` outside `options.knownEvents` (when provided)
 * - `autoStart` quest that is also someone's `chainNext` (double-start risk)
 * - unreachable quests: no `autoStart`, not in any `chainNext`, and not in
 *   `options.externallyStartedQuests`. Warning only — games may start them
 *   imperatively or from dialogue effects.
 */
export function validateQuests(
  quests: QuestLike[],
  options: QuestValidationOptions = {}
): ValidationReport {
  const issues: ValidationIssue[] = []

  // Deduplicate first; all cross-quest checks operate on first occurrences.
  const questsById = new Map<string, QuestLike>()
  for (const quest of quests) {
    if (questsById.has(quest.id)) {
      issues.push(error(`quest:${quest.id}`, 'id', `duplicate quest id "${quest.id}"`))
      continue
    }
    questsById.set(quest.id, quest)
  }

  const chainTargets = new Map<string, string>() // target id -> first quest chaining to it
  for (const quest of questsById.values()) {
    for (const target of quest.chainNext ?? []) {
      if (!chainTargets.has(target)) chainTargets.set(target, quest.id)
    }
  }
  const externallyStarted = new Set(options.externallyStartedQuests ?? [])

  for (const quest of questsById.values()) {
    const source = `quest:${quest.id}`

    if (quest.objectives.length === 0) {
      issues.push(error(source, 'objectives', 'quest has zero objectives and can never complete'))
    }
    const seenObjectives = new Set<string>()
    for (const objective of quest.objectives) {
      const base = `objectives.${objective.id}`
      if (seenObjectives.has(objective.id)) {
        issues.push(error(source, base, `duplicate objective id "${objective.id}"`))
        continue
      }
      seenObjectives.add(objective.id)
      if (objective.target < 1) {
        issues.push(
          error(source, `${base}.target`, `target must be >= 1 (got ${objective.target})`)
        )
      }
      if (
        objective.trigger &&
        options.knownEvents &&
        !options.knownEvents.includes(objective.trigger.event)
      ) {
        issues.push(
          warning(
            source,
            `${base}.trigger.event`,
            `event "${objective.trigger.event}" is not in the provided known-event list`
          )
        )
      }
    }

    quest.prerequisites?.quests?.forEach((id, index) => {
      if (!questsById.has(id)) {
        issues.push(
          error(source, `prerequisites.quests[${index}]`, `references unknown quest "${id}"`)
        )
      }
    })
    quest.chainNext?.forEach((id, index) => {
      if (!questsById.has(id)) {
        issues.push(error(source, `chainNext[${index}]`, `references unknown quest "${id}"`))
      }
    })

    checkRefTypes(
      issues,
      quest.prerequisites?.conditions,
      options.conditionTypes,
      'condition',
      source,
      'prerequisites.conditions'
    )
    checkRefTypes(issues, quest.rewards, options.effectTypes, 'effect', source, 'rewards')

    if (quest.autoStart && chainTargets.has(quest.id)) {
      issues.push(
        warning(
          source,
          'autoStart',
          `quest auto-starts but is also chainNext of "${chainTargets.get(quest.id)}" (double-start risk)`
        )
      )
    }
    if (!quest.autoStart && !chainTargets.has(quest.id) && !externallyStarted.has(quest.id)) {
      issues.push(
        warning(
          source,
          'id',
          'quest is never started by content (no autoStart, not in any chainNext); make sure the game starts it explicitly'
        )
      )
    }
  }

  detectPrerequisiteCycles(questsById, issues)

  return buildReport(issues)
}

/** DFS cycle detection over `quest -> prerequisites.quests` edges. */
function detectPrerequisiteCycles(
  questsById: Map<string, QuestLike>,
  issues: ValidationIssue[]
): void {
  const state = new Map<string, 'visiting' | 'done'>()
  const stack: string[] = []

  const visit = (id: string): void => {
    state.set(id, 'visiting')
    stack.push(id)
    const prereqs = questsById.get(id)?.prerequisites?.quests ?? []
    for (const dep of prereqs) {
      if (!questsById.has(dep)) continue // unknown ids already reported as errors
      const depState = state.get(dep)
      if (depState === 'visiting') {
        const cycle = [...stack.slice(stack.indexOf(dep)), dep]
        issues.push(
          error(
            `quest:${dep}`,
            'prerequisites.quests',
            `prerequisite cycle: ${cycle.join(' -> ')} (none of these quests can ever start)`
          )
        )
      } else if (depState === undefined) {
        visit(dep)
      }
    }
    stack.pop()
    state.set(id, 'done')
  }

  for (const id of questsById.keys()) {
    if (!state.has(id)) visit(id)
  }
}
