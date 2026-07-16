import { beforeEach, describe, expect, it } from 'vitest'
import { useEditorStore, type EditorTemplate } from '../editorStore'

function resetStore(): void {
  useEditorStore.setState({
    enabled: false,
    mode: 'select',
    placingKind: 'npc',
    templates: [],
    activeTemplateId: null,
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

const TEMPLATES: EditorTemplate[] = [
  {
    id: 'bank',
    label: '银行',
    kind: 'building',
    modelPath: '/models/bank.glb',
    scale: 2,
    collisionRadius: 5,
    name: '银行',
  },
  { id: 'guide', label: '向导 NPC', kind: 'npc', modelPath: '/models/guide.glb' },
  { id: 'bare-tree', label: '树(无模型)', kind: 'decoration' },
]

describe('setTemplates / setActiveTemplate', () => {
  it('setTemplates replaces the catalogue', () => {
    useEditorStore.getState().setTemplates(TEMPLATES)
    expect(useEditorStore.getState().templates.map((t) => t.id)).toEqual([
      'bank',
      'guide',
      'bare-tree',
    ])
    useEditorStore.getState().setTemplates([TEMPLATES[1] as EditorTemplate])
    expect(useEditorStore.getState().templates.map((t) => t.id)).toEqual(['guide'])
  })

  it('setTemplates copies the array (later caller mutation is invisible)', () => {
    const list = [...TEMPLATES]
    useEditorStore.getState().setTemplates(list)
    list.pop()
    expect(useEditorStore.getState().templates).toHaveLength(3)
  })

  it('setActiveTemplate activates known ids and null, rejects unknown ids', () => {
    useEditorStore.getState().setTemplates(TEMPLATES)
    useEditorStore.getState().setActiveTemplate('bank')
    expect(useEditorStore.getState().activeTemplateId).toBe('bank')
    useEditorStore.getState().setActiveTemplate('ghost')
    expect(useEditorStore.getState().activeTemplateId).toBe('bank')
    useEditorStore.getState().setActiveTemplate(null)
    expect(useEditorStore.getState().activeTemplateId).toBeNull()
  })

  it('activating a template switches placingKind to its kind', () => {
    useEditorStore.getState().setTemplates(TEMPLATES)
    expect(useEditorStore.getState().placingKind).toBe('npc')
    useEditorStore.getState().setActiveTemplate('bank')
    expect(useEditorStore.getState().placingKind).toBe('building')
    useEditorStore.getState().setActiveTemplate('bare-tree')
    expect(useEditorStore.getState().placingKind).toBe('decoration')
  })

  it('setTemplates keeps a still-existing active template but clears a stale one', () => {
    useEditorStore.getState().setTemplates(TEMPLATES)
    useEditorStore.getState().setActiveTemplate('guide')
    useEditorStore.getState().setTemplates(TEMPLATES.slice(0, 2))
    expect(useEditorStore.getState().activeTemplateId).toBe('guide')
    useEditorStore.getState().setTemplates([TEMPLATES[0] as EditorTemplate])
    expect(useEditorStore.getState().activeTemplateId).toBeNull()
  })

  it('template configuration is not history-tracked', () => {
    useEditorStore.getState().setTemplates(TEMPLATES)
    useEditorStore.getState().setActiveTemplate('bank')
    expect(useEditorStore.getState().canUndo).toBe(false)
    expect(useEditorStore.getState().past).toHaveLength(0)
  })
})

describe('addEntityFromTemplate', () => {
  it('pre-fills kind/modelPath/scale/collisionRadius/name from the active template', () => {
    useEditorStore.getState().setTemplates(TEMPLATES)
    useEditorStore.getState().setActiveTemplate('bank')
    const entity = useEditorStore.getState().addEntityFromTemplate([4, 0, -2])
    expect(entity).toEqual({
      id: 'building-1',
      kind: 'building',
      position: [4, 0, -2],
      rotationY: 0,
      scale: 2,
      name: '银行',
      modelPath: '/models/bank.glb',
      collisionRadius: 5,
    })
  })

  it('omits fields the template leaves undefined', () => {
    useEditorStore.getState().setTemplates(TEMPLATES)
    useEditorStore.getState().setActiveTemplate('guide')
    const entity = useEditorStore.getState().addEntityFromTemplate([1, 0, 1])
    expect(entity).toEqual({
      id: 'npc-1',
      kind: 'npc',
      position: [1, 0, 1],
      rotationY: 0,
      scale: 1,
      modelPath: '/models/guide.glb',
    })
  })

  it('falls back to a bare placingKind entity when no template is active', () => {
    useEditorStore.getState().setTemplates(TEMPLATES)
    useEditorStore.getState().setPlacingKind('decoration')
    const entity = useEditorStore.getState().addEntityFromTemplate([2, 0, 3])
    expect(entity).toEqual({
      id: 'decoration-1',
      kind: 'decoration',
      position: [2, 0, 3],
      rotationY: 0,
      scale: 1,
    })
  })

  it('also falls back when the active id points at a removed template', () => {
    useEditorStore.getState().setTemplates(TEMPLATES)
    useEditorStore.getState().setActiveTemplate('bank')
    // Force a stale id directly (setTemplates would normally clear it).
    useEditorStore.setState({ templates: [] })
    const entity = useEditorStore.getState().addEntityFromTemplate([0, 0, 0])
    expect(entity.kind).toBe('building') // placingKind was switched by setActiveTemplate
    expect(entity.modelPath).toBeUndefined()
  })

  it('is one undoable step, exactly like addEntity', () => {
    useEditorStore.getState().setTemplates(TEMPLATES)
    useEditorStore.getState().setActiveTemplate('bank')
    useEditorStore.getState().addEntityFromTemplate([4, 0, -2])
    expect(useEditorStore.getState().canUndo).toBe(true)
    expect(useEditorStore.getState().past).toHaveLength(1)

    useEditorStore.getState().undo()
    expect(useEditorStore.getState().entities).toEqual([])

    useEditorStore.getState().redo()
    expect(useEditorStore.getState().entities).toHaveLength(1)
    expect(useEditorStore.getState().entities[0]?.modelPath).toBe('/models/bank.glb')
  })

  it('template-placed entities survive an export → import round-trip', () => {
    const store = useEditorStore.getState()
    store.setTemplates(TEMPLATES)
    store.setActiveTemplate('bank')
    store.addEntityFromTemplate([10, 0, -10])
    store.setActiveTemplate('guide')
    store.addEntityFromTemplate([1, 0, 2])
    store.setActiveTemplate('bare-tree')
    store.addEntityFromTemplate([5, 0, 5])

    const first = useEditorStore.getState().exportScene()
    expect(first.buildings[0]?.modelPath).toBe('/models/bank.glb')
    expect(first.buildings[0]?.collisionRadius).toBe(5)
    expect(first.npcs[0]?.modelPath).toBe('/models/guide.glb')

    useEditorStore.getState().importScene(JSON.parse(JSON.stringify(first)))
    const second = useEditorStore.getState().exportScene()
    expect(second).toEqual(first)
  })
})
