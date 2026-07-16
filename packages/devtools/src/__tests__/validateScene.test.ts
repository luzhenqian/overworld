import { describe, expect, it } from 'vitest'
import { validateScene } from '../validateScene'

/** A valid starter-shaped scene: 2 NPCs + 1 building + a decoration group. */
function validSceneJson() {
  return {
    npcs: [
      {
        id: 'guide',
        modelPath: '/models/guide.glb',
        position: [4, 0, 2],
        rotation: [0, Math.PI, 0],
        scale: 1.2,
        name: '向导',
      },
      { id: 'merchant', modelPath: '', position: [-4, 0, 3], rotation: [0, 0, 0] },
    ],
    buildings: [
      {
        id: 'bank',
        name: '银行',
        modelPath: '/models/bank.glb',
        position: [0, 0, -8],
        rotation: [0, 0, 0],
        scale: 2,
        collisionRadius: 5,
      },
    ],
    decorations: {
      tree: { radius: 0.8, instances: [{ position: [1, 0, 1] }, { position: [2, 0, 2], scale: 1.5 }] },
    },
  }
}

describe('validateScene: a valid scene passes', () => {
  it('reports ok with no errors and no warnings', () => {
    const report = validateScene(validSceneJson())
    expect(report.ok).toBe(true)
    expect(report.errors).toEqual([])
    expect(report.warnings).toEqual([])
  })

  it('accepts a buildings-only or npcs-only scene', () => {
    const npcsOnly = validateScene({ npcs: validSceneJson().npcs })
    expect(npcsOnly.ok).toBe(true)
    expect(npcsOnly.warnings).toEqual([])
  })
})

describe('validateScene: root type (error)', () => {
  it('errors when the root is not an object', () => {
    for (const bad of [null, undefined, 42, 'x', [1, 2]]) {
      const report = validateScene(bad)
      expect(report.ok).toBe(false)
      expect(report.errors[0]?.message).toMatch(/must be an object/)
    }
  })

  it('accepts an object root', () => {
    // An empty object is a valid (if empty) scene — no root error.
    expect(validateScene({ npcs: [{ id: 'a', modelPath: '', position: [0, 0, 0] }] }).errors).toEqual([])
  })
})

describe('validateScene: missing required npc/building fields (error)', () => {
  it('errors on an npc missing id / modelPath / position', () => {
    const report = validateScene({ npcs: [{ rotation: [0, 0, 0] }] })
    const paths = report.errors.map((e) => e.path)
    expect(paths).toContain('id')
    expect(paths).toContain('modelPath')
    expect(paths).toContain('position')
  })

  it('errors on a building missing id / modelPath / position', () => {
    const report = validateScene({ buildings: [{ name: '塔', rotation: [0, 0, 0] }] })
    const paths = report.errors.map((e) => e.path)
    expect(paths).toContain('id')
    expect(paths).toContain('modelPath')
    expect(paths).toContain('position')
  })

  it('does not error when all required fields are present', () => {
    const report = validateScene({
      npcs: [{ id: 'a', modelPath: '', position: [0, 0, 0], rotation: [0, 0, 0] }],
      buildings: [{ id: 'b', modelPath: '', position: [0, 0, 0] }],
    })
    expect(report.errors).toEqual([])
  })
})

describe('validateScene: duplicate ids (error)', () => {
  it('errors on duplicate npc ids and duplicate building ids', () => {
    const report = validateScene({
      npcs: [
        { id: 'dup', modelPath: '', position: [0, 0, 0] },
        { id: 'dup', modelPath: '', position: [1, 0, 0] },
      ],
      buildings: [
        { id: 'b', modelPath: '', position: [0, 0, 0] },
        { id: 'b', modelPath: '', position: [1, 0, 0] },
      ],
    })
    const msgs = report.errors.map((e) => e.message)
    expect(msgs).toContain('duplicate npc id "dup"')
    expect(msgs).toContain('duplicate building id "b"')
  })

  it('accepts distinct ids', () => {
    const report = validateScene({
      npcs: [
        { id: 'a', modelPath: '', position: [0, 0, 0] },
        { id: 'b', modelPath: '', position: [1, 0, 0] },
      ],
    })
    expect(report.errors).toEqual([])
  })
})

describe('validateScene: negative scale / collisionRadius (error)', () => {
  it('errors on negative npc scale, building scale, building collisionRadius, decoration radius, instance scale', () => {
    const report = validateScene({
      npcs: [{ id: 'n', modelPath: '', position: [0, 0, 0], scale: -1 }],
      buildings: [{ id: 'b', modelPath: '', position: [0, 0, 0], scale: -2, collisionRadius: -3 }],
      decorations: { tree: { radius: -1, instances: [{ position: [0, 0, 0], scale: -4 }] } },
    })
    const paths = report.errors.map((e) => e.path)
    expect(paths).toContain('scale') // npc + building
    expect(paths).toContain('collisionRadius')
    expect(paths).toContain('radius')
    expect(paths).toContain('instances[0].scale')
    expect(report.errors.every((e) => /must be >= 0/.test(e.message) || /must be a/.test(e.message))).toBe(true)
  })

  it('accepts zero and positive scale / radius', () => {
    const report = validateScene({
      npcs: [{ id: 'n', modelPath: '', position: [0, 0, 0], scale: 0 }],
      buildings: [{ id: 'b', modelPath: '', position: [0, 0, 0], scale: 1, collisionRadius: 0 }],
    })
    expect(report.errors).toEqual([])
  })
})

describe('validateScene: malformed decoration group (error)', () => {
  it('errors on a group missing instances / radius, and a non-object group', () => {
    const report = validateScene({
      npcs: [{ id: 'n', modelPath: '', position: [0, 0, 0] }],
      decorations: {
        noInstances: { radius: 1 },
        noRadius: { instances: [] },
        notObject: 42,
      },
    })
    const byPath = (p: string) => report.errors.filter((e) => e.path === p)
    expect(byPath('instances').length).toBeGreaterThan(0)
    expect(byPath('radius').length).toBeGreaterThan(0)
    expect(report.errors.some((e) => e.source === 'decoration:notObject')).toBe(true)
  })

  it('accepts a well-formed group', () => {
    const report = validateScene({
      npcs: [{ id: 'n', modelPath: '', position: [0, 0, 0] }],
      decorations: { tree: { radius: 1, instances: [{ position: [0, 0, 0] }] } },
    })
    expect(report.errors).toEqual([])
  })
})

describe('validateScene: empty scene (warning)', () => {
  it('warns when there are no npcs and no buildings', () => {
    const report = validateScene({ npcs: [] })
    expect(report.ok).toBe(true) // warnings do not fail a report
    expect(report.warnings).toHaveLength(1)
    expect(report.warnings[0]?.message).toMatch(/no npcs and no buildings/)
  })

  it('does not warn when the scene has content', () => {
    const report = validateScene({ npcs: [{ id: 'n', modelPath: '', position: [0, 0, 0] }] })
    expect(report.warnings).toEqual([])
  })
})

describe('validateScene: known model paths (opt-in warning)', () => {
  it('warns for a modelPath outside the known list when provided', () => {
    const report = validateScene(
      { npcs: [{ id: 'n', modelPath: '/models/unknown.glb', position: [0, 0, 0] }] },
      { knownModelPaths: ['/models/guide.glb'] }
    )
    expect(report.warnings.some((w) => /unknown model path/.test(w.message))).toBe(true)
  })

  it('does not warn without the list, nor for "" or a known path', () => {
    const noList = validateScene({ npcs: [{ id: 'n', modelPath: '/x.glb', position: [0, 0, 0] }] })
    expect(noList.warnings.filter((w) => /unknown model path/.test(w.message))).toEqual([])

    const known = validateScene(
      {
        npcs: [
          { id: 'a', modelPath: '', position: [0, 0, 0] },
          { id: 'b', modelPath: '/models/guide.glb', position: [1, 0, 0] },
        ],
      },
      { knownModelPaths: ['/models/guide.glb'] }
    )
    expect(known.warnings.filter((w) => /unknown model path/.test(w.message))).toEqual([])
  })
})
