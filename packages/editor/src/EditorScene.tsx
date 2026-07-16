/**
 * R3F editing layer, mounted inside the game's `<Canvas>`. Renders nothing
 * while the editor is disabled. When enabled it adds:
 *
 * - an invisible ground plane that turns pointer events into place clicks
 *   (place mode) / deselect clicks and drag-move targets (select mode);
 * - placeholder meshes for every editor entity (capsule = NPC, box =
 *   building, cylinder = decoration) with an emissive highlight + ground
 *   ring on the selected one;
 * - the actual GLTF model instead of the placeholder when an entity has a
 *   non-empty `modelPath` (loading and load failures both fall back to the
 *   placeholder — the editor never crashes on a bad path);
 * - an optional snapping grid (`showGrid` in the store) whose cell size
 *   follows the effective snap step.
 *
 * Place-mode clicks go through the store's `addEntityFromTemplate`, so an
 * active template (see `setTemplates` / `setActiveTemplate`) pre-fills the
 * new entity's fields. Drag-moves use transient store updates and commit on
 * pointer-up, so a whole drag is a single undo step.
 *
 * All pointer handling uses R3F's built-in raycast events — no manual
 * raycasters. Geometries/materials are created once per mount and disposed
 * on unmount; there is no per-frame work at all.
 */
import {
  Component,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type ReactElement,
  type ReactNode,
} from 'react'
import * as THREE from 'three'
import { useLoader, type ThreeEvent } from '@react-three/fiber'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { useEditorStore, type EditorEntity, type EditorEntityKind } from './editorStore'

/** Props for {@link EditorScene}. */
export interface EditorSceneProps {
  /** Edge length of the clickable ground plane. Default: 100. */
  groundSize?: number
  /** World Y of the ground plane; placed entities get this Y. Default: 0. */
  y?: number
  /**
   * Placement/drag grid size; `0` disables snapping. **Override** — when
   * provided it wins over the store's adjustable `snap`; leave it unset to
   * let the panel's 吸附 input control snapping. Default: unset (store value,
   * initially 0.5).
   */
  snap?: number
}

/** gridHelper divisions are clamped here so tiny snap values can't explode. */
const MAX_GRID_DIVISIONS = 200

const COLORS: Record<EditorEntityKind, string> = {
  npc: '#7dd3fc',
  building: '#fbbf24',
  decoration: '#4ade80',
}

const EMISSIVE = '#38bdf8'

/** Placeholder half-heights (mesh center offset above the entity origin). */
const CENTER_OFFSET: Record<EditorEntityKind, number> = {
  npc: 1, // capsule, total height ~2
  building: 1, // 2×2×2 box
  decoration: 0.6, // cylinder, height 1.2
}

interface EditorResources {
  geometries: Record<EditorEntityKind, THREE.BufferGeometry> & {
    ring: THREE.RingGeometry
    ground: THREE.PlaneGeometry
  }
  materials: Record<EditorEntityKind, { base: THREE.Material; selected: THREE.Material }> & {
    ring: THREE.Material
    ground: THREE.Material
  }
}

/** One-time (per mount) geometry/material pool, disposed on unmount. */
function useEditorResources(): EditorResources {
  const resources = useMemo<EditorResources>(() => {
    const materialPair = (kind: EditorEntityKind) => ({
      base: new THREE.MeshStandardMaterial({ color: COLORS[kind] }),
      selected: new THREE.MeshStandardMaterial({
        color: COLORS[kind],
        emissive: EMISSIVE,
        emissiveIntensity: 0.7,
      }),
    })
    return {
      geometries: {
        npc: new THREE.CapsuleGeometry(0.4, 1.2, 4, 12),
        building: new THREE.BoxGeometry(2, 2, 2),
        decoration: new THREE.CylinderGeometry(0.4, 0.5, 1.2, 12),
        ring: new THREE.RingGeometry(0.8, 1.05, 32),
        ground: new THREE.PlaneGeometry(1, 1),
      },
      materials: {
        npc: materialPair('npc'),
        building: materialPair('building'),
        decoration: materialPair('decoration'),
        ring: new THREE.MeshBasicMaterial({
          color: EMISSIVE,
          transparent: true,
          opacity: 0.8,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
        ground: new THREE.MeshBasicMaterial(),
      },
    }
  }, [])

  useEffect(() => {
    return () => {
      const { geometries, materials } = resources
      Object.values(geometries).forEach((g) => g.dispose())
      for (const kind of ['npc', 'building', 'decoration'] as const) {
        materials[kind].base.dispose()
        materials[kind].selected.dispose()
      }
      materials.ring.dispose()
      materials.ground.dispose()
    }
  }, [resources])

  return resources
}

function snapValue(value: number, snap: number): number {
  return snap > 0 ? Math.round(value / snap) * snap : value
}

/**
 * Loads a GLTF and renders a **clone** of its scene (so several entities can
 * share one cached load without fighting over the same object graph).
 * `useLoader` caches by URL — the file is fetched once per URL, never per
 * frame or per entity. The clone shares geometries/materials with the cached
 * original and is intentionally left to the GC on unmount: disposing it
 * would kill the shared cache entry for every other clone.
 *
 * `useLoader` **suspends** while loading and **throws** on failure — callers
 * must wrap this in `<Suspense>` + an error boundary (see
 * {@link ModelFallbackBoundary}).
 */
function EntityModel({ url, scale }: { url: string; scale: number }): ReactElement {
  const gltf = useLoader(GLTFLoader, url)
  const cloned = useMemo(() => gltf.scene.clone(true), [gltf])
  return <primitive object={cloned} scale={scale} />
}

/**
 * Minimal error boundary: renders `fallback` once the subtree throws (e.g.
 * `useLoader` rejecting on a 404/parse error). Keyed by URL at the call
 * site, so editing `modelPath` retries the load with a fresh boundary.
 */
class ModelFallbackBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

/** The placeholder primitive (capsule/box/cylinder) for one entity kind. */
function PlaceholderMesh(props: {
  entity: EditorEntity
  selected: boolean
  resources: EditorResources
}): ReactElement {
  const { geometries, materials } = props.resources
  const pair = materials[props.entity.kind]
  return (
    <mesh
      geometry={geometries[props.entity.kind]}
      material={props.selected ? pair.selected : pair.base}
      position={[0, CENTER_OFFSET[props.entity.kind] * props.entity.scale, 0]}
      scale={props.entity.scale}
    />
  )
}

interface EntityMeshProps {
  entity: EditorEntity
  selected: boolean
  resources: EditorResources
  onPointerDown: (event: ThreeEvent<PointerEvent>, id: string) => void
}

/**
 * One editor entity: a group at the entity's position/rotation containing
 * either the GLTF model (when `modelPath` is set; placeholder while loading
 * or on load failure) or the placeholder primitive, plus the selection ring.
 * The pointer handler sits on the **group**, so clicking works identically
 * for placeholder and model (R3F events bubble up the object tree).
 */
function EntityMesh({ entity, selected, resources, onPointerDown }: EntityMeshProps): ReactElement {
  const { geometries, materials } = resources
  const [x, baseY, z] = entity.position

  const handlePointerDown = useCallback(
    (event: ThreeEvent<PointerEvent>) => onPointerDown(event, entity.id),
    [onPointerDown, entity.id]
  )

  const placeholder = (
    <PlaceholderMesh entity={entity} selected={selected} resources={resources} />
  )

  return (
    <group position={[x, baseY, z]} rotation-y={entity.rotationY} onPointerDown={handlePointerDown}>
      {entity.modelPath ? (
        // Key by URL so editing modelPath resets a previous load failure.
        <ModelFallbackBoundary key={entity.modelPath} fallback={placeholder}>
          <Suspense fallback={placeholder}>
            <EntityModel url={entity.modelPath} scale={entity.scale} />
          </Suspense>
        </ModelFallbackBoundary>
      ) : (
        placeholder
      )}
      {selected && (
        <mesh
          geometry={geometries.ring}
          material={materials.ring}
          position={[0, 0.02, 0]}
          rotation-x={-Math.PI / 2}
          scale={entity.scale}
        />
      )}
    </group>
  )
}

function EditorSceneImpl({ groundSize = 100, y = 0, snap: snapProp }: EditorSceneProps): ReactElement {
  const entities = useEditorStore((s) => s.entities)
  const selectedId = useEditorStore((s) => s.selectedId)
  const storeSnap = useEditorStore((s) => s.snap)
  const showGrid = useEditorStore((s) => s.showGrid)
  const resources = useEditorResources()

  // The `snap` prop is an override: when provided it wins over the store's
  // adjustable value (panel input / setSnap).
  const snap = snapProp ?? storeSnap

  /** Id of the entity currently being dragged (select mode only). */
  const draggingRef = useRef<string | null>(null)

  const endDrag = useCallback(() => {
    if (!draggingRef.current) return
    draggingRef.current = null
    // Collapse the whole drag (a burst of transient updates) into one undo step.
    useEditorStore.getState().commitTransient()
  }, [])

  // Safety net: end the drag even when the pointer is released outside the
  // ground plane (or outside the canvas entirely).
  useEffect(() => {
    if (typeof window === 'undefined') return
    window.addEventListener('pointerup', endDrag)
    return () => window.removeEventListener('pointerup', endDrag)
  }, [endDrag])

  const handleEntityPointerDown = useCallback((event: ThreeEvent<PointerEvent>, id: string) => {
    const store = useEditorStore.getState()
    if (store.mode !== 'select') return // place mode: let the ray reach the ground
    event.stopPropagation()
    store.select(id)
    draggingRef.current = id
  }, [])

  const handleGroundPointerDown = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      if (draggingRef.current) return
      const store = useEditorStore.getState()
      if (store.mode === 'place') {
        event.stopPropagation()
        // Pre-fills kind/model/scale/... from the active template (if any);
        // falls back to a bare `placingKind` entity otherwise.
        const entity = store.addEntityFromTemplate([
          snapValue(event.point.x, snap),
          y,
          snapValue(event.point.z, snap),
        ])
        store.select(entity.id)
      } else {
        // Select mode, empty ground: deselect. (Entity meshes stopPropagation
        // on their own pointerdown, so this only fires on true misses.)
        store.select(null)
      }
    },
    [snap, y]
  )

  const handleGroundPointerMove = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      const dragging = draggingRef.current
      if (!dragging) return
      useEditorStore.getState().updateEntity(
        dragging,
        { position: [snapValue(event.point.x, snap), y, snapValue(event.point.z, snap)] },
        { transient: true }
      )
    },
    [snap, y]
  )

  // divisions = groundSize / snap, clamped so tiny snap values stay renderable.
  const gridDivisions = Math.min(
    MAX_GRID_DIVISIONS,
    Math.max(1, Math.round(groundSize / (snap > 0 ? snap : 1)))
  )

  return (
    <group>
      <mesh
        visible={false}
        geometry={resources.geometries.ground}
        material={resources.materials.ground}
        position={[0, y, 0]}
        rotation-x={-Math.PI / 2}
        scale={[groundSize, groundSize, 1]}
        onPointerDown={handleGroundPointerDown}
        onPointerMove={handleGroundPointerMove}
        onPointerUp={endDrag}
      />
      {showGrid && (
        // Slightly elevated to avoid z-fighting with the game's own ground.
        <gridHelper args={[groundSize, gridDivisions]} position={[0, y + 0.02, 0]} />
      )}
      {entities.map((entity) => (
        <EntityMesh
          key={entity.id}
          entity={entity}
          selected={entity.id === selectedId}
          resources={resources}
          onPointerDown={handleEntityPointerDown}
        />
      ))}
    </group>
  )
}

/**
 * The in-canvas half of the editor. Mount inside `<Canvas>` alongside the
 * scene; pair with `<EditorPanel>` outside the canvas:
 *
 * ```tsx
 * <Canvas>
 *   <MyScene />
 *   <EditorScene groundSize={120} />
 * </Canvas>
 * <EditorPanel />
 * <EditorToggle hotkey="F2" />
 * ```
 *
 * Renders `null` while `useEditorStore.enabled` is false, so it can stay
 * mounted permanently in development builds.
 */
export function EditorScene(props: EditorSceneProps): ReactElement | null {
  const enabled = useEditorStore((s) => s.enabled)
  if (!enabled) return null
  return <EditorSceneImpl {...props} />
}
