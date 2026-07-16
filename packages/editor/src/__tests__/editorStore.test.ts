import { beforeEach, describe, expect, it } from 'vitest'
import {
  useEditorStore,
  exportEntities,
  importEntities,
  type EditorEntity,
} from '../editorStore'

function resetStore(): void {
  useEditorStore.setState({
    enabled: false,
    mode: 'select',
    placingKind: 'npc',
    entities: [],
    selectedId: null,
    counters: { npc: 0, building: 0, decoration: 0 },
  })
}

beforeEach(resetStore)

describe('basic setters', () => {
  it('setEnabled / setMode / setPlacingKind', () => {
    const store = useEditorStore.getState()
    store.setEnabled(true)
    store.setMode('place')
    store.setPlacingKind('building')
    expect(useEditorStore.getState().enabled).toBe(true)
    expect(useEditorStore.getState().mode).toBe('place')
    expect(useEditorStore.getState().placingKind).toBe('building')
  })

  it('setPlacingKind ignores invalid kinds', () => {
    useEditorStore.getState().setPlacingKind('portal' as never)
    expect(useEditorStore.getState().placingKind).toBe('npc')
  })
})

describe('addEntity', () => {
  it('generates sequential ids per kind', () => {
    const store = useEditorStore.getState()
    expect(store.addEntity({ kind: 'npc' }).id).toBe('npc-1')
    expect(store.addEntity({ kind: 'npc' }).id).toBe('npc-2')
    expect(store.addEntity({ kind: 'building' }).id).toBe('building-1')
    expect(store.addEntity({ kind: 'decoration' }).id).toBe('decoration-1')
    expect(store.addEntity({ kind: 'npc' }).id).toBe('npc-3')
  })

  it('applies defaults and keeps provided fields', () => {
    const entity = useEditorStore.getState().addEntity({ kind: 'npc' })
    expect(entity).toEqual({
      id: 'npc-1',
      kind: 'npc',
      position: [0, 0, 0],
      rotationY: 0,
      scale: 1,
    })

    const custom = useEditorStore.getState().addEntity({
      kind: 'building',
      position: [1, 0, -2],
      rotationY: Math.PI,
      scale: 2,
      name: '银行',
      modelPath: '/models/bank.glb',
      collisionRadius: 4,
    })
    expect(custom.id).toBe('building-1')
    expect(custom.name).toBe('银行')
    expect(custom.collisionRadius).toBe(4)
    expect(useEditorStore.getState().entities).toHaveLength(2)
  })

  it('defaults kind to placingKind', () => {
    useEditorStore.getState().setPlacingKind('decoration')
    expect(useEditorStore.getState().addEntity().kind).toBe('decoration')
  })

  it('skips ids already taken by loaded entities', () => {
    const store = useEditorStore.getState()
    store.loadEntities([
      { id: 'npc-2', kind: 'npc', position: [0, 0, 0], rotationY: 0, scale: 1 },
    ])
    expect(useEditorStore.getState().addEntity({ kind: 'npc' }).id).toBe('npc-3')
  })

  it('never reuses the id of a removed entity in the same session', () => {
    const store = useEditorStore.getState()
    const first = store.addEntity({ kind: 'npc' })
    store.removeEntity(first.id)
    expect(useEditorStore.getState().addEntity({ kind: 'npc' }).id).toBe('npc-2')
  })
})

describe('updateEntity / removeEntity / select', () => {
  it('patches an entity and preserves its id', () => {
    const { id } = useEditorStore.getState().addEntity({ kind: 'npc' })
    useEditorStore.getState().updateEntity(id, { position: [3, 0, 4], name: 'Guide' })
    const entity = useEditorStore.getState().entities[0]
    expect(entity?.position).toEqual([3, 0, 4])
    expect(entity?.name).toBe('Guide')
    expect(entity?.id).toBe(id)
  })

  it('updateEntity on an unknown id is a no-op', () => {
    useEditorStore.getState().addEntity({ kind: 'npc' })
    const before = useEditorStore.getState().entities
    useEditorStore.getState().updateEntity('ghost', { scale: 5 })
    expect(useEditorStore.getState().entities).toBe(before)
  })

  it('removeEntity removes and deselects', () => {
    const { id } = useEditorStore.getState().addEntity({ kind: 'npc' })
    useEditorStore.getState().select(id)
    useEditorStore.getState().removeEntity(id)
    expect(useEditorStore.getState().entities).toHaveLength(0)
    expect(useEditorStore.getState().selectedId).toBeNull()
  })

  it('removeEntity keeps an unrelated selection', () => {
    const a = useEditorStore.getState().addEntity({ kind: 'npc' })
    const b = useEditorStore.getState().addEntity({ kind: 'npc' })
    useEditorStore.getState().select(a.id)
    useEditorStore.getState().removeEntity(b.id)
    expect(useEditorStore.getState().selectedId).toBe(a.id)
  })

  it('select accepts existing ids and null, rejects unknown ids', () => {
    const { id } = useEditorStore.getState().addEntity({ kind: 'npc' })
    useEditorStore.getState().select(id)
    expect(useEditorStore.getState().selectedId).toBe(id)
    useEditorStore.getState().select('ghost')
    expect(useEditorStore.getState().selectedId).toBe(id)
    useEditorStore.getState().select(null)
    expect(useEditorStore.getState().selectedId).toBeNull()
  })
})

describe('loadEntities / clear', () => {
  const loaded: EditorEntity[] = [
    { id: 'npc-5', kind: 'npc', position: [1, 0, 1], rotationY: 0, scale: 1 },
    { id: 'custom-guy', kind: 'npc', position: [2, 0, 2], rotationY: 0, scale: 1 },
    { id: 'building-2', kind: 'building', position: [0, 0, 0], rotationY: 0, scale: 1 },
  ]

  it('replaces all entities and resets selection', () => {
    const store = useEditorStore.getState()
    store.addEntity({ kind: 'decoration' })
    store.select('decoration-1')
    store.loadEntities(loaded)
    const state = useEditorStore.getState()
    expect(state.entities.map((e) => e.id)).toEqual(['npc-5', 'custom-guy', 'building-2'])
    expect(state.selectedId).toBeNull()
  })

  it('re-seeds id counters from loaded ids', () => {
    useEditorStore.getState().loadEntities(loaded)
    expect(useEditorStore.getState().addEntity({ kind: 'npc' }).id).toBe('npc-6')
    expect(useEditorStore.getState().addEntity({ kind: 'building' }).id).toBe('building-3')
    expect(useEditorStore.getState().addEntity({ kind: 'decoration' }).id).toBe('decoration-1')
  })

  it('clear empties everything and restarts ids at 1', () => {
    useEditorStore.getState().loadEntities(loaded)
    useEditorStore.getState().clear()
    const state = useEditorStore.getState()
    expect(state.entities).toEqual([])
    expect(state.selectedId).toBeNull()
    expect(useEditorStore.getState().addEntity({ kind: 'npc' }).id).toBe('npc-1')
  })
})

describe('exportScene', () => {
  it('exports NPCs with modelPath default and [0, rotationY, 0] rotation', () => {
    useEditorStore.getState().addEntity({
      kind: 'npc',
      position: [1, 0, -3],
      rotationY: Math.PI / 2,
    })
    const json = useEditorStore.getState().exportScene()
    expect(json.npcs).toEqual([
      {
        id: 'npc-1',
        modelPath: '',
        position: [1, 0, -3],
        rotation: [0, Math.PI / 2, 0],
      },
    ])
    expect(json.buildings).toEqual([])
    expect(json.decorations).toEqual({})
  })

  it('includes optional NPC scale/name only when meaningful', () => {
    useEditorStore
      .getState()
      .addEntity({ kind: 'npc', scale: 1.5, name: 'Guide', modelPath: '/m.glb' })
    const npc = useEditorStore.getState().exportScene().npcs[0]
    expect(npc).toEqual({
      id: 'npc-1',
      modelPath: '/m.glb',
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: 1.5,
      name: 'Guide',
    })
  })

  it('applies building defaults (name = id, collisionRadius = 2)', () => {
    useEditorStore.getState().addEntity({ kind: 'building', position: [5, 0, 5] })
    const building = useEditorStore.getState().exportScene().buildings[0]
    expect(building).toEqual({
      id: 'building-1',
      name: 'building-1',
      modelPath: '',
      position: [5, 0, 5],
      rotation: [0, 0, 0],
      scale: 1,
      collisionRadius: 2,
    })
  })

  it('groups decorations by name (or "decoration") with per-group radius', () => {
    const store = useEditorStore.getState()
    store.addEntity({ kind: 'decoration', name: 'tree', position: [1, 0, 1], collisionRadius: 0.8 })
    store.addEntity({ kind: 'decoration', name: 'tree', position: [2, 0, 2], rotationY: 1, scale: 2 })
    store.addEntity({ kind: 'decoration', position: [3, 0, 3] })

    const { decorations } = useEditorStore.getState().exportScene()
    expect(Object.keys(decorations).sort()).toEqual(['decoration', 'tree'])
    expect(decorations['tree']).toEqual({
      radius: 0.8,
      instances: [
        { position: [1, 0, 1] },
        { position: [2, 0, 2], rotation: [0, 1, 0], scale: 2 },
      ],
    })
    expect(decorations['decoration']).toEqual({ radius: 2, instances: [{ position: [3, 0, 3] }] })
  })

  it('exportEntities is pure (does not touch the store)', () => {
    const json = exportEntities([
      { id: 'x', kind: 'npc', position: [0, 0, 0], rotationY: 0, scale: 1 },
    ])
    expect(json.npcs).toHaveLength(1)
    expect(useEditorStore.getState().entities).toHaveLength(0)
  })
})

describe('importScene', () => {
  it('round-trips: export → import → export is identical', () => {
    const store = useEditorStore.getState()
    store.addEntity({ kind: 'npc', position: [1, 0, 2], rotationY: 0.5, name: 'Guide' })
    store.addEntity({ kind: 'npc', position: [-4, 0, 8], modelPath: '/npc.glb', scale: 1.2 })
    store.addEntity({
      kind: 'building',
      position: [10, 0, -10],
      rotationY: Math.PI,
      scale: 3,
      name: '银行',
      modelPath: '/bank.glb',
      collisionRadius: 5,
    })
    store.addEntity({ kind: 'decoration', name: 'tree', position: [0, 0, 5], collisionRadius: 1 })
    store.addEntity({ kind: 'decoration', name: 'tree', position: [2, 0, 5], rotationY: 0.3, collisionRadius: 1 })
    store.addEntity({ kind: 'decoration', position: [9, 0, 9] })

    const first = useEditorStore.getState().exportScene()
    useEditorStore.getState().importScene(JSON.parse(JSON.stringify(first)))
    const second = useEditorStore.getState().exportScene()
    expect(second).toEqual(first)
  })

  it('imports decorations back as grouped entities', () => {
    useEditorStore.getState().importScene({
      decorations: {
        tree: { radius: 0.8, instances: [{ position: [1, 0, 1] }, { position: [2, 0, 2] }] },
        decoration: { radius: 2, instances: [{ position: [3, 0, 3] }] },
      },
    })
    const entities = useEditorStore.getState().entities
    expect(entities).toHaveLength(3)
    expect(entities.filter((e) => e.name === 'tree')).toHaveLength(2)
    expect(entities[0]?.collisionRadius).toBe(0.8)
    expect(entities[2]?.name).toBeUndefined()
    expect(entities.every((e) => e.kind === 'decoration')).toBe(true)
  })

  it('skips malformed entries but keeps valid ones', () => {
    useEditorStore.getState().importScene({
      npcs: [
        { id: 'ok', position: [0, 0, 0], rotation: [0, 1, 0], modelPath: '' },
        { id: 'bad-position', position: 'nope' },
        42,
      ],
      buildings: 'not-an-array',
      decorations: { broken: { radius: 1 } },
    })
    const entities = useEditorStore.getState().entities
    expect(entities.map((e) => e.id)).toEqual(['ok'])
    expect(entities[0]?.rotationY).toBe(1)
  })

  it('generates ids for imported entries without one and avoids collisions', () => {
    const parsed = importEntities({
      npcs: [
        { position: [0, 0, 0] },
        { id: 'npc-1', position: [1, 0, 1] },
        { position: [2, 0, 2] },
      ],
    })
    const ids = parsed.map((e) => e.id)
    expect(new Set(ids).size).toBe(3)
    expect(ids).toContain('npc-1')
  })

  it('throws on a non-object root (caught by the panel)', () => {
    expect(() => useEditorStore.getState().importScene('[]')).toThrow()
    expect(() => useEditorStore.getState().importScene(null)).toThrow()
    expect(() => useEditorStore.getState().importScene([1, 2])).toThrow()
  })

  it('replaces the previous working set', () => {
    useEditorStore.getState().addEntity({ kind: 'building' })
    useEditorStore.getState().importScene({ npcs: [{ id: 'a', position: [0, 0, 0] }] })
    expect(useEditorStore.getState().entities.map((e) => e.id)).toEqual(['a'])
  })
})
