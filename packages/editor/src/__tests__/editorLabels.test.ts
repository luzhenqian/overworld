import { afterEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_EDITOR_LABELS,
  configureEditorLabels,
  resetEditorLabels,
  useEditorLabelsStore,
} from '../editorLabels'

afterEach(() => {
  resetEditorLabels()
})

describe('editorLabels', () => {
  it('starts with the built-in Chinese defaults', () => {
    const labels = useEditorLabelsStore.getState().labels
    expect(labels).toBe(DEFAULT_EDITOR_LABELS)
    expect(labels.undo).toBe('撤销')
    expect(labels.modePlace).toBe('放置')
    expect(labels.toggleLabel(true)).toBe('编辑器 ON')
    expect(labels.toggleLabel(false)).toBe('编辑器 OFF')
    expect(labels.multiSelectionHint(3)).toContain('3')
  })

  it('configureEditorLabels merges a partial override, keeping the rest', () => {
    configureEditorLabels({ undo: 'Undo', redo: 'Redo' })
    const labels = useEditorLabelsStore.getState().labels
    expect(labels.undo).toBe('Undo')
    expect(labels.redo).toBe('Redo')
    // Untouched keys keep their current value.
    expect(labels.duplicate).toBe(DEFAULT_EDITOR_LABELS.duplicate)
    expect(labels.panelTitle).toBe(DEFAULT_EDITOR_LABELS.panelTitle)
  })

  it('successive configure calls accumulate', () => {
    configureEditorLabels({ undo: 'Undo' })
    configureEditorLabels({ redo: 'Redo' })
    const labels = useEditorLabelsStore.getState().labels
    expect(labels.undo).toBe('Undo')
    expect(labels.redo).toBe('Redo')
  })

  it('overrides message functions', () => {
    configureEditorLabels({
      multiSelectionHint: (count) => `${count} entities selected`,
      toggleLabel: (enabled) => `Editor ${enabled ? 'ON' : 'OFF'}`,
    })
    const labels = useEditorLabelsStore.getState().labels
    expect(labels.multiSelectionHint(2)).toBe('2 entities selected')
    expect(labels.toggleLabel(true)).toBe('Editor ON')
  })

  it('resetEditorLabels restores the defaults', () => {
    configureEditorLabels({ undo: 'Undo' })
    resetEditorLabels()
    expect(useEditorLabelsStore.getState().labels).toBe(DEFAULT_EDITOR_LABELS)
  })

  it('the default dictionary has no empty strings', () => {
    for (const [key, value] of Object.entries(DEFAULT_EDITOR_LABELS)) {
      if (typeof value === 'string') {
        expect(value.length, `label "${key}" must not be empty`).toBeGreaterThan(0)
      }
    }
  })
})
