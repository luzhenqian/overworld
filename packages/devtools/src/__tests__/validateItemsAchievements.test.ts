import { describe, expect, it } from 'vitest'
import type { AchievementLike, ItemLike } from '../types'
import { validateAchievements } from '../validateAchievements'
import { validateItems } from '../validateItems'

describe('validateItems', () => {
  it('accepts valid items with zero issues', () => {
    const report = validateItems(
      [
        { id: 'crystal', stackable: true, maxStack: 99 },
        { id: 'potion', useEffects: [{ type: 'hp.restore', params: { amount: 10 } }] },
      ],
      { effectTypes: ['hp.restore'] }
    )
    expect(report.issues).toEqual([])
    expect(report.ok).toBe(true)
  })

  it('errors on duplicate item ids', () => {
    const report = validateItems([{ id: 'crystal' }, { id: 'crystal' }])
    expect(report.errors.map((issue) => `${issue.source} ${issue.path}`)).toEqual([
      'item:crystal id',
    ])
  })

  it('warns on maxStack < 1', () => {
    const report = validateItems([{ id: 'crystal', maxStack: 0 }])
    expect(report.warnings.map((issue) => issue.path)).toEqual(['maxStack'])
    expect(report.ok).toBe(true)
  })

  it('warns on unknown useEffect types only when a list is provided', () => {
    const items: ItemLike[] = [{ id: 'potion', useEffects: [{ type: 'ghost.effect' }] }]
    expect(validateItems(items).issues).toEqual([])
    const report = validateItems(items, { effectTypes: ['hp.restore'] })
    expect(report.warnings.map((issue) => issue.path)).toEqual(['useEffects[0].type'])
  })
})

describe('validateAchievements', () => {
  it('accepts valid definitions, including trigger: null (manual-only)', () => {
    const report = validateAchievements(
      [
        { id: 'walker', trigger: { event: 'player:moved', amountFrom: 'distance', count: 10 } },
        { id: 'secret', trigger: null, rewards: [{ type: 'gold.add' }] },
      ],
      { effectTypes: ['gold.add'], knownEvents: ['player:moved'] }
    )
    expect(report.issues).toEqual([])
    expect(report.ok).toBe(true)
  })

  it('errors on duplicate achievement ids', () => {
    const report = validateAchievements([
      { id: 'walker', trigger: null },
      { id: 'walker', trigger: null },
    ])
    expect(report.errors.map((issue) => `${issue.source} ${issue.path}`)).toEqual([
      'achievement:walker id',
    ])
  })

  it('errors on trigger.count < 1', () => {
    const report = validateAchievements([
      { id: 'walker', trigger: { event: 'player:moved', count: 0 } },
    ])
    expect(report.errors.map((issue) => issue.path)).toEqual(['trigger.count'])
    // count omitted defaults to 1 in the engine — valid
    expect(
      validateAchievements([{ id: 'ok', trigger: { event: 'player:moved' } }]).issues
    ).toEqual([])
  })

  it('warns when trigger is missing entirely (undefined vs null)', () => {
    const missing: AchievementLike[] = [{ id: 'vague' }]
    const report = validateAchievements(missing)
    expect(report.warnings.map((issue) => issue.path)).toEqual(['trigger'])
    expect(report.ok).toBe(true)
    expect(validateAchievements([{ id: 'explicit', trigger: null }]).issues).toEqual([])
  })

  it('warns on trigger.event outside knownEvents only when provided', () => {
    const defs: AchievementLike[] = [{ id: 'a', trigger: { event: 'custom:event' } }]
    expect(validateAchievements(defs).issues).toEqual([])
    const report = validateAchievements(defs, { knownEvents: ['player:moved'] })
    expect(report.warnings.map((issue) => issue.path)).toEqual(['trigger.event'])
  })

  it('warns on unknown reward effect types only when a list is provided', () => {
    const defs: AchievementLike[] = [
      { id: 'a', trigger: null, rewards: [{ type: 'ghost.effect' }] },
    ]
    expect(validateAchievements(defs).issues).toEqual([])
    const report = validateAchievements(defs, { effectTypes: ['gold.add'] })
    expect(report.warnings.map((issue) => issue.path)).toEqual(['rewards[0].type'])
  })
})
