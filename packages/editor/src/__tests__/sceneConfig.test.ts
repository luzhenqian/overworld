import { beforeEach, describe, expect, it } from 'vitest'
import {
  useEditorStore,
  exportEntities,
  sceneConfigToEditorEntities,
  type SceneConfigInput,
} from '../editorStore'

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
  })
}

beforeEach(resetStore)

/** A live `<SceneShell>` config: 2 NPCs + 1 building + a decoration group. */
const config: SceneConfigInput = {
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

/** The scene JSON the config corresponds to (decorationCollisions → decorations). */
const expectedSceneJson = {
  npcs: config.npcs,
  buildings: config.buildings,
  decorations: config.decorationCollisions,
}

describe('sceneConfigToEditorEntities', () => {
  it('config → entities → exportEntities reproduces the config scene JSON', () => {
    const entities = sceneConfigToEditorEntities(config)
    expect(exportEntities(entities)).toEqual(expectedSceneJson)
  })

  it('keeps NPC/building ids and groups decorations under their name', () => {
    const entities = sceneConfigToEditorEntities(config)
    expect(entities.filter((e) => e.kind === 'npc').map((e) => e.id)).toEqual(['guide', 'merchant'])
    expect(entities.filter((e) => e.kind === 'building').map((e) => e.id)).toEqual(['bank'])
    const decorations = entities.filter((e) => e.kind === 'decoration')
    expect(decorations).toHaveLength(2)
    expect(decorations.every((e) => e.name === 'tree')).toBe(true)
    expect(decorations[0]?.collisionRadius).toBe(0.8)
  })

  it('is pure (does not touch the store) and handles a bare npcs-only config', () => {
    const entities = sceneConfigToEditorEntities({ npcs: config.npcs })
    expect(entities).toHaveLength(2)
    expect(useEditorStore.getState().entities).toHaveLength(0)
    expect(exportEntities(entities)).toEqual({ npcs: config.npcs, buildings: [], decorations: {} })
  })
})

describe('loadSceneConfig store action', () => {
  it('loads the config into the working set and exportScene matches', () => {
    useEditorStore.getState().loadSceneConfig(config)
    const state = useEditorStore.getState()
    // 2 npcs + 1 building + 2 decoration instances = 5
    expect(state.entities).toHaveLength(5)
    expect(state.entities.map((e) => e.kind).sort()).toEqual([
      'building',
      'decoration',
      'decoration',
      'npc',
      'npc',
    ])
    expect(state.exportScene()).toEqual(expectedSceneJson)
  })

  it('is history-tracked like loadEntities (undo restores the prior set)', () => {
    const store = useEditorStore.getState()
    store.addEntity({ kind: 'npc', position: [9, 0, 9] })
    useEditorStore.getState().loadSceneConfig(config)
    expect(useEditorStore.getState().canUndo).toBe(true)
    useEditorStore.getState().undo()
    // undo returns to the single manually-added npc
    expect(useEditorStore.getState().entities.map((e) => e.id)).toEqual(['npc-1'])
  })

  it('re-seeds id counters from the loaded ids', () => {
    useEditorStore.getState().loadSceneConfig(config)
    // decoration instances imported as decoration-1 / decoration-2 → counter at 2
    expect(useEditorStore.getState().addEntity({ kind: 'decoration' }).id).toBe('decoration-3')
    // guide/merchant/bank aren't numeric-suffixed, so those counters restart at 1
    expect(useEditorStore.getState().addEntity({ kind: 'building' }).id).toBe('building-1')
  })
})
