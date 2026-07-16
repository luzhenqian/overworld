import { describe, expect, it } from 'vitest'
import { validateSceneProject } from '../validateSceneProject'

/** A valid inner scene document (1 NPC — never empty, so no warning). */
function validScene(id = 'guide') {
  return { npcs: [{ id, modelPath: '', position: [0, 0, 0], rotation: [0, 0, 0] }] }
}

/** A valid 2-level project. */
function validProject() {
  return {
    version: 1,
    activeSceneId: 'level-1',
    scenes: [
      { id: 'level-1', name: '起始关', scene: validScene('guide') },
      { id: 'level-2', name: 'Boss 关', scene: validScene('boss') },
    ],
  }
}

describe('validateSceneProject: a valid project passes', () => {
  it('reports ok with no errors and no warnings', () => {
    const report = validateSceneProject(validProject())
    expect(report.ok).toBe(true)
    expect(report.errors).toEqual([])
    expect(report.warnings).toEqual([])
  })

  it('accepts a project without an activeSceneId', () => {
    const project = validProject()
    delete (project as { activeSceneId?: string }).activeSceneId
    expect(validateSceneProject(project).ok).toBe(true)
  })
})

describe('validateSceneProject: root / scenes shape (error)', () => {
  it('errors when the root is not an object', () => {
    for (const bad of [null, undefined, 42, 'x', [1]]) {
      const report = validateSceneProject(bad)
      expect(report.ok).toBe(false)
      expect(report.errors[0]?.message).toMatch(/must be an object/)
    }
  })

  it('errors when scenes is not an array', () => {
    const report = validateSceneProject({ scenes: 'nope' })
    expect(report.ok).toBe(false)
    expect(report.errors[0]?.path).toBe('scenes')
  })
})

describe('validateSceneProject: empty project (error)', () => {
  it('errors on scenes: [] ...', () => {
    const report = validateSceneProject({ scenes: [] })
    expect(report.ok).toBe(false)
    expect(report.errors.some((e) => /no scenes/.test(e.message))).toBe(true)
  })

  it('... and accepts a single-scene project', () => {
    const report = validateSceneProject({ scenes: [{ id: 's', name: 'S', scene: validScene() }] })
    expect(report.ok).toBe(true)
  })
})

describe('validateSceneProject: duplicate scene ids (error)', () => {
  it('errors on a duplicate scene id', () => {
    const report = validateSceneProject({
      scenes: [
        { id: 'dup', name: 'A', scene: validScene('a') },
        { id: 'dup', name: 'B', scene: validScene('b') },
      ],
    })
    expect(report.ok).toBe(false)
    expect(report.errors.some((e) => e.message === 'duplicate scene id "dup"')).toBe(true)
  })

  it('accepts distinct scene ids', () => {
    const report = validateSceneProject({
      scenes: [
        { id: 'a', name: 'A', scene: validScene('a') },
        { id: 'b', name: 'B', scene: validScene('b') },
      ],
    })
    expect(report.errors).toEqual([])
  })
})

describe('validateSceneProject: duplicate scene names (error)', () => {
  it('errors on a duplicate scene name', () => {
    const report = validateSceneProject({
      scenes: [
        { id: 'a', name: 'Same', scene: validScene('a') },
        { id: 'b', name: 'Same', scene: validScene('b') },
      ],
    })
    expect(report.ok).toBe(false)
    expect(report.errors.some((e) => e.message === 'duplicate scene name "Same"')).toBe(true)
  })

  it('accepts distinct scene names', () => {
    const report = validateSceneProject({
      scenes: [
        { id: 'a', name: 'One', scene: validScene('a') },
        { id: 'b', name: 'Two', scene: validScene('b') },
      ],
    })
    expect(report.errors).toEqual([])
  })
})

describe('validateSceneProject: missing scene entry fields (error)', () => {
  it('errors on an entry missing id / name / scene', () => {
    const report = validateSceneProject({ scenes: [{ scene: validScene() }] })
    const paths = report.errors.map((e) => e.path)
    expect(paths).toContain('id')
    expect(paths).toContain('name')
  })

  it('errors on an entry missing its scene document', () => {
    const report = validateSceneProject({ scenes: [{ id: 'a', name: 'A' }] })
    expect(report.errors.some((e) => e.path === 'scene')).toBe(true)
  })

  it('errors on a non-object scene entry', () => {
    const report = validateSceneProject({ scenes: [42] })
    expect(report.ok).toBe(false)
    expect(report.errors.some((e) => /must be an object/.test(e.message))).toBe(true)
  })
})

describe('validateSceneProject: activeSceneId (error)', () => {
  it('errors when activeSceneId does not match any scene id', () => {
    const project = validProject()
    project.activeSceneId = 'ghost'
    const report = validateSceneProject(project)
    expect(report.ok).toBe(false)
    expect(report.errors.some((e) => e.path === 'activeSceneId' && /does not match/.test(e.message))).toBe(true)
  })

  it('errors when activeSceneId is not a string', () => {
    const report = validateSceneProject({
      scenes: [{ id: 'a', name: 'A', scene: validScene() }],
      activeSceneId: 42,
    })
    expect(report.errors.some((e) => e.path === 'activeSceneId')).toBe(true)
  })

  it('accepts a matching activeSceneId', () => {
    const report = validateSceneProject({
      scenes: [{ id: 'a', name: 'A', scene: validScene() }],
      activeSceneId: 'a',
    })
    expect(report.errors).toEqual([])
  })
})

describe('validateSceneProject: malformed inner scene (aggregated by scene id)', () => {
  it('errors and attributes inner-scene issues to the owning scene id', () => {
    const report = validateSceneProject({
      scenes: [
        { id: 'level-1', name: 'A', scene: validScene('a') },
        {
          id: 'level-2',
          name: 'B',
          // duplicate npc id inside the inner scene -> validateScene error
          scene: {
            npcs: [
              { id: 'dup', modelPath: '', position: [0, 0, 0] },
              { id: 'dup', modelPath: '', position: [1, 0, 0] },
            ],
          },
        },
      ],
    })
    expect(report.ok).toBe(false)
    const inner = report.errors.find((e) => /duplicate npc id/.test(e.message))
    expect(inner).toBeDefined()
    // Aggregated with source = the owning scene id.
    expect(inner?.source).toBe('level-2')
    // The original per-entity locality is preserved in the path.
    expect(inner?.path).toContain('npc:dup')
  })

  it('errors when the inner scene is not an object (via validateScene)', () => {
    const report = validateSceneProject({ scenes: [{ id: 'a', name: 'A', scene: 42 }] })
    expect(report.ok).toBe(false)
    expect(report.errors.some((e) => e.source === 'a' && /must be an object/.test(e.message))).toBe(true)
  })

  it('surfaces inner-scene warnings (empty scene) attributed to the scene id', () => {
    const report = validateSceneProject({ scenes: [{ id: 'a', name: 'A', scene: { npcs: [] } }] })
    expect(report.ok).toBe(true) // warnings do not fail a report
    expect(report.warnings.some((w) => w.source === 'a' && /no npcs and no buildings/.test(w.message))).toBe(true)
  })

  it('does not report inner errors for well-formed scenes', () => {
    const report = validateSceneProject(validProject())
    expect(report.errors).toEqual([])
  })

  it('forwards knownModelPaths to each inner scene', () => {
    const report = validateSceneProject(
      {
        scenes: [
          { id: 'a', name: 'A', scene: { npcs: [{ id: 'n', modelPath: '/unknown.glb', position: [0, 0, 0] }] } },
        ],
      },
      { knownModelPaths: ['/known.glb'] }
    )
    expect(report.warnings.some((w) => w.source === 'a' && /unknown model path/.test(w.message))).toBe(true)
  })
})
