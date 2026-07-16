/**
 * `SceneJson` — the serialized scene-authoring document — plus the pure
 * mappers and a convenience component that turn it into `<SceneShell>` props.
 *
 * ## Structural compatibility with `@overworld-engine/editor`
 *
 * `SceneJson` is **structurally identical** to the `EditorSceneJSON` produced
 * by `@overworld-engine/editor`'s `exportScene()` / `exportEntities()`: its
 * `npcs` are `NPCConfig`s, its `buildings` are `BuildingConfig`s, and each
 * `decorations` group is a `DecorationCollisionGroup`
 * (`{ instances: DecorationInstance[]; radius: number }`).
 *
 * Per the framework's layering rules the scene and editor packages never
 * import each other — the editor's exported JSON plugs into this package
 * purely via structural typing. In practice this means
 * `useEditorStore.getState().exportScene()` is directly assignable to
 * `SceneJson` and can be rendered with `<SceneFromJson json={...} />` with no
 * conversion step. The only shape difference is intentional: `SceneJson`
 * marks `buildings` / `decorations` optional (the editor always emits them),
 * so a hand-authored document may omit empty sections.
 */
import { useMemo } from 'react'
import { SceneShell, type SceneShellProps } from './SceneShell'
import type { DecorationCollisionGroup } from './CollisionRegistration'
import type { NPCConfig, BuildingConfig, DecorationInstance } from './types'

/**
 * A serialized scene document: the placement of every NPC, building and
 * decoration group. Structurally identical to `@overworld-engine/editor`'s
 * `EditorSceneJSON` (see the module doc) — `buildings` / `decorations` are
 * optional here so hand-authored files may omit empty sections.
 */
export interface SceneJson {
  npcs: NPCConfig[]
  buildings?: BuildingConfig[]
  /** Decoration groups keyed by type name; each is a shared-radius collider group. */
  decorations?: Record<string, DecorationCollisionGroup>
}

/**
 * The subset of `<SceneShell>` props that describe scene *content*
 * (as opposed to lighting/children/theme). This is what the mappers convert
 * `SceneJson` to and from — `DecorationInstance` is re-exported for
 * convenience since it appears in decoration groups.
 */
export type SceneContentProps = Pick<SceneShellProps, 'npcs' | 'buildings' | 'decorationCollisions'>

export type { DecorationInstance }

/**
 * Map a {@link SceneJson} document to `<SceneShell>` content props. The only
 * transformation is renaming `decorations` → `decorationCollisions`; optional
 * sections stay omitted (never set to `undefined`). Pure.
 */
export function sceneJsonToShellProps(json: SceneJson): SceneContentProps {
  const props: SceneContentProps = { npcs: json.npcs }
  if (json.buildings !== undefined) props.buildings = json.buildings
  if (json.decorations !== undefined) props.decorationCollisions = json.decorations
  return props
}

/**
 * Inverse of {@link sceneJsonToShellProps}: map `<SceneShell>` content props
 * back to a {@link SceneJson} document (renaming `decorationCollisions` →
 * `decorations`; optional sections stay omitted). Pure.
 *
 * `sceneJsonToShellProps` and `sceneConfigToSceneJson` round-trip losslessly
 * in both directions.
 */
export function sceneConfigToSceneJson(props: SceneContentProps): SceneJson {
  const json: SceneJson = { npcs: props.npcs }
  if (props.buildings !== undefined) json.buildings = props.buildings
  if (props.decorationCollisions !== undefined) json.decorations = props.decorationCollisions
  return json
}

/**
 * One named scene inside a {@link SceneProjectLike} — a structural mirror of
 * `@overworld-engine/editor`'s `SceneProjectSceneJSON` (`{ id, name, scene }`).
 * Defined locally so the scene package never imports the editor.
 */
export interface SceneProjectSceneLike {
  id: string
  name: string
  scene: SceneJson
}

/**
 * A multi-scene project document — the structural shape of the editor's
 * `SceneProjectJson` (`exportProject()` output). Only the `scenes` array is
 * needed to pick a level; `version` / `activeSceneId` are accepted but ignored
 * by {@link pickScene}. Defined structurally so a game can pass a parsed
 * project straight in with no import of the editor package.
 */
export interface SceneProjectLike {
  scenes: SceneProjectSceneLike[]
  activeSceneId?: string
  version?: number
}

/**
 * Pick a single level's {@link SceneJson} out of a multi-scene project by its
 * `id` (preferred) or, failing that, its display `name`. Returns `undefined`
 * when nothing matches (or the project has no `scenes`). Pure and tolerant of
 * loosely-typed input — a game can render a specific level with:
 *
 * ```tsx
 * <SceneFromJson json={pickScene(project, 'level-1')} />
 * ```
 *
 * (Guard against `undefined` before rendering — e.g. show a fallback when the
 * level id is unknown.)
 */
export function pickScene(project: SceneProjectLike, nameOrId: string): SceneJson | undefined {
  const scenes = project?.scenes
  if (!Array.isArray(scenes)) return undefined
  const byId = scenes.find((entry) => entry?.id === nameOrId)
  if (byId) return byId.scene
  return scenes.find((entry) => entry?.name === nameOrId)?.scene
}

/** Props for {@link SceneFromJson}: a {@link SceneJson} plus any other `<SceneShell>` prop. */
export interface SceneFromJsonProps
  extends Omit<SceneShellProps, 'npcs' | 'buildings' | 'decorationCollisions'> {
  /** The scene document to render (e.g. the editor's `exportScene()` output). */
  json: SceneJson
}

/**
 * Render a {@link SceneJson} document as a live world. A thin wrapper over
 * `<SceneShell>`: it maps `json` to the NPC/building/decoration props via
 * {@link sceneJsonToShellProps} (memoized on `json`) and passes every other
 * prop — `player`, `children` (lighting/ground/portals), `theme`, … —
 * straight through.
 *
 * ```tsx
 * const json = useEditorStore.getState().exportScene() // structurally a SceneJson
 * <Canvas>
 *   <SceneFromJson json={json} player={null}>
 *     <ambientLight intensity={0.6} />
 *   </SceneFromJson>
 * </Canvas>
 * ```
 */
export function SceneFromJson({ json, ...rest }: SceneFromJsonProps) {
  const mapped = useMemo(() => sceneJsonToShellProps(json), [json])
  return (
    <SceneShell
      npcs={mapped.npcs}
      buildings={mapped.buildings}
      decorationCollisions={mapped.decorationCollisions}
      {...rest}
    />
  )
}
