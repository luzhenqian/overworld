/**
 * Overridable UI strings for the editor's self-rendered DOM overlay
 * (`<EditorPanel>` / `<EditorToggle>`). The defaults are the original
 * Chinese labels — games that don't care keep exactly the current look;
 * localized games call {@link configureEditorLabels} once at startup (or on
 * language switch) with any subset of overrides.
 *
 * The dictionary lives in a tiny zustand store so React components pick up
 * changes immediately — calling `configureEditorLabels` re-renders any
 * mounted panel/toggle without a remount.
 *
 * Headless by design: importing this module never touches the DOM.
 */
import { create } from 'zustand'

/**
 * Every user-visible string the editor overlay renders. String fields are
 * static labels; function fields produce parameterized messages.
 */
export interface EditorLabels {
  /** Panel heading. */
  panelTitle: string
  /** Section heading: toolbar (undo/redo/align/snap/grid). */
  sectionTools: string
  /** Section heading: select/place mode switch. */
  sectionMode: string
  /** Section heading: placing-kind selector (place mode). */
  sectionPlacingKind: string
  /** Section heading: template picker (place mode, templates registered). */
  sectionTemplates: string
  /** Section heading: entity list — rendered as `${sectionEntities} (N)`. */
  sectionEntities: string
  /** Section heading: selected-entity property editors. */
  sectionProperties: string
  /** Section heading: JSON export/import. */
  sectionExportImport: string
  undo: string
  redo: string
  duplicate: string
  /** Toolbar delete button (acts on the whole selection). */
  delete: string
  /** Delete button inside the single-entity property editor. */
  deleteEntity: string
  /** Row label for the align-on-X toolbar row. */
  alignX: string
  /** Row label for the align-on-Z toolbar row. */
  alignZ: string
  /** Row label for the distribute toolbar row. */
  distribute: string
  /** The middle align button (min / center / max — min/max stay literal). */
  alignCenter: string
  /** Row label for the snap-step number input. */
  snap: string
  /** Row label for the grid visibility checkbox. */
  grid: string
  modeSelect: string
  modePlace: string
  kindNpc: string
  kindBuilding: string
  kindDecoration: string
  /** The "no template" button in the template picker. */
  templateBlank: string
  exportJson: string
  importJson: string
  clearScene: string
  /** Property field label: Y rotation, displayed in degrees. */
  fieldRotation: string
  fieldScale: string
  fieldName: string
  fieldModelPath: string
  fieldCollisionRadius: string
  /** Placeholder for the (empty) entity name input. */
  unnamedPlaceholder: string
  /** Placeholder for the import-JSON textarea. */
  importPlaceholder: string
  /** Shown in the entity list when the working set is empty. */
  emptyEntityList: string
  /** Hint replacing the property editors while ≥2 entities are selected. */
  multiSelectionHint: (count: number) => string
  /** Status line after a successful export. */
  exportedStatus: (count: number) => string
  /** Status line after a successful import. */
  importSuccessStatus: (count: number) => string
  /** Status line after a failed import (`error` is the parse/shape message). */
  importFailStatus: (error: string) => string
  /** Label of the floating `<EditorToggle>` button. */
  toggleLabel: (enabled: boolean) => string
}

/** The built-in (Chinese) labels — the editor's historical strings. */
export const DEFAULT_EDITOR_LABELS: EditorLabels = {
  panelTitle: 'Overworld 场景编辑器',
  sectionTools: '工具',
  sectionMode: '模式',
  sectionPlacingKind: '放置类型',
  sectionTemplates: '模板',
  sectionEntities: '实体',
  sectionProperties: '属性',
  sectionExportImport: '导出 / 导入',
  undo: '撤销',
  redo: '重做',
  duplicate: '复制',
  delete: '删除',
  deleteEntity: '删除实体',
  alignX: '对齐X',
  alignZ: '对齐Z',
  distribute: '均分',
  alignCenter: '中',
  snap: '吸附',
  grid: '网格',
  modeSelect: '选择',
  modePlace: '放置',
  kindNpc: 'NPC',
  kindBuilding: '建筑',
  kindDecoration: '装饰',
  templateBlank: '空白',
  exportJson: '导出 JSON',
  importJson: '导入 JSON',
  clearScene: '清空场景',
  fieldRotation: '旋转 (°)',
  fieldScale: '缩放',
  fieldName: '名称',
  fieldModelPath: '模型路径',
  fieldCollisionRadius: '碰撞半径',
  unnamedPlaceholder: '(未命名)',
  importPlaceholder: '粘贴场景 JSON…',
  emptyEntityList: '(空 — 切到“放置”模式点击地面)',
  multiSelectionHint: (count) => `已选 ${count} 个实体 — 可用工具栏对齐/均分/复制/删除`,
  exportedStatus: (count) => `已导出 ${count} 个实体(剪贴板 + 下载)`,
  importSuccessStatus: (count) => `导入成功:${count} 个实体`,
  importFailStatus: (error) => `导入失败:${error}`,
  toggleLabel: (enabled) => `编辑器 ${enabled ? 'ON' : 'OFF'}`,
}

interface EditorLabelsState {
  labels: EditorLabels
}

/**
 * Store carrying the active label dictionary. Subscribe in React via
 * `useEditorLabels()`; read imperatively via
 * `useEditorLabelsStore.getState().labels`.
 */
export const useEditorLabelsStore = create<EditorLabelsState>()(() => ({
  labels: DEFAULT_EDITOR_LABELS,
}))

/**
 * Override any subset of the editor's built-in UI strings. Unspecified keys
 * keep their current value; mounted panels re-render immediately.
 *
 * ```ts
 * configureEditorLabels({
 *   undo: 'Undo',
 *   redo: 'Redo',
 *   toggleLabel: (on) => `Editor ${on ? 'ON' : 'OFF'}`,
 * })
 * ```
 */
export function configureEditorLabels(overrides: Partial<EditorLabels>): void {
  useEditorLabelsStore.setState((state) => ({ labels: { ...state.labels, ...overrides } }))
}

/** Restore the built-in (Chinese) labels — mainly for tests. */
export function resetEditorLabels(): void {
  useEditorLabelsStore.setState({ labels: DEFAULT_EDITOR_LABELS })
}

/** React hook: the active label dictionary (re-renders on configure). */
export function useEditorLabels(): EditorLabels {
  return useEditorLabelsStore((s) => s.labels)
}
