import { describe, expect, it } from 'vitest'
import type { DialogueTreeLike, ValidationReport } from '../types'
import { validateDialogues } from '../validateDialogues'

function tree(partial: Partial<DialogueTreeLike> & { id: string }): DialogueTreeLike {
  return { startNodeId: 'start', nodes: [{ id: 'start' }], ...partial }
}

function paths(report: ValidationReport, severity?: 'error' | 'warning'): string[] {
  return report.issues
    .filter((issue) => (severity ? issue.severity === severity : true))
    .map((issue) => `${issue.source} ${issue.path}`)
}

describe('validateDialogues', () => {
  it('accepts a valid tree with zero issues', () => {
    const report = validateDialogues([
      {
        id: 'intro',
        startNodeId: 'hello',
        nodes: [
          {
            id: 'hello',
            responses: [
              { id: 'ask', next: 'more' },
              { id: 'bye' },
            ],
          },
          { id: 'more', next: 'end' },
          { id: 'end', endsDialogue: true },
        ],
      },
    ])
    expect(report.issues).toEqual([])
    expect(report.ok).toBe(true)
  })

  it('errors on duplicate tree ids', () => {
    const report = validateDialogues([tree({ id: 'a' }), tree({ id: 'a' })])
    expect(paths(report, 'error')).toEqual(['dialogue:a id'])
  })

  it('errors on duplicate node ids within a tree', () => {
    const report = validateDialogues([
      tree({ id: 'a', nodes: [{ id: 'start' }, { id: 'start' }] }),
    ])
    expect(paths(report, 'error')).toEqual(['dialogue:a nodes.start'])
  })

  it('errors on a missing start node', () => {
    const report = validateDialogues([tree({ id: 'a', startNodeId: 'nope' })])
    expect(paths(report, 'error')).toEqual(['dialogue:a startNodeId'])
  })

  it('errors on node.next referencing a missing node', () => {
    const report = validateDialogues([tree({ id: 'a', nodes: [{ id: 'start', next: 'ghost' }] })])
    expect(paths(report, 'error')).toEqual(['dialogue:a nodes.start.next'])
  })

  it('errors on response.next referencing a missing node', () => {
    const report = validateDialogues([
      tree({ id: 'a', nodes: [{ id: 'start', responses: [{ id: 'r', next: 'ghost' }] }] }),
    ])
    expect(paths(report, 'error')).toEqual(['dialogue:a nodes.start.responses.r.next'])
  })

  it('treats a node with no responses, no next and no endsDialogue as terminal (no issue)', () => {
    // Matches the engine: advance() ends the dialogue (completed) on such nodes.
    const report = validateDialogues([
      tree({ id: 'a', nodes: [{ id: 'start', next: 'last' }, { id: 'last' }] }),
    ])
    expect(report.issues).toEqual([])
  })

  it('warns on unreachable nodes (BFS from startNodeId)', () => {
    const report = validateDialogues([
      tree({
        id: 'a',
        nodes: [{ id: 'start' }, { id: 'orphan', next: 'start' }],
      }),
    ])
    expect(paths(report, 'warning')).toEqual(['dialogue:a nodes.orphan'])
    expect(report.ok).toBe(true) // warnings do not fail
  })

  it('does not treat next on an endsDialogue node as a reachability edge, and warns about the dead next', () => {
    const report = validateDialogues([
      tree({
        id: 'a',
        nodes: [{ id: 'start', endsDialogue: true, next: 'after' }, { id: 'after' }],
      }),
    ])
    expect(paths(report, 'warning')).toEqual([
      'dialogue:a nodes.start.next', // dead next
      'dialogue:a nodes.after', // unreachable because the edge is never followed
    ])
  })

  it('warns on an empty responses array', () => {
    const report = validateDialogues([tree({ id: 'a', nodes: [{ id: 'start', responses: [] }] })])
    expect(paths(report, 'warning')).toEqual(['dialogue:a nodes.start.responses'])
  })

  it('warns on unknown effect/condition types only when lists are provided', () => {
    const trees: DialogueTreeLike[] = [
      tree({
        id: 'a',
        nodes: [
          {
            id: 'start',
            effects: [{ type: 'ghost.effect' }],
            responses: [
              {
                id: 'r',
                conditions: [{ type: 'ghost.condition' }],
                effects: [{ type: 'known.effect' }],
              },
            ],
          },
        ],
      }),
    ]
    expect(validateDialogues(trees).issues).toEqual([])
    const report = validateDialogues(trees, {
      effectTypes: ['known.effect'],
      conditionTypes: ['known.condition'],
    })
    expect(paths(report, 'warning')).toEqual([
      'dialogue:a nodes.start.effects[0].type',
      'dialogue:a nodes.start.responses.r.conditions[0].type',
    ])
  })
})
