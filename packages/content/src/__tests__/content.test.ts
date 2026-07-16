import { describe, expect, it, vi } from 'vitest'
import { applyContentPack } from '../applyContentPack'
import { defineContentPack } from '../defineContentPack'
import { createContentPackTracker } from '../tracker'
import { validateContentPack } from '../validateContentPack'
import type { ContentPack, ContentPackTargets } from '../types'

/** A structurally valid pack (passes validateContent) touching all four sections. */
function validPack(overrides: Partial<ContentPack> = {}): ContentPack {
  return {
    id: 'town',
    version: 1,
    dialogues: [
      {
        id: 'elder-intro',
        startNodeId: 'hello',
        nodes: [{ id: 'hello', text: 'hi', endsDialogue: true }] as never,
      },
    ],
    quests: [
      { id: 'welcome', objectives: [{ id: 'talk', target: 1 }] },
    ],
    items: [{ id: 'coin', name: 'Coin' } as never],
    achievements: [{ id: 'first', trigger: null }],
    ...overrides,
  }
}

/** Fresh set of fake engines, each with a spy for its registerX entry point. */
function fakeTargets() {
  const registerDialogues = vi.fn()
  const registerQuests = vi.fn()
  const registerItems = vi.fn()
  const registerAchievements = vi.fn()
  const targets: ContentPackTargets = {
    dialogue: { registerDialogues },
    quest: { registerQuests },
    inventory: { registerItems },
    achievements: { registerAchievements },
  }
  return { targets, registerDialogues, registerQuests, registerItems, registerAchievements }
}

describe('defineContentPack', () => {
  it('returns the same object (identity anchor)', () => {
    const pack = { id: 'a', version: 1 }
    expect(defineContentPack(pack)).toBe(pack)
  })
})

describe('validateContentPack', () => {
  it('passes a well-formed pack', () => {
    const report = validateContentPack(validPack())
    expect(report.ok).toBe(true)
    expect(report.errors).toHaveLength(0)
  })

  it('flags a missing id and non-numeric version as errors', () => {
    const report = validateContentPack({ version: Number.NaN } as unknown as ContentPack)
    expect(report.ok).toBe(false)
    expect(report.errors.some((e) => e.path === 'id')).toBe(true)
    expect(report.errors.some((e) => e.path === 'version')).toBe(true)
  })

  it('delegates section checks to devtools (dangling dialogue next → error)', () => {
    const report = validateContentPack(
      validPack({
        dialogues: [
          {
            id: 'broken',
            startNodeId: 'a',
            nodes: [{ id: 'a', text: 'x', next: 'ghost' }] as never,
          },
        ],
      })
    )
    expect(report.ok).toBe(false)
    expect(report.errors.some((e) => e.message.includes('ghost'))).toBe(true)
  })
})

describe('applyContentPack', () => {
  it('calls each registerX with the right arg shape per section (spread vs array)', () => {
    const pack = validPack()
    const { targets, registerDialogues, registerQuests, registerItems, registerAchievements } =
      fakeTargets()

    const result = applyContentPack(pack, targets)

    expect(result.ok).toBe(true)
    expect(result.applied).toEqual(['dialogues', 'quests', 'items', 'achievements'])

    // quest / dialogue: rest params (spread) — each definition is a separate arg.
    expect(registerDialogues).toHaveBeenCalledTimes(1)
    expect(registerDialogues).toHaveBeenCalledWith(...pack.dialogues!)
    expect(registerQuests).toHaveBeenCalledTimes(1)
    expect(registerQuests).toHaveBeenCalledWith(...pack.quests!)

    // inventory / achievements: a single array argument.
    expect(registerItems).toHaveBeenCalledTimes(1)
    expect(registerItems).toHaveBeenCalledWith(pack.items)
    expect(registerAchievements).toHaveBeenCalledTimes(1)
    expect(registerAchievements).toHaveBeenCalledWith(pack.achievements)
  })

  it('only applies sections present in the pack AND with a matching target', () => {
    const pack: ContentPack = {
      id: 'partial',
      version: 1,
      quests: [{ id: 'q', objectives: [{ id: 'o', target: 1 }] }],
    }
    const { targets, registerQuests, registerDialogues } = fakeTargets()

    const result = applyContentPack(pack, targets)

    expect(result.applied).toEqual(['quests'])
    expect(registerQuests).toHaveBeenCalledTimes(1)
    expect(registerDialogues).not.toHaveBeenCalled()
  })

  it('REFUSES an invalid pack: nothing registered, ok:false, report has errors', () => {
    const invalid: ContentPack = {
      id: 'bad',
      version: 1,
      quests: [{ id: 'oops', objectives: [{ id: 'x', target: 0 }] }], // target < 1 → error
    }
    const { targets, registerQuests, registerDialogues, registerItems, registerAchievements } =
      fakeTargets()

    const result = applyContentPack(invalid, targets)

    expect(result.ok).toBe(false)
    expect(result.applied).toEqual([])
    expect(result.report.errors.length).toBeGreaterThan(0)
    expect(registerQuests).not.toHaveBeenCalled()
    expect(registerDialogues).not.toHaveBeenCalled()
    expect(registerItems).not.toHaveBeenCalled()
    expect(registerAchievements).not.toHaveBeenCalled()
  })

  it('validate:false skips the gate and applies without validating', () => {
    const invalid: ContentPack = {
      id: 'bad',
      version: 1,
      quests: [{ id: 'oops', objectives: [{ id: 'x', target: 0 }] }],
    }
    const { targets, registerQuests } = fakeTargets()

    const result = applyContentPack(invalid, targets, { validate: false })

    expect(result.ok).toBe(true)
    expect(result.applied).toEqual(['quests'])
    expect(result.report.issues).toEqual([]) // validation skipped → empty report
    expect(registerQuests).toHaveBeenCalledTimes(1)
  })
})

describe('createContentPackTracker', () => {
  it('records applied versions per id', () => {
    const tracker = createContentPackTracker()
    tracker.record({ id: 'town', version: 1 })
    tracker.record({ id: 'dungeon', version: 3 })
    expect(tracker.version('town')).toBe(1)
    expect(tracker.version('dungeon')).toBe(3)
    expect(tracker.version('missing')).toBeUndefined()
    expect(tracker.applied).toEqual({ town: 1, dungeon: 3 })
  })

  it('warns on re-applying an older version, not on same/newer', () => {
    const warn = vi.fn()
    const tracker = createContentPackTracker({ warn })

    tracker.record({ id: 'town', version: 2 })
    tracker.record({ id: 'town', version: 3 }) // upgrade → silent
    expect(warn).not.toHaveBeenCalled()

    tracker.record({ id: 'town', version: 1 }) // downgrade → warn
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0]?.[0]).toContain('town')
    expect(tracker.version('town')).toBe(1)
  })
})
