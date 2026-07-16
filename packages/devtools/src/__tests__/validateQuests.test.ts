import { describe, expect, it } from 'vitest'
import type { QuestLike, ValidationReport } from '../types'
import { validateQuests } from '../validateQuests'

function quest(partial: Partial<QuestLike> & { id: string }): QuestLike {
  return {
    autoStart: true,
    objectives: [{ id: 'obj', target: 1 }],
    ...partial,
  }
}

function paths(report: ValidationReport, severity?: 'error' | 'warning'): string[] {
  return report.issues
    .filter((issue) => (severity ? issue.severity === severity : true))
    .map((issue) => `${issue.source} ${issue.path}`)
}

describe('validateQuests', () => {
  it('accepts a valid quest chain with zero issues', () => {
    const report = validateQuests(
      [
        quest({ id: 'a', chainNext: ['b'] }),
        quest({ id: 'b', autoStart: false, prerequisites: { quests: ['a'] } }),
      ],
      { effectTypes: [], conditionTypes: [] }
    )
    expect(report.issues).toEqual([])
    expect(report.ok).toBe(true)
  })

  it('errors on duplicate quest ids', () => {
    const report = validateQuests([quest({ id: 'a' }), quest({ id: 'a' })])
    expect(paths(report, 'error')).toEqual(['quest:a id'])
  })

  it('errors on duplicate objective ids', () => {
    const report = validateQuests([
      quest({
        id: 'a',
        objectives: [
          { id: 'obj', target: 1 },
          { id: 'obj', target: 2 },
        ],
      }),
    ])
    expect(paths(report, 'error')).toEqual(['quest:a objectives.obj'])
  })

  it('errors on zero objectives', () => {
    const report = validateQuests([quest({ id: 'a', objectives: [] })])
    expect(paths(report, 'error')).toEqual(['quest:a objectives'])
  })

  it('errors on objective target < 1', () => {
    const report = validateQuests([quest({ id: 'a', objectives: [{ id: 'obj', target: 0 }] })])
    expect(paths(report, 'error')).toEqual(['quest:a objectives.obj.target'])
  })

  it('errors on unknown prerequisite and chainNext quest ids', () => {
    const report = validateQuests([
      quest({ id: 'a', prerequisites: { quests: ['ghost'] }, chainNext: ['phantom'] }),
    ])
    expect(paths(report, 'error')).toEqual([
      'quest:a prerequisites.quests[0]',
      'quest:a chainNext[0]',
    ])
  })

  it('errors on prerequisite cycles', () => {
    const report = validateQuests([
      quest({ id: 'a', prerequisites: { quests: ['b'] } }),
      quest({ id: 'b', prerequisites: { quests: ['a'] } }),
    ])
    const cycle = report.errors.find((issue) => issue.path === 'prerequisites.quests')
    expect(cycle).toBeDefined()
    expect(cycle?.message).toContain('cycle')
    // acyclic prerequisites do not trigger it
    const clean = validateQuests([
      quest({ id: 'a' }),
      quest({ id: 'b', autoStart: false, prerequisites: { quests: ['a'] }, chainNext: [] }),
    ])
    expect(clean.errors).toEqual([])
  })

  it('errors on a self-referential prerequisite', () => {
    const report = validateQuests([quest({ id: 'a', prerequisites: { quests: ['a'] } })])
    expect(report.errors.some((issue) => issue.message.includes('a -> a'))).toBe(true)
  })

  it('warns on unknown reward/prerequisite-condition types only when lists are provided', () => {
    const quests = [
      quest({
        id: 'a',
        prerequisites: { conditions: [{ type: 'ghost.cond' }] },
        rewards: [{ type: 'ghost.effect' }],
      }),
    ]
    expect(validateQuests(quests).issues).toEqual([])
    const report = validateQuests(quests, { conditionTypes: ['x'], effectTypes: ['y'] })
    expect(paths(report, 'warning')).toEqual([
      'quest:a prerequisites.conditions[0].type',
      'quest:a rewards[0].type',
    ])
  })

  it('warns on trigger.event outside knownEvents only when provided', () => {
    const quests = [
      quest({
        id: 'a',
        objectives: [{ id: 'obj', target: 1, trigger: { event: 'custom:event' } }],
      }),
    ]
    expect(validateQuests(quests).issues).toEqual([])
    const report = validateQuests(quests, { knownEvents: ['player:moved'] })
    expect(paths(report, 'warning')).toEqual(['quest:a objectives.obj.trigger.event'])
    expect(validateQuests(quests, { knownEvents: ['custom:event'] }).issues).toEqual([])
  })

  it('warns on an autoStart quest that is also a chainNext target (double-start risk)', () => {
    const report = validateQuests([
      quest({ id: 'a', chainNext: ['b'] }),
      quest({ id: 'b', autoStart: true }),
    ])
    expect(paths(report, 'warning')).toEqual(['quest:b autoStart'])
  })

  it('warns on quests never started by content, unless externally started', () => {
    const quests = [quest({ id: 'a' }), quest({ id: 'orphan', autoStart: false })]
    const report = validateQuests(quests)
    expect(paths(report, 'warning')).toEqual(['quest:orphan id'])
    expect(report.ok).toBe(true) // warning only
    const suppressed = validateQuests(quests, { externallyStartedQuests: ['orphan'] })
    expect(suppressed.issues).toEqual([])
  })
})
