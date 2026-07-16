import { beforeEach, describe, expect, it } from 'vitest'
import { useEditorStore, HISTORY_LIMIT, type EditorEntity } from '../editorStore'

function resetStore(): void {
  useEditorStore.setState({
    enabled: false,
    mode: 'select',
    placingKind: 'npc',
    entities: [],
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

function ids(): string[] {
  return useEditorStore.getState().entities.map((e) => e.id)
}

describe('undo / redo basics', () => {
  it('starts with empty history and canUndo/canRedo false', () => {
    const state = useEditorStore.getState()
    expect(state.canUndo).toBe(false)
    expect(state.canRedo).toBe(false)
    state.undo()
    state.redo()
    expect(useEditorStore.getState().entities).toEqual([])
  })

  it('addEntity is undoable and redoable', () => {
    useEditorStore.getState().addEntity({ kind: 'npc', position: [1, 0, 2] })
    expect(useEditorStore.getState().canUndo).toBe(true)

    useEditorStore.getState().undo()
    expect(useEditorStore.getState().entities).toEqual([])
    expect(useEditorStore.getState().canUndo).toBe(false)
    expect(useEditorStore.getState().canRedo).toBe(true)

    useEditorStore.getState().redo()
    expect(ids()).toEqual(['npc-1'])
    expect(useEditorStore.getState().entities[0]?.position).toEqual([1, 0, 2])
    expect(useEditorStore.getState().canRedo).toBe(false)
  })

  it('removeEntity is undoable and restores the exact prior entity', () => {
    const { id } = useEditorStore
      .getState()
      .addEntity({ kind: 'building', position: [3, 0, 3], name: '银行', collisionRadius: 4 })
    const before = structuredClone(useEditorStore.getState().entities)
    useEditorStore.getState().removeEntity(id)
    expect(useEditorStore.getState().entities).toEqual([])

    useEditorStore.getState().undo()
    expect(useEditorStore.getState().entities).toEqual(before)
  })

  it('updateEntity (non-transient) is one undo step', () => {
    const { id } = useEditorStore.getState().addEntity({ kind: 'npc' })
    useEditorStore.getState().updateEntity(id, { position: [5, 0, 5] })
    useEditorStore.getState().undo()
    expect(useEditorStore.getState().entities[0]?.position).toEqual([0, 0, 0])
    useEditorStore.getState().redo()
    expect(useEditorStore.getState().entities[0]?.position).toEqual([5, 0, 5])
  })

  it('clear and loadEntities are undoable', () => {
    useEditorStore.getState().addEntity({ kind: 'npc' })
    useEditorStore.getState().clear()
    expect(useEditorStore.getState().entities).toEqual([])
    useEditorStore.getState().undo()
    expect(ids()).toEqual(['npc-1'])

    const loaded: EditorEntity[] = [
      { id: 'building-9', kind: 'building', position: [0, 0, 0], rotationY: 0, scale: 1 },
    ]
    useEditorStore.getState().loadEntities(loaded)
    expect(ids()).toEqual(['building-9'])
    useEditorStore.getState().undo()
    expect(ids()).toEqual(['npc-1'])
  })

  it('importScene is undoable', () => {
    useEditorStore.getState().addEntity({ kind: 'npc' })
    useEditorStore.getState().importScene({ npcs: [{ id: 'imported', position: [1, 0, 1] }] })
    expect(ids()).toEqual(['imported'])
    useEditorStore.getState().undo()
    expect(ids()).toEqual(['npc-1'])
  })

  it('a new op clears the redo stack', () => {
    useEditorStore.getState().addEntity({ kind: 'npc' })
    useEditorStore.getState().addEntity({ kind: 'npc' })
    useEditorStore.getState().undo()
    expect(useEditorStore.getState().canRedo).toBe(true)

    useEditorStore.getState().addEntity({ kind: 'building' })
    expect(useEditorStore.getState().canRedo).toBe(false)
    useEditorStore.getState().redo() // no-op
    expect(ids()).toEqual(['npc-1', 'building-1'])
  })

  it('no-op mutations do not create history entries', () => {
    useEditorStore.getState().addEntity({ kind: 'npc' })
    const pastLength = useEditorStore.getState().past.length
    useEditorStore.getState().updateEntity('ghost', { scale: 2 })
    useEditorStore.getState().removeEntity('ghost')
    expect(useEditorStore.getState().past).toHaveLength(pastLength)
  })

  it('undo restores a snapshot, not a shared reference', () => {
    const { id } = useEditorStore.getState().addEntity({ kind: 'npc' })
    useEditorStore.getState().updateEntity(id, { position: [9, 0, 9] })
    useEditorStore.getState().undo()
    // Mutating after undo must not corrupt the redo snapshot.
    useEditorStore.getState().updateEntity(id, { position: [-1, 0, -1] })
    useEditorStore.getState().undo()
    useEditorStore.getState().redo()
    expect(useEditorStore.getState().entities[0]?.position).toEqual([-1, 0, -1])
  })
})

describe('transient updates', () => {
  it('a transient burst + commitTransient is ONE undo step back to pre-burst', () => {
    const { id } = useEditorStore.getState().addEntity({ kind: 'npc', position: [0, 0, 0] })
    for (let i = 1; i <= 10; i += 1) {
      useEditorStore.getState().updateEntity(id, { position: [i, 0, i] }, { transient: true })
    }
    expect(useEditorStore.getState().entities[0]?.position).toEqual([10, 0, 10])
    // No history entry yet.
    expect(useEditorStore.getState().past).toHaveLength(1) // only the addEntity step

    useEditorStore.getState().commitTransient()
    expect(useEditorStore.getState().past).toHaveLength(2)

    useEditorStore.getState().undo()
    expect(useEditorStore.getState().entities[0]?.position).toEqual([0, 0, 0])
    useEditorStore.getState().redo()
    expect(useEditorStore.getState().entities[0]?.position).toEqual([10, 0, 10])
  })

  it('commitTransient without a pending burst is a no-op', () => {
    useEditorStore.getState().addEntity({ kind: 'npc' })
    const pastLength = useEditorStore.getState().past.length
    useEditorStore.getState().commitTransient()
    expect(useEditorStore.getState().past).toHaveLength(pastLength)
  })

  it('a non-transient op with a pending burst commits the burst first', () => {
    const { id } = useEditorStore.getState().addEntity({ kind: 'npc', position: [0, 0, 0] })
    useEditorStore.getState().updateEntity(id, { position: [3, 0, 3] }, { transient: true })
    useEditorStore.getState().updateEntity(id, { position: [4, 0, 4] }, { transient: true })
    // Normal op without an explicit commitTransient().
    useEditorStore.getState().addEntity({ kind: 'building' })

    // Undo 1: remove the building (back to post-burst state).
    useEditorStore.getState().undo()
    expect(ids()).toEqual(['npc-1'])
    expect(useEditorStore.getState().entities[0]?.position).toEqual([4, 0, 4])

    // Undo 2: revert the whole burst.
    useEditorStore.getState().undo()
    expect(useEditorStore.getState().entities[0]?.position).toEqual([0, 0, 0])
  })

  it('undo with an uncommitted burst reverts the burst as one step', () => {
    const { id } = useEditorStore.getState().addEntity({ kind: 'npc', position: [0, 0, 0] })
    useEditorStore.getState().updateEntity(id, { position: [7, 0, 7] }, { transient: true })
    useEditorStore.getState().undo()
    expect(useEditorStore.getState().entities[0]?.position).toEqual([0, 0, 0])
    expect(useEditorStore.getState().pendingSnapshot).toBeNull()
  })

  it('transient update on an unknown id does not open a burst', () => {
    useEditorStore.getState().updateEntity('ghost', { scale: 2 }, { transient: true })
    expect(useEditorStore.getState().pendingSnapshot).toBeNull()
  })
})

describe('duplicate', () => {
  it('clones with a fresh id, [+1, 0, +1] offset, and selects the clone', () => {
    const source = useEditorStore.getState().addEntity({
      kind: 'building',
      position: [2, 0, -3],
      rotationY: 1.5,
      scale: 2,
      name: '银行',
      modelPath: '/bank.glb',
      collisionRadius: 4,
    })
    const clone = useEditorStore.getState().duplicate(source.id)
    expect(clone).toBeDefined()
    expect(clone?.id).toBe('building-2')
    expect(clone?.position).toEqual([3, 0, -2])
    expect(clone?.rotationY).toBe(1.5)
    expect(clone?.scale).toBe(2)
    expect(clone?.name).toBe('银行')
    expect(clone?.modelPath).toBe('/bank.glb')
    expect(clone?.collisionRadius).toBe(4)
    expect(useEditorStore.getState().selectedId).toBe('building-2')
    expect(useEditorStore.getState().entities).toHaveLength(2)
  })

  it('is undoable (and undo clears the dangling selection)', () => {
    const source = useEditorStore.getState().addEntity({ kind: 'npc' })
    useEditorStore.getState().duplicate(source.id)
    expect(useEditorStore.getState().selectedId).toBe('npc-2')

    useEditorStore.getState().undo()
    expect(ids()).toEqual(['npc-1'])
    expect(useEditorStore.getState().selectedId).toBeNull()
  })

  it('returns undefined for unknown ids without touching history', () => {
    const pastLength = useEditorStore.getState().past.length
    expect(useEditorStore.getState().duplicate('ghost')).toBeUndefined()
    expect(useEditorStore.getState().past).toHaveLength(pastLength)
  })
})

describe('selection across undo/redo', () => {
  it('keeps the selection when the entity still exists', () => {
    const { id } = useEditorStore.getState().addEntity({ kind: 'npc' })
    useEditorStore.getState().select(id)
    useEditorStore.getState().updateEntity(id, { scale: 2 })
    useEditorStore.getState().undo()
    expect(useEditorStore.getState().selectedId).toBe(id)
  })

  it('clears the selection when undo removes the selected entity', () => {
    useEditorStore.getState().addEntity({ kind: 'npc' })
    const second = useEditorStore.getState().addEntity({ kind: 'npc' })
    useEditorStore.getState().select(second.id)
    useEditorStore.getState().undo()
    expect(useEditorStore.getState().selectedId).toBeNull()
    expect(ids()).toEqual(['npc-1'])
  })

  it('clears the selection when redo removes the selected entity', () => {
    const { id } = useEditorStore.getState().addEntity({ kind: 'npc' })
    useEditorStore.getState().removeEntity(id)
    useEditorStore.getState().undo()
    useEditorStore.getState().select(id)
    useEditorStore.getState().redo() // re-applies the removal
    expect(useEditorStore.getState().selectedId).toBeNull()
  })
})

describe('history cap', () => {
  it(`keeps at most ${HISTORY_LIMIT} snapshots and drops the oldest`, () => {
    for (let i = 0; i < HISTORY_LIMIT + 1; i += 1) {
      useEditorStore.getState().addEntity({ kind: 'npc' })
    }
    expect(useEditorStore.getState().past).toHaveLength(HISTORY_LIMIT)

    let guard = 0
    while (useEditorStore.getState().canUndo && guard < HISTORY_LIMIT + 10) {
      useEditorStore.getState().undo()
      guard += 1
    }
    expect(guard).toBe(HISTORY_LIMIT)
    // The oldest snapshot (the empty scene) was dropped: one entity survives.
    expect(useEditorStore.getState().entities).toHaveLength(1)
  })
})

describe('snap / grid settings', () => {
  it('setSnap stores positive values and treats 0 as off', () => {
    useEditorStore.getState().setSnap(1.5)
    expect(useEditorStore.getState().snap).toBe(1.5)
    useEditorStore.getState().setSnap(0)
    expect(useEditorStore.getState().snap).toBe(0)
  })

  it('setSnap clamps negative and non-finite values to 0', () => {
    useEditorStore.getState().setSnap(-2)
    expect(useEditorStore.getState().snap).toBe(0)
    useEditorStore.getState().setSnap(Number.NaN)
    expect(useEditorStore.getState().snap).toBe(0)
  })

  it('setShowGrid toggles the grid flag', () => {
    useEditorStore.getState().setShowGrid(false)
    expect(useEditorStore.getState().showGrid).toBe(false)
    useEditorStore.getState().setShowGrid(true)
    expect(useEditorStore.getState().showGrid).toBe(true)
  })

  it('snap changes are not part of entity history', () => {
    useEditorStore.getState().addEntity({ kind: 'npc' })
    useEditorStore.getState().setSnap(2)
    useEditorStore.getState().undo()
    expect(useEditorStore.getState().snap).toBe(2)
    expect(useEditorStore.getState().entities).toEqual([])
  })
})
