import { describe, expect, it } from 'vitest'
import {
  pickScene,
  sceneConfigToSceneJson,
  sceneJsonToShellProps,
  type SceneContentProps,
  type SceneJson,
  type SceneProjectLike,
} from '../sceneJson'

// A full scene config exercising every section, optional NPC scale/name, a
// rotated + scaled building, and a decoration group with mixed instances.
const fullConfig: SceneContentProps = {
  npcs: [
    {
      id: 'guide',
      modelPath: '/guide.glb',
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
      modelPath: '/bank.glb',
      position: [0, 0, -8],
      rotation: [0, Math.PI / 2, 0],
      scale: 2,
      collisionRadius: 5,
    },
  ],
  decorationCollisions: {
    tree: {
      radius: 0.8,
      instances: [{ position: [1, 0, 1] }, { position: [2, 0, 2], rotation: [0, 1, 0], scale: 2 }],
    },
  },
}

describe('sceneJson mappers: round-trip identity', () => {
  it('config → json → props deep-equals the config scene fields', () => {
    const json = sceneConfigToSceneJson(fullConfig)
    const props = sceneJsonToShellProps(json)
    expect(props).toEqual(fullConfig)
  })

  it('json → props → back-to-json is stable', () => {
    const json: SceneJson = {
      npcs: fullConfig.npcs,
      buildings: fullConfig.buildings,
      decorations: fullConfig.decorationCollisions,
    }
    const props = sceneJsonToShellProps(json)
    const roundTripped = sceneConfigToSceneJson(props)
    expect(roundTripped).toEqual(json)
  })

  it('preserves the exact NPC/building/decoration values (no data loss)', () => {
    const json = sceneConfigToSceneJson(fullConfig)
    expect(json.npcs).toEqual(fullConfig.npcs)
    expect(json.buildings).toEqual(fullConfig.buildings)
    // decorations is the renamed decorationCollisions
    expect(json.decorations).toEqual(fullConfig.decorationCollisions)
  })
})

describe('sceneJson mappers: decoration group mapping', () => {
  it('renames decorations ↔ decorationCollisions and keeps groups intact', () => {
    const json: SceneJson = {
      npcs: [],
      decorations: {
        lamp: { radius: 1.5, instances: [{ position: [0, 0, 0] }] },
        tree: { radius: 0.8, instances: [{ position: [3, 0, 3] }, { position: [4, 0, 4] }] },
      },
    }
    const props = sceneJsonToShellProps(json)
    expect(props.decorationCollisions).toEqual(json.decorations)
    // and the inverse restores the original decorations key
    expect(sceneConfigToSceneJson(props).decorations).toEqual(json.decorations)
  })
})

describe('sceneJson mappers: empty / optional handling', () => {
  it('omits buildings and decorations when absent (no undefined keys)', () => {
    const config: SceneContentProps = { npcs: [{ id: 'a', modelPath: '', position: [0, 0, 0], rotation: [0, 0, 0] }] }
    const json = sceneConfigToSceneJson(config)
    expect(json).toEqual({ npcs: config.npcs })
    expect('buildings' in json).toBe(false)
    expect('decorations' in json).toBe(false)

    const props = sceneJsonToShellProps(json)
    expect(props).toEqual(config)
    expect('buildings' in props).toBe(false)
    expect('decorationCollisions' in props).toBe(false)
  })

  it('handles a fully empty scene', () => {
    const json = sceneConfigToSceneJson({ npcs: [] })
    expect(json).toEqual({ npcs: [] })
    expect(sceneJsonToShellProps(json)).toEqual({ npcs: [] })
  })

  it('keeps an explicitly empty decoration record', () => {
    const json: SceneJson = { npcs: [], decorations: {} }
    const props = sceneJsonToShellProps(json)
    expect(props.decorationCollisions).toEqual({})
    expect(sceneConfigToSceneJson(props)).toEqual(json)
  })
})

describe('pickScene: select a level out of a multi-scene project', () => {
  const level1: SceneJson = { npcs: [{ id: 'guide', modelPath: '', position: [0, 0, 0], rotation: [0, 0, 0] }] }
  const level2: SceneJson = { npcs: [], buildings: [{ id: 'bank', name: '银行', modelPath: '', position: [0, 0, 0], rotation: [0, 0, 0], scale: 1, collisionRadius: 2 }] }
  const project: SceneProjectLike = {
    version: 1,
    activeSceneId: 'level-1',
    scenes: [
      { id: 'level-1', name: '起始关', scene: level1 },
      { id: 'level-2', name: 'Boss 关', scene: level2 },
    ],
  }

  it('picks by scene id and returns the exact SceneJson', () => {
    expect(pickScene(project, 'level-1')).toBe(level1)
    expect(pickScene(project, 'level-2')).toBe(level2)
  })

  it('falls back to matching by display name when no id matches', () => {
    expect(pickScene(project, 'Boss 关')).toBe(level2)
  })

  it('prefers an id match over a name match', () => {
    const collide: SceneProjectLike = {
      scenes: [
        { id: 'a', name: 'shared', scene: level1 },
        { id: 'shared', name: 'b', scene: level2 },
      ],
    }
    // 'shared' matches the second entry's id before the first entry's name.
    expect(pickScene(collide, 'shared')).toBe(level2)
  })

  it('returns undefined for an unknown id/name or an empty project', () => {
    expect(pickScene(project, 'nope')).toBeUndefined()
    expect(pickScene({ scenes: [] }, 'level-1')).toBeUndefined()
    // Tolerant of loosely-typed input (no scenes array).
    expect(pickScene({} as SceneProjectLike, 'level-1')).toBeUndefined()
  })
})
