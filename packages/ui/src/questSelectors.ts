import type { ActiveQuestLike, QuestDefinitionLike } from './engineTypes'

export interface TrackerObjectiveRow {
  id: string
  text: string
  current: number
  target: number
  completed: boolean
}

export interface TrackerRow {
  questId: string
  title: string
  objectives: TrackerObjectiveRow[]
}

/**
 * Join active quests with their definitions into display rows, oldest quest
 * first. Hidden objectives are omitted; actives without a definition are
 * skipped; missing progress defaults to 0.
 */
export function trackerRows(
  definitions: Record<string, QuestDefinitionLike>,
  active: Record<string, ActiveQuestLike>,
  max = Infinity,
): TrackerRow[] {
  return Object.values(active)
    .sort((a, b) => a.startedAt - b.startedAt)
    .flatMap((quest) => {
      const def = definitions[quest.questId]
      if (!def) return []
      return [
        {
          questId: quest.questId,
          title: def.title ?? def.id,
          objectives: def.objectives
            .filter((o) => !o.hidden)
            .map((o) => {
              const progress = quest.objectives[o.id]
              return {
                id: o.id,
                text: o.description ?? o.id,
                current: progress?.current ?? 0,
                target: o.target,
                completed: progress?.completed ?? false,
              }
            }),
        },
      ]
    })
    .slice(0, max)
}
