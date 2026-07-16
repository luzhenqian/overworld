import { beforeEach, describe, expect, it } from 'vitest'
import {
  useEditorStore,
  sceneProjectFromEntries,
  parseSceneProject,
  SCENE_PROJECT_VERSION,
  type EditorEntity,
} from '../editorStore'

/** Reset to the single-default-scene initial state (mirrors the store init). */
function resetStore(): void {
  useEditorStore.setState({
    enabled: false,
    mode: 'select',
    placingKind: 'npc',
    entities: [],
    selectedIds: [],
    selectedId: null,
    snap: 0.5,
    showGrid: true,
    canUndo: false,
    canRedo: false,
    counters: { npc: 0, building: 0, decoration: 0 },
    past: [],
    future: [],
    pendingSnapshot: null,
    scenes: [{ id: 'scene-1', name: 'Scene 1', entities: [] }],
    activeSceneId: 'scene-1',
  })
}

beforeEach(resetStore)

function state() {
  return useEditorStore.getState()
}

describe('initial project state (single default scene)', () => {
  it('starts with one scene wrapping the active working set', () => {
    expect(state().scenes).toEqual([{ id: 'scene-1', name: 'Scene 1', entities: [] }])
    expect(state().activeSceneId).toBe('scene-1')
  })

  it('single-scene behaviour still operates on the active scene', () => {
    state().addEntity({ kind: 'npc', position: [1, 0, 2] })
    expect(state().entities).toHaveLength(1)
    // exportProject folds live entities into the active scene without switching.
    const project = state().exportProject()
    expect(project.scenes).toHaveLength(1)
    expect(project.scenes[0]?.scene.npcs).toHaveLength(1)
    // The store is untouched by the pure read.
    expect(state().activeSceneId).toBe('scene-1')
    expect(state().entities).toHaveLength(1)
  })
})

describe('newScene', () => {
  it('creates a new empty scene, switches to it, and persists the previous one', () => {
    state().addEntity({ kind: 'npc', position: [1, 0, 1] })
    const created = state().newScene('Level 2')
    expect(created.name).toBe('Level 2')
    expect(created.id).toBe('scene-2')
    expect(state().activeSceneId).toBe('scene-2')
    // The new scene is empty; the previous scene kept its entity.
    expect(state().entities).toEqual([])
    const prev = state().scenes.find((s) => s.id === 'scene-1')
    expect(prev?.entities).toHaveLength(1)
  })

  it('defaults the name to a unique "Scene N" and de-duplicates provided names', () => {
    state().newScene()
    expect(state().scenes.map((s) => s.name)).toEqual(['Scene 1', 'Scene 2'])
    // A duplicate provided name is disambiguated.
    const dup = state().newScene('Scene 1')
    expect(dup.name).toBe('Scene 1 2')
  })

  it('is a history boundary: the new scene starts with an empty history', () => {
    state().addEntity({ kind: 'npc' })
    expect(state().canUndo).toBe(true)
    state().newScene()
    expect(state().canUndo).toBe(false)
    expect(state().past).toEqual([])
  })
})

describe('switchScene', () => {
  it('persists current entities and loads the target scene', () => {
    state().addEntity({ kind: 'npc', position: [5, 0, 5], name: 'A' })
    state().newScene('B') // now on scene-2 (empty)
    state().addEntity({ kind: 'building', position: [9, 0, 9] })
    // Back to scene-1: its single NPC returns.
    state().switchScene('scene-1')
    expect(state().activeSceneId).toBe('scene-1')
    expect(state().entities.map((e) => e.id)).toEqual(['npc-1'])
    expect(state().entities[0]?.name).toBe('A')
    // Forward to scene-2: its building returns.
    state().switchScene('scene-2')
    expect(state().entities.map((e) => e.id)).toEqual(['building-1'])
  })

  it('re-seeds id counters from the target scene', () => {
    state().addEntity({ kind: 'npc' }) // npc-1 on scene-1
    state().newScene()
    state().switchScene('scene-1')
    // counter re-seeded from scene-1 ids: next npc is npc-2.
    expect(state().addEntity({ kind: 'npc' }).id).toBe('npc-2')
  })

  it('is a no-op for the active scene and for unknown ids', () => {
    state().addEntity({ kind: 'npc' })
    state().switchScene('scene-1') // already active
    state().switchScene('ghost')
    expect(state().activeSceneId).toBe('scene-1')
    expect(state().entities).toHaveLength(1)
  })

  it('clears undo history at the boundary', () => {
    state().newScene() // scene-2
    state().addEntity({ kind: 'npc' })
    expect(state().canUndo).toBe(true)
    state().switchScene('scene-1')
    expect(state().canUndo).toBe(false)
    expect(state().future).toEqual([])
  })
})

describe('renameScene', () => {
  it('renames a scene and ignores unknown ids / empty names', () => {
    state().renameScene('scene-1', '  Home  ')
    expect(state().scenes[0]?.name).toBe('Home')
    state().renameScene('scene-1', '   ') // whitespace-only ignored
    expect(state().scenes[0]?.name).toBe('Home')
    state().renameScene('ghost', 'X') // unknown ignored
    expect(state().scenes).toHaveLength(1)
  })

  it('does not touch entity history', () => {
    state().addEntity({ kind: 'npc' })
    const past = state().past.length
    state().renameScene('scene-1', 'Renamed')
    expect(state().past).toHaveLength(past)
  })
})

describe('deleteScene', () => {
  it('never leaves zero scenes', () => {
    state().deleteScene('scene-1')
    expect(state().scenes).toHaveLength(1)
    expect(state().activeSceneId).toBe('scene-1')
  })

  it('deletes an inactive scene without touching the active working set', () => {
    state().addEntity({ kind: 'npc' }) // scene-1
    state().newScene() // scene-2 (active)
    state().addEntity({ kind: 'building' })
    const historyBefore = state().past.length
    state().deleteScene('scene-1')
    expect(state().scenes.map((s) => s.id)).toEqual(['scene-2'])
    expect(state().activeSceneId).toBe('scene-2')
    // Active working set + history untouched.
    expect(state().entities.map((e) => e.id)).toEqual(['building-1'])
    expect(state().past).toHaveLength(historyBefore)
  })

  it('deleting the active scene loads a neighbour (history boundary)', () => {
    state().addEntity({ kind: 'npc', name: 'first' }) // scene-1
    state().newScene() // scene-2 active
    state().addEntity({ kind: 'npc' })
    state().deleteScene('scene-2')
    expect(state().scenes.map((s) => s.id)).toEqual(['scene-1'])
    expect(state().activeSceneId).toBe('scene-1')
    expect(state().entities[0]?.name).toBe('first')
    expect(state().canUndo).toBe(false)
  })
})

describe('duplicateScene', () => {
  it('clones entities under a fresh id/name, inserts after source, and switches to the copy', () => {
    state().addEntity({ kind: 'npc', position: [3, 0, 3], name: 'orig' })
    const copy = state().duplicateScene('scene-1')
    expect(copy).toBeDefined()
    expect(copy?.name).toBe('Scene 1 copy')
    expect(state().scenes.map((s) => s.id)).toEqual(['scene-1', copy!.id])
    expect(state().activeSceneId).toBe(copy!.id)
    // The copy has an independent clone of the entities.
    expect(state().entities.map((e) => e.name)).toEqual(['orig'])
    // Mutating the copy does not affect the source scene.
    state().updateEntity(state().entities[0]!.id, { name: 'changed' })
    state().switchScene('scene-1')
    expect(state().entities[0]?.name).toBe('orig')
  })

  it('returns undefined for unknown ids', () => {
    expect(state().duplicateScene('ghost')).toBeUndefined()
    expect(state().scenes).toHaveLength(1)
  })
})

describe('exportProject / importProject round-trip', () => {
  function buildTwoScenes(): void {
    state().addEntity({ kind: 'npc', position: [1, 0, 1], name: 'guide' })
    state().addEntity({ kind: 'building', position: [0, 0, -5] })
    state().newScene('Level 2')
    state().addEntity({ kind: 'npc', position: [2, 0, 2] })
    state().addEntity({ kind: 'decoration', name: 'tree', position: [4, 0, 4] })
    state().addEntity({ kind: 'decoration', name: 'tree', position: [5, 0, 5] })
  }

  it('exportProject captures every scene including the live active one', () => {
    buildTwoScenes()
    const project = state().exportProject()
    expect(project.version).toBe(SCENE_PROJECT_VERSION)
    expect(project.activeSceneId).toBe('scene-2')
    expect(project.scenes.map((s) => s.id)).toEqual(['scene-1', 'scene-2'])
    expect(project.scenes[0]?.scene.npcs).toHaveLength(1)
    expect(project.scenes[0]?.scene.buildings).toHaveLength(1)
    expect(project.scenes[1]?.scene.npcs).toHaveLength(1)
    expect(Object.keys(project.scenes[1]?.scene.decorations ?? {})).toEqual(['tree'])
  })

  it('importProject replaces all scenes and preserves per-scene entity counts', () => {
    buildTwoScenes()
    const project = state().exportProject()
    // Perturb the store, then re-import.
    state().clear()
    state().newScene('junk')
    state().importProject(JSON.parse(JSON.stringify(project)))
    expect(state().scenes.map((s) => s.id)).toEqual(['scene-1', 'scene-2'])
    expect(state().activeSceneId).toBe('scene-2')
    const reexported = state().exportProject()
    expect(reexported.scenes).toEqual(project.scenes)
  })

  it('importProject is tolerant of malformed input (never zero scenes, never throws)', () => {
    expect(() => state().importProject(null)).not.toThrow()
    expect(state().scenes).toHaveLength(1)
    state().importProject({ scenes: [] })
    expect(state().scenes).toHaveLength(1)
    // Malformed inner scene degrades to an empty scene; bad active falls back.
    state().importProject({
      scenes: [{ id: 'a', name: 'A', scene: 42 }, { id: 'b', name: 'B' }],
      activeSceneId: 'nope',
    })
    expect(state().scenes.map((s) => s.id)).toEqual(['a', 'b'])
    expect(state().activeSceneId).toBe('a')
    expect(state().entities).toEqual([])
  })

  it('is a history boundary', () => {
    state().addEntity({ kind: 'npc' })
    expect(state().canUndo).toBe(true)
    state().importProject({ scenes: [{ id: 'x', name: 'X', scene: { npcs: [] } }] })
    expect(state().canUndo).toBe(false)
  })
})

describe('pure sceneProjectFromEntries / parseSceneProject', () => {
  const entries = [
    {
      id: 'scene-1',
      name: 'One',
      entities: [
        { id: 'npc-1', kind: 'npc', position: [0, 0, 0], rotationY: 0, scale: 1 } as EditorEntity,
      ],
    },
    { id: 'scene-2', name: 'Two', entities: [] },
  ]

  it('round-trips entries through project and back', () => {
    const project = sceneProjectFromEntries(entries, 'scene-2')
    expect(project.activeSceneId).toBe('scene-2')
    const parsed = parseSceneProject(project)
    expect(parsed.scenes.map((s) => s.id)).toEqual(['scene-1', 'scene-2'])
    expect(parsed.scenes[0]?.entities).toHaveLength(1)
    expect(parsed.activeSceneId).toBe('scene-2')
  })

  it('parseSceneProject falls back to a single default scene on junk', () => {
    for (const junk of [null, undefined, 42, 'x', {}, { scenes: 'no' }, { scenes: [] }]) {
      const parsed = parseSceneProject(junk)
      expect(parsed.scenes).toHaveLength(1)
      expect(parsed.activeSceneId).toBe(parsed.scenes[0]?.id)
    }
  })

  it('parseSceneProject de-duplicates ids and names', () => {
    const parsed = parseSceneProject({
      scenes: [
        { id: 'dup', name: 'Same', scene: { npcs: [] } },
        { id: 'dup', name: 'Same', scene: { npcs: [] } },
      ],
    })
    expect(new Set(parsed.scenes.map((s) => s.id)).size).toBe(2)
    expect(new Set(parsed.scenes.map((s) => s.name)).size).toBe(2)
  })
})
