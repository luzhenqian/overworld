/**
 * @overworld/editor — in-game scene editor prototype.
 *
 * Three pieces:
 * - {@link useEditorStore}: headless working set + JSON import/export;
 * - {@link EditorScene}: R3F layer mounted inside `<Canvas>` (ground-plane
 *   picking, placeholder meshes, drag-move);
 * - {@link EditorPanel} / {@link EditorToggle}: DOM overlay (mode switch,
 *   entity list, property editing, JSON import/export).
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
} from './editorStore'
export type {
  EditorEntity,
  EditorEntityKind,
  EditorMode,
  EditorState,
  NewEditorEntity,
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
