import { describe, expect, test } from 'vitest'
import { trackerRows } from '../questSelectors'
import type { ActiveQuestLike, QuestDefinitionLike } from '../engineTypes'

const defs: Record<string, QuestDefinitionLike> = {
  herbs: {
    id: 'herbs',
    title: 'Gather Herbs',
    objectives: [
      { id: 'pick', description: 'Pick herbs', target: 3 },
      { id: 'secret', target: 1, hidden: true },
    ],
  },
  rats: { id: 'rats', objectives: [{ id: 'kill', target: 5 }] },
}

const active: Record<string, ActiveQuestLike> = {
  rats: { questId: 'rats', startedAt: 200, objectives: { kill: { current: 2, completed: false } } },
  herbs: {
    questId: 'herbs',
    startedAt: 100,
    objectives: { pick: { current: 3, completed: true }, secret: { current: 0, completed: false } },
  },
}

describe('trackerRows', () => {
  test('orders by startedAt, falls back titles/descriptions to ids, hides hidden objectives', () => {
    const rows = trackerRows(defs, active)
    expect(rows.map((r) => r.questId)).toEqual(['herbs', 'rats'])
    expect(rows[0]!.title).toBe('Gather Herbs')
    expect(rows[0]!.objectives).toEqual([
      { id: 'pick', text: 'Pick herbs', current: 3, target: 3, completed: true },
    ])
    expect(rows[1]!.title).toBe('rats')
    expect(rows[1]!.objectives[0]!.text).toBe('kill')
  })

  test('caps at max and skips actives without definitions', () => {
    const orphan: Record<string, ActiveQuestLike> = {
      ...active,
      ghost: { questId: 'ghost', startedAt: 50, objectives: {} },
    }
    expect(trackerRows(defs, orphan, 1)).toHaveLength(1)
    expect(trackerRows(defs, orphan, 1)[0]!.questId).toBe('herbs')
  })

  test('objective progress missing from active state defaults to 0', () => {
    const partial: Record<string, ActiveQuestLike> = {
      herbs: { questId: 'herbs', startedAt: 1, objectives: {} },
    }
    expect(trackerRows(defs, partial)[0]!.objectives[0]).toEqual({
      id: 'pick',
      text: 'Pick herbs',
      current: 0,
      target: 3,
      completed: false,
    })
  })
})
