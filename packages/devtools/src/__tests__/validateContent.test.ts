import { describe, expect, it } from 'vitest'
import { formatReport } from '../report'
import type { ContentBundle } from '../validateContent'
import { assertValidContent, validateContent } from '../validateContent'
import { validateQuests } from '../validateQuests'

/** Mirrors the starter example's content shapes (structural compatibility). */
const STARTER: ContentBundle = {
  dialogues: [
    {
      id: 'guide-intro',
      startNodeId: 'hello',
      nodes: [
        {
          id: 'hello',
          responses: [
            { id: 'ask', next: 'explain' },
            {
              id: 'done',
              conditions: [{ type: 'quest.completed', params: { questId: 'gather-crystals' } }],
              next: 'thanks',
            },
            { id: 'bye' },
          ],
        },
        {
          id: 'explain',
          responses: [
            {
              id: 'accept',
              effects: [
                { type: 'quest.start', params: { questId: 'gather-crystals' } },
                { type: 'dialogue.adjustRelationship', params: { npcId: 'guide', delta: 1 } },
              ],
            },
            { id: 'later' },
          ],
        },
        { id: 'thanks', endsDialogue: true },
      ],
    },
  ],
  quests: [
    {
      id: 'welcome',
      autoStart: true,
      objectives: [
        { id: 'walk', target: 20, trigger: { event: 'player:moved', amountFrom: 'distance' } },
        { id: 'talk', target: 1, trigger: { event: 'dialogue:ended' } },
      ],
      rewards: [{ type: 'gold.add', params: { amount: 50 } }],
    },
    {
      id: 'gather-crystals',
      objectives: [{ id: 'collect', target: 3, trigger: { event: 'item:added' } }],
      rewards: [{ type: 'gold.add', params: { amount: 200 } }],
    },
  ],
  items: [{ id: 'crystal', stackable: true, maxStack: 99 }],
  achievements: [
    { id: 'first-steps', trigger: { event: 'player:moved', amountFrom: 'distance', count: 10 } },
  ],
}

const STARTER_OPTIONS = {
  effectTypes: ['quest.start', 'dialogue.adjustRelationship', 'gold.add'],
  conditionTypes: ['quest.completed'],
  knownEvents: ['player:moved', 'dialogue:ended', 'item:added'],
}

describe('validateContent', () => {
  it('passes realistic starter-style content with zero issues', () => {
    const report = validateContent(STARTER, STARTER_OPTIONS)
    expect(report.issues).toEqual([])
    expect(report.ok).toBe(true)
  })

  it('suppresses the never-started quest warning when a dialogue quest.start effect references it', () => {
    // 'gather-crystals' has no autoStart and no chainNext; validating quests
    // alone warns, validating the bundle does not.
    const alone = validateQuests(STARTER.quests ?? [])
    expect(alone.warnings.some((issue) => issue.source === 'quest:gather-crystals')).toBe(true)
    const bundled = validateContent(STARTER, STARTER_OPTIONS)
    expect(bundled.warnings).toEqual([])
  })

  it('cross-checks dialogue quest.start effects against quest ids', () => {
    const content: ContentBundle = {
      dialogues: [
        {
          id: 'd',
          startNodeId: 'n',
          nodes: [
            {
              id: 'n',
              effects: [{ type: 'quest.start', params: { questId: 'ghost' } }],
              responses: [
                { id: 'r', effects: [{ type: 'quest.start' }] }, // missing questId param
              ],
            },
          ],
        },
      ],
      quests: [{ id: 'real', autoStart: true, objectives: [{ id: 'o', target: 1 }] }],
    }
    const report = validateContent(content)
    const crossErrors = report.errors.map((issue) => `${issue.source} ${issue.path}`)
    expect(crossErrors).toContain('dialogue:d nodes.n.effects[0].params.questId')
    expect(crossErrors).toContain('dialogue:d nodes.n.responses.r.effects[0].params.questId')
  })

  it('skips the cross-check when quests are not provided', () => {
    const content: ContentBundle = {
      dialogues: [
        {
          id: 'd',
          startNodeId: 'n',
          nodes: [{ id: 'n', effects: [{ type: 'quest.start', params: { questId: 'ghost' } }] }],
        },
      ],
    }
    expect(validateContent(content).issues).toEqual([])
  })

  it('honors a custom questStartEffectType', () => {
    const content: ContentBundle = {
      dialogues: [
        {
          id: 'd',
          startNodeId: 'n',
          nodes: [{ id: 'n', effects: [{ type: 'myGame.beginQuest', params: { questId: 'ghost' } }] }],
        },
      ],
      quests: [{ id: 'real', autoStart: true, objectives: [{ id: 'o', target: 1 }] }],
    }
    // default type: the effect is not recognized as quest-starting
    expect(validateContent(content).errors).toEqual([])
    const report = validateContent(content, { questStartEffectType: 'myGame.beginQuest' })
    expect(report.errors.map((issue) => issue.path)).toEqual(['nodes.n.effects[0].params.questId'])
  })

  it('aggregates issues from every section', () => {
    const report = validateContent({
      dialogues: [{ id: 'd', startNodeId: 'ghost', nodes: [{ id: 'n' }] }],
      quests: [{ id: 'q', autoStart: true, objectives: [] }],
      items: [{ id: 'i' }, { id: 'i' }],
      achievements: [{ id: 'a', trigger: { event: 'e', count: 0 } }],
    })
    expect(report.errors.map((issue) => issue.source)).toEqual([
      'dialogue:d',
      'quest:q',
      'item:i',
      'achievement:a',
    ])
  })
})

describe('formatReport', () => {
  it('prints a passed line for a clean report', () => {
    expect(formatReport(validateContent(STARTER, STARTER_OPTIONS))).toBe(
      '[overworld] content validation passed (0 issues)'
    )
  })

  it('prints a summary line plus one line per issue', () => {
    const report = validateContent({
      dialogues: [
        {
          id: 'd',
          startNodeId: 'ghost',
          nodes: [{ id: 'n', responses: [] }],
        },
      ],
    })
    expect(formatReport(report)).toBe(
      [
        '[overworld] content validation: 1 error(s), 1 warning(s)',
        '  error dialogue:d startNodeId — start node "ghost" does not exist',
        '  warn  dialogue:d nodes.n.responses — empty responses array; the engine treats this as a linear node — omit "responses" instead',
      ].join('\n')
    )
  })
})

describe('assertValidContent', () => {
  it('does not throw for content with only warnings, and returns the report', () => {
    const content: ContentBundle = {
      quests: [{ id: 'orphan', objectives: [{ id: 'o', target: 1 }] }],
    }
    const report = assertValidContent(content)
    expect(report.ok).toBe(true)
    expect(report.warnings.length).toBe(1)
  })

  it('throws with the formatted report when errors exist', () => {
    const content: ContentBundle = {
      quests: [{ id: 'q', autoStart: true, objectives: [] }],
    }
    expect(() => assertValidContent(content)).toThrowError(/quest:q objectives/)
    expect(() => assertValidContent(content)).toThrowError(/1 error\(s\)/)
  })
})
