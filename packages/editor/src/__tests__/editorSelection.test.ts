import { beforeEach, describe, expect, it } from 'vitest'
import { useEditorStore, type EditorEntityKind } from '../editorStore'

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

function addAt(kind: EditorEntityKind, x: number, z: number): string {
  return useEditorStore.getState().addEntity({ kind, position: [x, 0, z] }).id
}

function positionOf(id: string): readonly number[] | undefined {
  return useEditorStore.getState().entities.find((e) => e.id === id)?.position
}

function selection(): { ids: string[]; id: string | null } {
  const state = useEditorStore.getState()
  return { ids: state.selectedIds, id: state.selectedId }
}

describe('multi-selection basics', () => {
  it('select(id) single-selects and mirrors into selectedIds', () => {
    const a = addAt('npc', 0, 0)
    const b = addAt('npc', 1, 1)
    useEditorStore.getState().select(a)
    expect(selection()).toEqual({ ids: [a], id: a })
    useEditorStore.getState().select(b)
    expect(selection()).toEqual({ ids: [b], id: b })
    useEditorStore.getState().select(null)
    expect(selection()).toEqual({ ids: [], id: null })
  })

  it('toggleSelect adds and removes; selectedId tracks the last remaining id', () => {
    const a = addAt('npc', 0, 0)
    const b = addAt('npc', 1, 1)
    const c = addAt('building', 2, 2)
    useEditorStore.getState().toggleSelect(a)
    useEditorStore.getState().toggleSelect(b)
    useEditorStore.getState().toggleSelect(c)
    expect(selection()).toEqual({ ids: [a, b, c], id: c })

    // Removing the last selected id makes the previous one primary again.
    useEditorStore.getState().toggleSelect(c)
    expect(selection()).toEqual({ ids: [a, b], id: b })
    useEditorStore.getState().toggleSelect(a)
    expect(selection()).toEqual({ ids: [b], id: b })
    useEditorStore.getState().toggleSelect(b)
    expect(selection()).toEqual({ ids: [], id: null })
  })

  it('toggleSelect on an unknown id is a no-op', () => {
    const a = addAt('npc', 0, 0)
    useEditorStore.getState().select(a)
    useEditorStore.getState().toggleSelect('ghost')
    expect(selection()).toEqual({ ids: [a], id: a })
  })

  it('selectMany drops unknown ids, dedupes, and sets selectedId to the last', () => {
    const a = addAt('npc', 0, 0)
    const b = addAt('npc', 1, 1)
    useEditorStore.getState().selectMany([b, 'ghost', a, b])
    expect(selection()).toEqual({ ids: [b, a], id: a })
  })

  it('selectMany with every entity id acts as select-all', () => {
    const a = addAt('npc', 0, 0)
    const b = addAt('building', 1, 1)
    const c = addAt('decoration', 2, 2)
    const store = useEditorStore.getState()
    store.selectMany(store.entities.map((e) => e.id))
    expect(selection()).toEqual({ ids: [a, b, c], id: c })
  })

  it('clearSelection empties both fields', () => {
    const a = addAt('npc', 0, 0)
    useEditorStore.getState().selectMany([a])
    useEditorStore.getState().clearSelection()
    expect(selection()).toEqual({ ids: [], id: null })
  })

  it('removeEntity prunes the id from a multi-selection', () => {
    const a = addAt('npc', 0, 0)
    const b = addAt('npc', 1, 1)
    useEditorStore.getState().selectMany([a, b])
    useEditorStore.getState().removeEntity(b)
    expect(selection()).toEqual({ ids: [a], id: a })
  })
})

describe('removeSelected / duplicateSelected', () => {
  it('removeSelected deletes every selected entity as one history step', () => {
    const a = addAt('npc', 0, 0)
    addAt('npc', 1, 1)
    const c = addAt('building', 2, 2)
    useEditorStore.getState().selectMany([a, c])
    const pastLength = useEditorStore.getState().past.length

    useEditorStore.getState().removeSelected()
    expect(useEditorStore.getState().entities.map((e) => e.id)).toEqual(['npc-2'])
    expect(selection()).toEqual({ ids: [], id: null })
    expect(useEditorStore.getState().past).toHaveLength(pastLength + 1)

    useEditorStore.getState().undo()
    expect(useEditorStore.getState().entities.map((e) => e.id)).toEqual([a, 'npc-2', c])
  })

  it('removeSelected with an empty selection is a no-op (no history entry)', () => {
    addAt('npc', 0, 0)
    const pastLength = useEditorStore.getState().past.length
    useEditorStore.getState().removeSelected()
    expect(useEditorStore.getState().past).toHaveLength(pastLength)
    expect(useEditorStore.getState().entities).toHaveLength(1)
  })

  it('duplicateSelected clones all with +1/+1 offset, selects the clones, one step', () => {
    const a = addAt('npc', 0, 0)
    const b = addAt('building', 3, -2)
    useEditorStore.getState().updateEntity(b, { name: '银行', collisionRadius: 4 })
    useEditorStore.getState().selectMany([a, b])
    const pastLength = useEditorStore.getState().past.length

    const clones = useEditorStore.getState().duplicateSelected()
    expect(clones.map((c) => c.id)).toEqual(['npc-2', 'building-2'])
    expect(clones[0]?.position).toEqual([1, 0, 1])
    expect(clones[1]?.position).toEqual([4, 0, -1])
    expect(clones[1]?.name).toBe('银行')
    expect(clones[1]?.collisionRadius).toBe(4)
    expect(selection()).toEqual({ ids: ['npc-2', 'building-2'], id: 'building-2' })
    expect(useEditorStore.getState().entities).toHaveLength(4)
    expect(useEditorStore.getState().past).toHaveLength(pastLength + 1)

    // One undo removes all clones and prunes the dangling selection.
    useEditorStore.getState().undo()
    expect(useEditorStore.getState().entities.map((e) => e.id)).toEqual([a, b])
    expect(selection()).toEqual({ ids: [], id: null })
  })

  it('duplicateSelected with an empty selection returns [] without history', () => {
    addAt('npc', 0, 0)
    const pastLength = useEditorStore.getState().past.length
    expect(useEditorStore.getState().duplicateSelected()).toEqual([])
    expect(useEditorStore.getState().past).toHaveLength(pastLength)
  })
})

describe('moveSelectedBy', () => {
  it('translates every selected entity (non-transient = one history step)', () => {
    const a = addAt('npc', 0, 0)
    const b = addAt('building', 2, 3)
    const c = addAt('decoration', 5, 5)
    useEditorStore.getState().selectMany([a, b])
    const pastLength = useEditorStore.getState().past.length

    useEditorStore.getState().moveSelectedBy(1.5, -2)
    expect(positionOf(a)).toEqual([1.5, 0, -2])
    expect(positionOf(b)).toEqual([3.5, 0, 1])
    expect(positionOf(c)).toEqual([5, 0, 5]) // unselected: untouched
    expect(useEditorStore.getState().past).toHaveLength(pastLength + 1)

    useEditorStore.getState().undo()
    expect(positionOf(a)).toEqual([0, 0, 0])
    expect(positionOf(b)).toEqual([2, 0, 3])
  })

  it('a transient move burst + commitTransient is ONE undo step', () => {
    const a = addAt('npc', 0, 0)
    const b = addAt('npc', 10, 10)
    useEditorStore.getState().selectMany([a, b])
    const pastLength = useEditorStore.getState().past.length

    for (let i = 0; i < 5; i += 1) {
      useEditorStore.getState().moveSelectedBy(1, 1, { transient: true })
    }
    expect(positionOf(a)).toEqual([5, 0, 5])
    expect(positionOf(b)).toEqual([15, 0, 15])
    expect(useEditorStore.getState().past).toHaveLength(pastLength) // burst pending

    useEditorStore.getState().commitTransient()
    expect(useEditorStore.getState().past).toHaveLength(pastLength + 1)

    useEditorStore.getState().undo()
    expect(positionOf(a)).toEqual([0, 0, 0])
    expect(positionOf(b)).toEqual([10, 0, 10])

    useEditorStore.getState().redo()
    expect(positionOf(a)).toEqual([5, 0, 5])
    expect(positionOf(b)).toEqual([15, 0, 15])
  })

  it('zero delta and empty selection are no-ops (no burst, no history)', () => {
    const a = addAt('npc', 0, 0)
    useEditorStore.getState().select(a)
    const pastLength = useEditorStore.getState().past.length
    useEditorStore.getState().moveSelectedBy(0, 0, { transient: true })
    expect(useEditorStore.getState().pendingSnapshot).toBeNull()
    useEditorStore.getState().clearSelection()
    useEditorStore.getState().moveSelectedBy(3, 3)
    expect(useEditorStore.getState().past).toHaveLength(pastLength)
    expect(positionOf(a)).toEqual([0, 0, 0])
  })
})

describe('alignSelected', () => {
  function threeSpread(): [string, string, string] {
    const a = addAt('npc', -4, 2)
    const b = addAt('npc', 0, 8)
    const c = addAt('npc', 6, -2)
    useEditorStore.getState().selectMany([a, b, c])
    return [a, b, c]
  }

  it('aligns X to min / center / max with exact coordinates', () => {
    const [a, b, c] = threeSpread()
    useEditorStore.getState().alignSelected('x', 'min')
    expect([positionOf(a)?.[0], positionOf(b)?.[0], positionOf(c)?.[0]]).toEqual([-4, -4, -4])

    useEditorStore.getState().undo()
    useEditorStore.getState().alignSelected('x', 'max')
    expect([positionOf(a)?.[0], positionOf(b)?.[0], positionOf(c)?.[0]]).toEqual([6, 6, 6])

    useEditorStore.getState().undo()
    useEditorStore.getState().alignSelected('x', 'center')
    expect([positionOf(a)?.[0], positionOf(b)?.[0], positionOf(c)?.[0]]).toEqual([1, 1, 1])
    // Z coordinates are untouched by an X alignment.
    expect([positionOf(a)?.[2], positionOf(b)?.[2], positionOf(c)?.[2]]).toEqual([2, 8, -2])
  })

  it('aligns Z to min / center / max with exact coordinates', () => {
    const [a, b, c] = threeSpread()
    useEditorStore.getState().alignSelected('z', 'min')
    expect([positionOf(a)?.[2], positionOf(b)?.[2], positionOf(c)?.[2]]).toEqual([-2, -2, -2])

    useEditorStore.getState().undo()
    useEditorStore.getState().alignSelected('z', 'max')
    expect([positionOf(a)?.[2], positionOf(b)?.[2], positionOf(c)?.[2]]).toEqual([8, 8, 8])

    useEditorStore.getState().undo()
    useEditorStore.getState().alignSelected('z', 'center')
    expect([positionOf(a)?.[2], positionOf(b)?.[2], positionOf(c)?.[2]]).toEqual([3, 3, 3])
    expect([positionOf(a)?.[0], positionOf(b)?.[0], positionOf(c)?.[0]]).toEqual([-4, 0, 6])
  })

  it('is one history step and undo restores the spread', () => {
    const [a, , c] = threeSpread()
    const pastLength = useEditorStore.getState().past.length
    useEditorStore.getState().alignSelected('x', 'center')
    expect(useEditorStore.getState().past).toHaveLength(pastLength + 1)
    useEditorStore.getState().undo()
    expect(positionOf(a)).toEqual([-4, 0, 2])
    expect(positionOf(c)).toEqual([6, 0, -2])
  })

  it('no-ops with fewer than 2 selected (no history entry)', () => {
    const a = addAt('npc', 1, 1)
    addAt('npc', 5, 5)
    useEditorStore.getState().select(a)
    const pastLength = useEditorStore.getState().past.length
    useEditorStore.getState().alignSelected('x', 'min')
    useEditorStore.getState().clearSelection()
    useEditorStore.getState().alignSelected('z', 'max')
    expect(useEditorStore.getState().past).toHaveLength(pastLength)
    expect(positionOf(a)).toEqual([1, 0, 1])
  })
})

describe('distributeSelected', () => {
  it('spaces entities evenly between min and max, even with unsorted input', () => {
    // Working-set and selection order deliberately differ from X order.
    const b = addAt('npc', 9, 0)
    const c = addAt('npc', 1, 0)
    const a = addAt('npc', 4, 0)
    const d = addAt('npc', 2, 0)
    useEditorStore.getState().selectMany([a, d, b, c])

    useEditorStore.getState().distributeSelected('x')
    // Sorted by current X: c(1) d(2) a(4) b(9) → 1, 3.666…, 6.333…, 9.
    expect(positionOf(c)?.[0]).toBe(1)
    expect(positionOf(d)?.[0]).toBeCloseTo(1 + 8 / 3, 10)
    expect(positionOf(a)?.[0]).toBeCloseTo(1 + 16 / 3, 10)
    expect(positionOf(b)?.[0]).toBe(9)
  })

  it('distributes on Z and keeps ties in working-set order (stable sort)', () => {
    const a = addAt('npc', 0, 5)
    const b = addAt('npc', 0, 5) // tie with a: keeps working-set order
    const c = addAt('npc', 0, -1)
    useEditorStore.getState().selectMany([c, b, a])

    useEditorStore.getState().distributeSelected('z')
    // Sorted by Z: c(-1), then a and b tied at 5 in working-set order → -1, 2, 5.
    expect(positionOf(c)?.[2]).toBe(-1)
    expect(positionOf(a)?.[2]).toBe(2)
    expect(positionOf(b)?.[2]).toBe(5)
    // X untouched.
    expect([positionOf(a)?.[0], positionOf(b)?.[0], positionOf(c)?.[0]]).toEqual([0, 0, 0])
  })

  it('is one undoable history step', () => {
    const a = addAt('npc', 0, 0)
    const b = addAt('npc', 10, 0)
    const c = addAt('npc', 1, 0)
    useEditorStore.getState().selectMany([a, b, c])
    const pastLength = useEditorStore.getState().past.length

    useEditorStore.getState().distributeSelected('x')
    expect(positionOf(c)?.[0]).toBe(5)
    expect(useEditorStore.getState().past).toHaveLength(pastLength + 1)

    useEditorStore.getState().undo()
    expect(positionOf(c)?.[0]).toBe(1)
  })

  it('no-ops with fewer than 2 selected', () => {
    const a = addAt('npc', 3, 3)
    useEditorStore.getState().select(a)
    const pastLength = useEditorStore.getState().past.length
    useEditorStore.getState().distributeSelected('x')
    expect(useEditorStore.getState().past).toHaveLength(pastLength)
    expect(positionOf(a)).toEqual([3, 0, 3])
  })
})

describe('multi-selection across undo/redo', () => {
  it('prunes dangling ids after undo but keeps survivors', () => {
    const a = addAt('npc', 0, 0)
    const b = addAt('npc', 1, 1) // last op: adding b
    useEditorStore.getState().selectMany([a, b])

    useEditorStore.getState().undo() // removes b
    expect(selection()).toEqual({ ids: [a], id: a })

    useEditorStore.getState().redo() // b comes back, but selection stays pruned
    expect(selection()).toEqual({ ids: [a], id: a })
  })

  it('clears the whole selection when undo removes every selected entity', () => {
    const a = addAt('npc', 0, 0)
    const b = addAt('npc', 1, 1)
    useEditorStore.getState().selectMany([a, b])
    useEditorStore.getState().removeSelected()
    useEditorStore.getState().undo() // restore both
    expect(useEditorStore.getState().entities).toHaveLength(2)
    // Selection was cleared by removeSelected and stays empty after undo.
    expect(selection()).toEqual({ ids: [], id: null })

    useEditorStore.getState().selectMany([a, b])
    useEditorStore.getState().redo() // re-applies the removal
    expect(selection()).toEqual({ ids: [], id: null })
  })
})
