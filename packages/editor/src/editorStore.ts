/**
 * Headless editor state: the entity working set, edit mode and JSON
 * import/export. No React/three dependency — fully unit-testable.
 *
 * The exported JSON shapes (`EditorNPCJSON` / `EditorBuildingJSON` /
 * `EditorDecorationInstanceJSON`) are **structural copies** of
 * `@overworld-engine/scene`'s `NPCConfig` / `BuildingConfig` / `DecorationInstance`.
 * Per the architecture rules, system packages never import each other; the
 * editor's output plugs into `<SceneShell>` purely via structural typing.
 */
import { create } from 'zustand'
import type { Vec3 } from '@overworld-engine/core'

/** Entity categories the editor can place. */
export type EditorEntityKind = 'npc' | 'building' | 'decoration'

/** Editor interaction mode: pick/move existing entities, or place new ones. */
export type EditorMode = 'select' | 'place'

/** Ground-plane axis usable by the alignment/distribution ops. */
export type AlignAxis = 'x' | 'z'

/** Alignment target within the selection's bounding range on one axis. */
export type AlignMode = 'min' | 'center' | 'max'

/**
 * One entity in the editor working set. A deliberately flat shape — richer
 * per-kind fields only appear in the exported JSON.
 *
 * `rotationY` is stored in **radians** (three.js convention); the panel UI
 * converts to/from degrees.
 */
export interface EditorEntity {
  id: string
  kind: EditorEntityKind
  position: Vec3
  /** Y-axis rotation in radians. */
  rotationY: number
  scale: number
  /** Display name; doubles as the decoration group key on export. */
  name?: string
  /** GLTF/GLB model URL; exported as `''` when unset. */
  modelPath?: string
  /** Circular collider radius (buildings / decoration groups). */
  collisionRadius?: number
}

/** Fields accepted by {@link EditorState.addEntity}; everything is optional. */
export type NewEditorEntity = Partial<Omit<EditorEntity, 'id'>>

/**
 * A reusable placement preset. Games register their catalogue once at
 * startup via {@link EditorState.setTemplates}; while a template is active
 * (see {@link EditorState.setActiveTemplate}), place-mode clicks pre-fill
 * the new entity from it ({@link EditorState.addEntityFromTemplate}).
 *
 * Templates only pre-fill entity fields — the placed entity remains
 * self-contained, so exported JSON never references template ids.
 */
export interface EditorTemplate {
  id: string
  /** Human-readable label shown in the panel's template picker. */
  label: string
  kind: EditorEntityKind
  modelPath?: string
  scale?: number
  collisionRadius?: number
  name?: string
}

/** Structurally compatible with `@overworld-engine/scene`'s `NPCConfig`. */
export interface EditorNPCJSON {
  id: string
  modelPath: string
  position: Vec3
  rotation: Vec3
  scale?: number
  name?: string
}

/** Structurally compatible with `@overworld-engine/scene`'s `BuildingConfig`. */
export interface EditorBuildingJSON {
  id: string
  name: string
  modelPath: string
  position: Vec3
  rotation: Vec3
  scale: number
  collisionRadius: number
}

/** Structurally compatible with `@overworld-engine/scene`'s `DecorationInstance`. */
export interface EditorDecorationInstanceJSON {
  position: Vec3
  rotation?: Vec3
  scale?: number
}

/**
 * A decoration group: repeated instances of one prop plus a shared collider
 * radius. Structurally compatible with `@overworld-engine/scene`'s
 * `DecorationCollisionGroup`.
 */
export interface EditorDecorationGroupJSON {
  instances: EditorDecorationInstanceJSON[]
  radius: number
}

/** The full scene document produced by {@link exportEntities}. */
export interface EditorSceneJSON {
  npcs: EditorNPCJSON[]
  buildings: EditorBuildingJSON[]
  decorations: Record<string, EditorDecorationGroupJSON>
}

/** Default collider radius for buildings and decoration groups. */
export const DEFAULT_COLLISION_RADIUS = 2

/** Maximum number of undo (and redo) snapshots kept; oldest are dropped. */
export const HISTORY_LIMIT = 100

/** Default grid snapping step. */
export const DEFAULT_SNAP = 0.5

/** Group key used for decorations that have no `name`. */
const DEFAULT_DECORATION_GROUP = 'decoration'

const ALL_KINDS: readonly EditorEntityKind[] = ['npc', 'building', 'decoration']

type Counters = Record<EditorEntityKind, number>

function emptyCounters(): Counters {
  return { npc: 0, building: 0, decoration: 0 }
}

/** Rebuild the per-kind auto-id counters from ids shaped like `npc-3`. */
function countersFrom(entities: readonly EditorEntity[]): Counters {
  const counters = emptyCounters()
  for (const entity of entities) {
    const match = /^(npc|building|decoration)-(\d+)$/.exec(entity.id)
    const kind = match?.[1] as EditorEntityKind | undefined
    const num = match?.[2]
    if (kind !== undefined && num !== undefined) {
      const n = Number(num)
      if (n > counters[kind]) counters[kind] = n
    }
  }
  return counters
}

/**
 * Convert the editor working set into a scene JSON document:
 *
 * - `npcs` — `modelPath` defaults to `''`, `rotation` is `[0, rotationY, 0]`,
 *   `scale`/`name` included only when meaningful.
 * - `buildings` — `name` defaults to the id, `collisionRadius` defaults to
 *   {@link DEFAULT_COLLISION_RADIUS}.
 * - `decorations` — grouped by `name` (or `'decoration'` when unnamed); the
 *   group `radius` is the last defined `collisionRadius` in the group, else
 *   {@link DEFAULT_COLLISION_RADIUS}.
 *
 * Pure function; exported for headless use (e.g. CI content pipelines).
 */
export function exportEntities(entities: readonly EditorEntity[]): EditorSceneJSON {
  const npcs: EditorNPCJSON[] = []
  const buildings: EditorBuildingJSON[] = []
  const decorations: Record<string, EditorDecorationGroupJSON> = {}

  for (const entity of entities) {
    const position: Vec3 = [entity.position[0], entity.position[1], entity.position[2]]
    const rotation: Vec3 = [0, entity.rotationY, 0]

    if (entity.kind === 'npc') {
      const npc: EditorNPCJSON = {
        id: entity.id,
        modelPath: entity.modelPath ?? '',
        position,
        rotation,
      }
      if (entity.scale !== 1) npc.scale = entity.scale
      if (entity.name !== undefined) npc.name = entity.name
      npcs.push(npc)
    } else if (entity.kind === 'building') {
      buildings.push({
        id: entity.id,
        name: entity.name ?? entity.id,
        modelPath: entity.modelPath ?? '',
        position,
        rotation,
        scale: entity.scale,
        collisionRadius: entity.collisionRadius ?? DEFAULT_COLLISION_RADIUS,
      })
    } else {
      const key = entity.name || DEFAULT_DECORATION_GROUP
      let group = decorations[key]
      if (!group) {
        group = { instances: [], radius: DEFAULT_COLLISION_RADIUS }
        decorations[key] = group
      }
      if (entity.collisionRadius !== undefined) group.radius = entity.collisionRadius
      const instance: EditorDecorationInstanceJSON = { position }
      if (entity.rotationY !== 0) instance.rotation = rotation
      if (entity.scale !== 1) instance.scale = entity.scale
      group.instances.push(instance)
    }
  }

  return { npcs, buildings, decorations }
}

function toVec3(value: unknown): Vec3 | null {
  if (!Array.isArray(value) || value.length !== 3) return null
  const [x, y, z] = value
  if (typeof x !== 'number' || typeof y !== 'number' || typeof z !== 'number') return null
  return [x, y, z]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Deep-clone the working set (entities are flat except `position`). */
function cloneEntities(entities: readonly EditorEntity[]): EditorEntity[] {
  return entities.map((entity) => ({
    ...entity,
    position: [entity.position[0], entity.position[1], entity.position[2]],
  }))
}

/** Append a snapshot to a history stack, dropping the oldest past the cap. */
function appendCapped(stack: EditorEntity[][], snapshot: EditorEntity[]): EditorEntity[][] {
  const next = [...stack, snapshot]
  return next.length > HISTORY_LIMIT ? next.slice(next.length - HISTORY_LIMIT) : next
}

/**
 * Build the selection patch for a new list of selected ids. `selectedId` is
 * a **derived compatibility field**: always the last id in `selectedIds`
 * (or `null` when the selection is empty). Every selection mutation goes
 * through here so the two fields can never drift apart.
 */
function selectionFrom(
  ids: readonly string[]
): Pick<EditorState, 'selectedIds' | 'selectedId'> {
  return { selectedIds: [...ids], selectedId: ids[ids.length - 1] ?? null }
}

/** Drop selected ids that no longer exist in `entities` (undo/redo/remove). */
function pruneSelection(
  selectedIds: readonly string[],
  entities: readonly EditorEntity[]
): Pick<EditorState, 'selectedIds' | 'selectedId'> {
  return selectionFrom(selectedIds.filter((id) => entities.some((e) => e.id === id)))
}

/**
 * History bookkeeping for a non-transient mutation: commits any pending
 * transient burst first, then pushes the pre-mutation snapshot and clears
 * the redo stack. Spread the result into the state patch of every
 * history-tracked op.
 */
function pushHistory(
  state: Pick<EditorState, 'past' | 'entities' | 'pendingSnapshot'>
): Pick<EditorState, 'past' | 'future' | 'canUndo' | 'canRedo' | 'pendingSnapshot'> {
  let past = state.past
  if (state.pendingSnapshot !== null) past = appendCapped(past, state.pendingSnapshot)
  past = appendCapped(past, cloneEntities(state.entities))
  return { past, future: [], canUndo: true, canRedo: false, pendingSnapshot: null }
}

/**
 * Best-effort inverse of {@link exportEntities}: parse a scene JSON document
 * back into editor entities. Malformed entries (missing/invalid `position`,
 * non-object rows, ...) are skipped; only a non-object root throws.
 * `exportEntities(importEntities(exportEntities(set)))` is stable.
 */
export function importEntities(json: unknown): EditorEntity[] {
  if (!isRecord(json)) {
    throw new Error('scene JSON must be an object with npcs/buildings/decorations')
  }

  const entities: EditorEntity[] = []
  const usedIds = new Set<string>()
  const counters = emptyCounters()

  const claimId = (kind: EditorEntityKind, requested: unknown): string => {
    if (typeof requested === 'string' && requested !== '' && !usedIds.has(requested)) {
      usedIds.add(requested)
      return requested
    }
    let id: string
    do {
      counters[kind] += 1
      id = `${kind}-${counters[kind]}`
    } while (usedIds.has(id))
    usedIds.add(id)
    return id
  }

  if (Array.isArray(json.npcs)) {
    for (const raw of json.npcs) {
      if (!isRecord(raw)) continue
      const position = toVec3(raw.position)
      if (!position) continue
      const rotation = toVec3(raw.rotation)
      const entity: EditorEntity = {
        id: claimId('npc', raw.id),
        kind: 'npc',
        position,
        rotationY: rotation ? rotation[1] : 0,
        scale: typeof raw.scale === 'number' ? raw.scale : 1,
      }
      if (typeof raw.name === 'string') entity.name = raw.name
      if (typeof raw.modelPath === 'string' && raw.modelPath !== '') {
        entity.modelPath = raw.modelPath
      }
      entities.push(entity)
    }
  }

  if (Array.isArray(json.buildings)) {
    for (const raw of json.buildings) {
      if (!isRecord(raw)) continue
      const position = toVec3(raw.position)
      if (!position) continue
      const rotation = toVec3(raw.rotation)
      const id = claimId('building', raw.id)
      const entity: EditorEntity = {
        id,
        kind: 'building',
        position,
        rotationY: rotation ? rotation[1] : 0,
        scale: typeof raw.scale === 'number' ? raw.scale : 1,
        name: typeof raw.name === 'string' ? raw.name : id,
        collisionRadius:
          typeof raw.collisionRadius === 'number'
            ? raw.collisionRadius
            : DEFAULT_COLLISION_RADIUS,
      }
      if (typeof raw.modelPath === 'string' && raw.modelPath !== '') {
        entity.modelPath = raw.modelPath
      }
      entities.push(entity)
    }
  }

  if (isRecord(json.decorations)) {
    for (const [groupName, rawGroup] of Object.entries(json.decorations)) {
      if (!isRecord(rawGroup) || !Array.isArray(rawGroup.instances)) continue
      const radius =
        typeof rawGroup.radius === 'number' ? rawGroup.radius : DEFAULT_COLLISION_RADIUS
      for (const raw of rawGroup.instances) {
        if (!isRecord(raw)) continue
        const position = toVec3(raw.position)
        if (!position) continue
        const rotation = toVec3(raw.rotation)
        const entity: EditorEntity = {
          id: claimId('decoration', undefined),
          kind: 'decoration',
          position,
          rotationY: rotation ? rotation[1] : 0,
          scale: typeof raw.scale === 'number' ? raw.scale : 1,
          collisionRadius: radius,
        }
        if (groupName !== DEFAULT_DECORATION_GROUP) entity.name = groupName
        entities.push(entity)
      }
    }
  }

  return entities
}

/**
 * A live `<SceneShell>` scene config — the props a game already hands to
 * `<SceneShell>` (or `@overworld-engine/scene`'s `SceneFromJson`). Structurally
 * compatible with `{ npcs, buildings?, decorationCollisions? }`; the
 * per-entity shapes are the {@link EditorNPCJSON} / {@link EditorBuildingJSON}
 * / {@link EditorDecorationGroupJSON} structural copies of scene's
 * `NPCConfig` / `BuildingConfig` / `DecorationCollisionGroup`, so a game can
 * pass its live config straight in with no import of the scene package.
 *
 * Note the key is `decorationCollisions` (the `<SceneShell>` prop name), not
 * the `decorations` key used by the exported scene JSON.
 */
export interface SceneConfigInput {
  npcs: EditorNPCJSON[]
  buildings?: EditorBuildingJSON[]
  decorationCollisions?: Record<string, EditorDecorationGroupJSON>
}

/**
 * Convert a live `<SceneShell>` scene config into editor entities so a game
 * can load a hand-authored scene into the editor and tweak it. The inverse of
 * placing entities and calling {@link EditorState.exportScene} — implemented
 * on top of {@link importEntities} by mapping the `decorationCollisions` prop
 * key to the `decorations` JSON key. Malformed rows are skipped, exactly like
 * `importEntities`. Pure.
 *
 * ```ts
 * const entities = sceneConfigToEditorEntities({ npcs, buildings, decorationCollisions })
 * useEditorStore.getState().loadEntities(entities) // or loadSceneConfig(config)
 * ```
 */
export function sceneConfigToEditorEntities(config: SceneConfigInput): EditorEntity[] {
  return importEntities({
    npcs: config.npcs,
    buildings: config.buildings,
    decorations: config.decorationCollisions,
  })
}

/** Options for {@link EditorState.updateEntity}. */
export interface UpdateEntityOptions {
  /**
   * Transient updates mutate the entity **without** touching history (used
   * during drags / while typing). The snapshot from before the first
   * transient update of a burst is remembered; call
   * {@link EditorState.commitTransient} at the end of the burst (pointer-up,
   * blur, ...) to turn the whole burst into **one** undo step. Any
   * non-transient op with a burst still pending commits the burst first.
   */
  transient?: boolean
}

/** Editor store state and actions. See {@link useEditorStore}. */
export interface EditorState {
  /** Master switch; `<EditorScene>`/`<EditorPanel>` render nothing when false. */
  enabled: boolean
  mode: EditorMode
  /** Kind placed by the next place-mode click. */
  placingKind: EditorEntityKind
  /** Placement presets registered by the game. See {@link EditorTemplate}. */
  templates: EditorTemplate[]
  /** Active template id, or `null` for bare placement. */
  activeTemplateId: string | null
  entities: EditorEntity[]
  /**
   * The multi-selection, in the order ids were selected (last = primary).
   * All selection mutations keep {@link EditorState.selectedId} in sync.
   */
  selectedIds: string[]
  /**
   * **Derived compatibility field**: the last id in
   * {@link EditorState.selectedIds}, or `null` when nothing is selected.
   * Kept for existing single-selection consumers; never set it directly —
   * use `select` / `toggleSelect` / `selectMany` / `clearSelection`.
   */
  selectedId: string | null
  /** Placement/drag grid step; `0` disables snapping. Default: 0.5. */
  snap: number
  /** Whether `<EditorScene>` renders the snapping grid. Default: true. */
  showGrid: boolean
  /** `past.length > 0` — kept in sync so the UI can subscribe cheaply. */
  canUndo: boolean
  /** `future.length > 0` — kept in sync so the UI can subscribe cheaply. */
  canRedo: boolean
  /** @internal Per-kind auto-id counters (`npc-1`, `npc-2`, ...). */
  counters: Counters
  /** @internal Undo stack: pre-mutation snapshots, oldest first (≤ 100). */
  past: EditorEntity[][]
  /** @internal Redo stack: snapshots undone from, most recent last. */
  future: EditorEntity[][]
  /** @internal Pre-burst snapshot while a transient burst is in flight. */
  pendingSnapshot: EditorEntity[] | null

  setEnabled: (enabled: boolean) => void
  setMode: (mode: EditorMode) => void
  setPlacingKind: (kind: EditorEntityKind) => void
  /**
   * Replace the template catalogue. Call once at game startup:
   * `useEditorStore.getState().setTemplates([...])`. If the active template
   * no longer exists in the new list, the selection falls back to `null`.
   * Not history-tracked (templates are configuration, not scene content).
   */
  setTemplates: (templates: EditorTemplate[]) => void
  /**
   * Activate a template (`null` = bare placement). Unknown ids are a no-op.
   * Activating a template also switches `placingKind` to the template's
   * kind so the panel/scene stay consistent.
   */
  setActiveTemplate: (id: string | null) => void
  /**
   * Place-mode click entry point: add an entity at `position`, pre-filling
   * kind/modelPath/scale/collisionRadius/name from the active template.
   * Without an active template this is `addEntity({ kind: placingKind,
   * position })`. History-tracked exactly like {@link EditorState.addEntity}
   * (it delegates to it). Returns the created entity.
   */
  addEntityFromTemplate: (position: Vec3) => EditorEntity
  /** Set the grid snapping step (`0` = off; negative/non-finite → 0). */
  setSnap: (snap: number) => void
  /** Toggle the `<EditorScene>` grid overlay. */
  setShowGrid: (showGrid: boolean) => void
  /**
   * Add an entity. `kind` defaults to `placingKind`; the id is generated from
   * an incrementing per-kind counter (skipping ids already in use). Returns
   * the created entity.
   */
  addEntity: (partial?: NewEditorEntity) => EditorEntity
  /**
   * Shallow-merge a patch into one entity. Unknown ids are a no-op.
   * History-tracked unless `options.transient` — see {@link UpdateEntityOptions}.
   */
  updateEntity: (
    id: string,
    patch: Partial<Omit<EditorEntity, 'id'>>,
    options?: UpdateEntityOptions
  ) => void
  /**
   * End a transient burst: pushes the remembered pre-burst snapshot onto the
   * undo stack (one step for the whole burst). No-op when no burst is
   * pending.
   */
  commitTransient: () => void
  /**
   * Clone an entity with a fresh id (same per-kind counter mechanism),
   * offset by `[+1, 0, +1]`, and select the clone. History-tracked. Returns
   * the clone, or `undefined` for unknown ids.
   */
  duplicate: (id: string) => EditorEntity | undefined
  /** Step back one snapshot. Prunes dangling ids from the selection. */
  undo: () => void
  /** Reapply the most recently undone snapshot. */
  redo: () => void
  /** Remove an entity (deselects it if selected). Unknown ids are a no-op. */
  removeEntity: (id: string) => void
  /**
   * Single-select an entity by id, or `null` to clear the selection.
   * Replaces any multi-selection. Unknown ids are a no-op.
   */
  select: (id: string | null) => void
  /**
   * Add `id` to the selection, or remove it when already selected
   * (`selectedId` becomes the last remaining id). Unknown ids are a no-op.
   */
  toggleSelect: (id: string) => void
  /**
   * Replace the selection with `ids` (unknown ids dropped, duplicates keep
   * their first occurrence; `selectedId` = last of the result).
   */
  selectMany: (ids: readonly string[]) => void
  /** Empty the selection (`selectedIds = []`, `selectedId = null`). */
  clearSelection: () => void
  /**
   * Remove every selected entity as **one** history step and clear the
   * selection. No-op when nothing is selected.
   */
  removeSelected: () => void
  /**
   * Clone every selected entity (fresh per-kind ids, `[+1, 0, +1]` offset)
   * as **one** history step and select the clones. Returns the clones
   * (empty array when nothing is selected).
   */
  duplicateSelected: () => EditorEntity[]
  /**
   * Translate every selected entity by `(dx, 0, dz)`. History-tracked as one
   * step unless `options.transient` — transient moves join the same burst
   * mechanism as {@link EditorState.updateEntity} (the whole drag becomes one
   * undo step on {@link EditorState.commitTransient}). No-op when nothing is
   * selected or the delta is zero.
   */
  moveSelectedBy: (dx: number, dz: number, options?: UpdateEntityOptions) => void
  /**
   * Align the selected entities on one ground axis: everyone's coordinate
   * becomes the selection's `min` / `max` / bounding-range `center` on that
   * axis. One history step; no-op when fewer than 2 entities are selected.
   */
  alignSelected: (axis: AlignAxis, mode: AlignMode) => void
  /**
   * Evenly space the selected entities on one ground axis between the
   * current min and max coordinate, keeping their order by current
   * coordinate (ties keep working-set order). One history step; no-op when
   * fewer than 2 entities are selected.
   */
  distributeSelected: (axis: AlignAxis) => void
  /** Replace the whole working set (resets selection, re-seeds id counters). */
  loadEntities: (entities: EditorEntity[]) => void
  /**
   * Load a live `<SceneShell>` scene config into the editor:
   * `loadEntities(sceneConfigToEditorEntities(config))`. History-tracked and
   * non-destructive exactly like {@link EditorState.loadEntities} — lets a
   * game import a hand-authored, currently-rendering scene to tweak it. See
   * {@link sceneConfigToEditorEntities}.
   */
  loadSceneConfig: (config: SceneConfigInput) => void
  /** Remove all entities and reset selection + id counters. */
  clear: () => void
  /** Snapshot the working set as scene JSON. See {@link exportEntities}. */
  exportScene: () => EditorSceneJSON
  /**
   * Replace the working set from scene JSON (best effort). Throws when the
   * root is not an object. See {@link importEntities}.
   */
  importScene: (json: unknown) => void
}

/**
 * Global editor store (zustand singleton). Never persisted — the editor is a
 * dev tool; its output is the exported JSON, not a save game.
 *
 * ```ts
 * const { setEnabled, addEntity, exportScene } = useEditorStore.getState()
 * setEnabled(true)
 * addEntity({ kind: 'npc', position: [4, 0, -2], name: 'Guide' })
 * const json = exportScene()
 * ```
 */
export const useEditorStore = create<EditorState>()((set, get) => ({
  enabled: false,
  mode: 'select',
  placingKind: 'npc',
  templates: [],
  activeTemplateId: null,
  entities: [],
  selectedIds: [],
  selectedId: null,
  snap: DEFAULT_SNAP,
  showGrid: true,
  canUndo: false,
  canRedo: false,
  counters: emptyCounters(),
  past: [],
  future: [],
  pendingSnapshot: null,

  setEnabled: (enabled) => set({ enabled }),
  setMode: (mode) => set({ mode }),
  setPlacingKind: (placingKind) => {
    if (!ALL_KINDS.includes(placingKind)) return
    set({ placingKind })
  },
  setSnap: (snap) => set({ snap: Number.isFinite(snap) && snap > 0 ? snap : 0 }),
  setShowGrid: (showGrid) => set({ showGrid }),

  setTemplates: (templates) =>
    set((state) => ({
      templates: [...templates],
      activeTemplateId:
        state.activeTemplateId !== null &&
        templates.some((t) => t.id === state.activeTemplateId)
          ? state.activeTemplateId
          : null,
    })),

  setActiveTemplate: (id) =>
    set((state) => {
      if (id === null) return { activeTemplateId: null }
      const template = state.templates.find((t) => t.id === id)
      if (!template) return state
      return { activeTemplateId: id, placingKind: template.kind }
    }),

  addEntityFromTemplate: (position) => {
    const state = get()
    const template =
      state.activeTemplateId === null
        ? undefined
        : state.templates.find((t) => t.id === state.activeTemplateId)
    if (!template) {
      return get().addEntity({ kind: state.placingKind, position })
    }
    const partial: NewEditorEntity = { kind: template.kind, position }
    if (template.modelPath !== undefined) partial.modelPath = template.modelPath
    if (template.scale !== undefined) partial.scale = template.scale
    if (template.collisionRadius !== undefined) partial.collisionRadius = template.collisionRadius
    if (template.name !== undefined) partial.name = template.name
    return get().addEntity(partial)
  },

  addEntity: (partial = {}) => {
    const state = get()
    const kind = partial.kind ?? state.placingKind
    const counters = { ...state.counters }
    let id: string
    do {
      counters[kind] += 1
      id = `${kind}-${counters[kind]}`
    } while (state.entities.some((e) => e.id === id))

    const entity: EditorEntity = {
      id,
      kind,
      position: partial.position ?? [0, 0, 0],
      rotationY: partial.rotationY ?? 0,
      scale: partial.scale ?? 1,
    }
    if (partial.name !== undefined) entity.name = partial.name
    if (partial.modelPath !== undefined) entity.modelPath = partial.modelPath
    if (partial.collisionRadius !== undefined) entity.collisionRadius = partial.collisionRadius

    set({ entities: [...state.entities, entity], counters, ...pushHistory(state) })
    return entity
  },

  updateEntity: (id, patch, options) =>
    set((state) => {
      const index = state.entities.findIndex((e) => e.id === id)
      const current = state.entities[index]
      if (!current) return state
      const entities = [...state.entities]
      entities[index] = { ...current, ...patch, id: current.id }
      if (options?.transient) {
        // Remember the pre-burst snapshot on the first transient update; the
        // burst becomes one undo step when commitTransient() runs.
        return state.pendingSnapshot === null
          ? { entities, pendingSnapshot: cloneEntities(state.entities) }
          : { entities }
      }
      return { entities, ...pushHistory(state) }
    }),

  commitTransient: () =>
    set((state) => {
      if (state.pendingSnapshot === null) return state
      return {
        past: appendCapped(state.past, state.pendingSnapshot),
        future: [],
        canUndo: true,
        canRedo: false,
        pendingSnapshot: null,
      }
    }),

  duplicate: (id) => {
    const state = get()
    const source = state.entities.find((e) => e.id === id)
    if (!source) return undefined
    const partial: NewEditorEntity = {
      kind: source.kind,
      position: [source.position[0] + 1, source.position[1], source.position[2] + 1],
      rotationY: source.rotationY,
      scale: source.scale,
    }
    if (source.name !== undefined) partial.name = source.name
    if (source.modelPath !== undefined) partial.modelPath = source.modelPath
    if (source.collisionRadius !== undefined) partial.collisionRadius = source.collisionRadius
    const clone = get().addEntity(partial)
    get().select(clone.id)
    return clone
  },

  undo: () =>
    set((state) => {
      // An uncommitted transient burst counts as the newest undoable step.
      const past =
        state.pendingSnapshot !== null
          ? appendCapped(state.past, state.pendingSnapshot)
          : state.past
      const previous = past[past.length - 1]
      if (!previous) return state
      const entities = cloneEntities(previous)
      return {
        entities,
        past: past.slice(0, -1),
        future: appendCapped(state.future, cloneEntities(state.entities)),
        canUndo: past.length > 1,
        canRedo: true,
        ...pruneSelection(state.selectedIds, entities),
        pendingSnapshot: null,
      }
    }),

  redo: () =>
    set((state) => {
      const next = state.future[state.future.length - 1]
      if (!next) return state
      let past = state.past
      if (state.pendingSnapshot !== null) past = appendCapped(past, state.pendingSnapshot)
      const entities = cloneEntities(next)
      return {
        entities,
        past: appendCapped(past, cloneEntities(state.entities)),
        future: state.future.slice(0, -1),
        canUndo: true,
        canRedo: state.future.length > 1,
        ...pruneSelection(state.selectedIds, entities),
        pendingSnapshot: null,
      }
    }),

  removeEntity: (id) =>
    set((state) => {
      if (!state.entities.some((e) => e.id === id)) return state
      const entities = state.entities.filter((e) => e.id !== id)
      return {
        entities,
        ...pruneSelection(state.selectedIds, entities),
        ...pushHistory(state),
      }
    }),

  select: (id) =>
    set((state) => {
      if (id !== null && !state.entities.some((e) => e.id === id)) return state
      return selectionFrom(id === null ? [] : [id])
    }),

  toggleSelect: (id) =>
    set((state) => {
      if (!state.entities.some((e) => e.id === id)) return state
      const without = state.selectedIds.filter((selected) => selected !== id)
      return selectionFrom(
        without.length === state.selectedIds.length ? [...state.selectedIds, id] : without
      )
    }),

  selectMany: (ids) =>
    set((state) => {
      const next: string[] = []
      for (const id of ids) {
        if (!next.includes(id) && state.entities.some((e) => e.id === id)) next.push(id)
      }
      return selectionFrom(next)
    }),

  clearSelection: () => set(selectionFrom([])),

  removeSelected: () =>
    set((state) => {
      if (state.selectedIds.length === 0) return state
      const selected = new Set(state.selectedIds)
      return {
        entities: state.entities.filter((e) => !selected.has(e.id)),
        ...selectionFrom([]),
        ...pushHistory(state),
      }
    }),

  duplicateSelected: () => {
    const state = get()
    if (state.selectedIds.length === 0) return []
    const selected = new Set(state.selectedIds)
    const counters = { ...state.counters }
    const entities = [...state.entities]
    const clones: EditorEntity[] = []
    // Clone in working-set order so ids stay deterministic.
    for (const source of state.entities) {
      if (!selected.has(source.id)) continue
      let id: string
      do {
        counters[source.kind] += 1
        id = `${source.kind}-${counters[source.kind]}`
      } while (entities.some((e) => e.id === id))
      const clone: EditorEntity = {
        ...source,
        id,
        position: [source.position[0] + 1, source.position[1], source.position[2] + 1],
      }
      entities.push(clone)
      clones.push(clone)
    }
    set({
      entities,
      counters,
      ...selectionFrom(clones.map((clone) => clone.id)),
      ...pushHistory(state),
    })
    return clones
  },

  moveSelectedBy: (dx, dz, options) =>
    set((state) => {
      if (state.selectedIds.length === 0) return state
      if (!Number.isFinite(dx) || !Number.isFinite(dz)) return state
      if (dx === 0 && dz === 0) return state
      const selected = new Set(state.selectedIds)
      const entities = state.entities.map((e) =>
        selected.has(e.id)
          ? { ...e, position: [e.position[0] + dx, e.position[1], e.position[2] + dz] as Vec3 }
          : e
      )
      if (options?.transient) {
        // Same burst mechanism as updateEntity: remember the pre-burst
        // snapshot once; commitTransient() turns the burst into one step.
        return state.pendingSnapshot === null
          ? { entities, pendingSnapshot: cloneEntities(state.entities) }
          : { entities }
      }
      return { entities, ...pushHistory(state) }
    }),

  alignSelected: (axis, mode) =>
    set((state) => {
      if (state.selectedIds.length < 2) return state
      const index = axis === 'x' ? 0 : 2
      const selected = new Set(state.selectedIds)
      const coords = state.entities
        .filter((e) => selected.has(e.id))
        .map((e) => e.position[index])
      const min = Math.min(...coords)
      const max = Math.max(...coords)
      const target = mode === 'min' ? min : mode === 'max' ? max : (min + max) / 2
      const entities = state.entities.map((e) => {
        if (!selected.has(e.id)) return e
        const position: Vec3 = [e.position[0], e.position[1], e.position[2]]
        position[index] = target
        return { ...e, position }
      })
      return { entities, ...pushHistory(state) }
    }),

  distributeSelected: (axis) =>
    set((state) => {
      if (state.selectedIds.length < 2) return state
      const index = axis === 'x' ? 0 : 2
      const selected = new Set(state.selectedIds)
      // Array.sort is stable: equal coordinates keep working-set order.
      const sorted = state.entities
        .filter((e) => selected.has(e.id))
        .sort((a, b) => a.position[index] - b.position[index])
      const first = sorted[0]
      const last = sorted[sorted.length - 1]
      if (!first || !last) return state
      const min = first.position[index]
      const step = (last.position[index] - min) / (sorted.length - 1)
      const targetByEntityId = new Map<string, number>()
      sorted.forEach((e, i) => targetByEntityId.set(e.id, min + step * i))
      const entities = state.entities.map((e) => {
        const target = targetByEntityId.get(e.id)
        if (target === undefined) return e
        const position: Vec3 = [e.position[0], e.position[1], e.position[2]]
        position[index] = target
        return { ...e, position }
      })
      return { entities, ...pushHistory(state) }
    }),

  loadEntities: (entities) =>
    set((state) => ({
      entities: [...entities],
      ...selectionFrom([]),
      counters: countersFrom(entities),
      ...pushHistory(state),
    })),

  loadSceneConfig: (config) => {
    get().loadEntities(sceneConfigToEditorEntities(config))
  },

  clear: () =>
    set((state) => ({
      entities: [],
      ...selectionFrom([]),
      counters: emptyCounters(),
      ...pushHistory(state),
    })),

  exportScene: () => exportEntities(get().entities),

  importScene: (json) => {
    get().loadEntities(importEntities(json))
  },
}))
