/**
 * @overworld/editor — in-game scene editor prototype.
 *
 * Three pieces:
 * - {@link useEditorStore}: headless working set + placement templates +
 *   JSON import/export;
 * - {@link EditorScene}: R3F layer mounted inside `<Canvas>` (ground-plane
 *   picking, placeholder meshes with GLTF model preview, drag-move);
 * - {@link EditorPanel} / {@link EditorToggle}: DOM overlay (mode switch,
 *   template picker, entity list, property editing, JSON import/export).
 *
 * The exported JSON is structurally compatible with `@overworld/scene`'s
 * `NPCConfig` / `BuildingConfig` / `DecorationInstance` — no import of the
 * scene package, per the architecture's layering rules.
 */
export {
  useEditorStore,
  exportEntities,
  importEntities,
  DEFAULT_COLLISION_RADIUS,
  DEFAULT_SNAP,
  HISTORY_LIMIT,
} from './editorStore'
export type {
  AlignAxis,
  AlignMode,
  EditorEntity,
  EditorEntityKind,
  EditorMode,
  EditorState,
  EditorTemplate,
  NewEditorEntity,
  UpdateEntityOptions,
  EditorSceneJSON,
  EditorNPCJSON,
  EditorBuildingJSON,
  EditorDecorationInstanceJSON,
  EditorDecorationGroupJSON,
} from './editorStore'

export { EditorScene } from './EditorScene'
export type { EditorSceneProps } from './EditorScene'

export { EditorPanel, EditorToggle } from './EditorPanel'
export type { EditorPanelProps, EditorToggleProps } from './EditorPanel'
