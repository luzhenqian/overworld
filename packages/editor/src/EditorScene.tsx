/**
 * R3F editing layer, mounted inside the game's `<Canvas>`. Renders nothing
 * while the editor is disabled. When enabled it adds:
 *
 * - an invisible ground plane that turns pointer events into place clicks
 *   (place mode) / deselect clicks and drag-move targets (select mode);
 * - placeholder meshes for every editor entity (capsule = NPC, box =
 *   building, cylinder = decoration) with an emissive highlight + ground
 *   ring on the selected one.
 *
 * All pointer handling uses R3F's built-in raycast events — no manual
 * raycasters. Geometries/materials are created once per mount and disposed
 * on unmount; there is no per-frame work at all.
 */
import { useCallback, useEffect, useMemo, useRef, type ReactElement } from 'react'
import * as THREE from 'three'
import type { ThreeEvent } from '@react-three/fiber'
import { useEditorStore, type EditorEntity, type EditorEntityKind } from './editorStore'

/** Props for {@link EditorScene}. */
export interface EditorSceneProps {
  /** Edge length of the clickable ground plane. Default: 100. */
  groundSize?: number
  /** World Y of the ground plane; placed entities get this Y. Default: 0. */
  y?: number
  /** Placement/drag grid size; `0` disables snapping. Default: 0.5. */
  snap?: number
}

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

interface EntityMeshProps {
  entity: EditorEntity
  selected: boolean
  resources: EditorResources
  onPointerDown: (event: ThreeEvent<PointerEvent>, id: string) => void
}

/** Placeholder mesh (+ selection ring) for one editor entity. */
function EntityMesh({ entity, selected, resources, onPointerDown }: EntityMeshProps): ReactElement {
  const { geometries, materials } = resources
  const [x, baseY, z] = entity.position
  const pair = materials[entity.kind]

  const handlePointerDown = useCallback(
    (event: ThreeEvent<PointerEvent>) => onPointerDown(event, entity.id),
    [onPointerDown, entity.id]
  )

  return (
    <>
      <mesh
        geometry={geometries[entity.kind]}
        material={selected ? pair.selected : pair.base}
        position={[x, baseY + CENTER_OFFSET[entity.kind] * entity.scale, z]}
        rotation-y={entity.rotationY}
        scale={entity.scale}
        onPointerDown={handlePointerDown}
      />
      {selected && (
        <mesh
          geometry={geometries.ring}
          material={materials.ring}
          position={[x, baseY + 0.02, z]}
          rotation-x={-Math.PI / 2}
          scale={entity.scale}
        />
      )}
    </>
  )
}

function EditorSceneImpl({ groundSize = 100, y = 0, snap = 0.5 }: EditorSceneProps): ReactElement {
  const entities = useEditorStore((s) => s.entities)
  const selectedId = useEditorStore((s) => s.selectedId)
  const resources = useEditorResources()

  /** Id of the entity currently being dragged (select mode only). */
  const draggingRef = useRef<string | null>(null)

  // Safety net: end the drag even when the pointer is released outside the
  // ground plane (or outside the canvas entirely).
  useEffect(() => {
    if (typeof window === 'undefined') return
    const end = () => {
      draggingRef.current = null
    }
    window.addEventListener('pointerup', end)
    return () => window.removeEventListener('pointerup', end)
  }, [])

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
        const entity = store.addEntity({
          kind: store.placingKind,
          position: [snapValue(event.point.x, snap), y, snapValue(event.point.z, snap)],
        })
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
      useEditorStore
        .getState()
        .updateEntity(dragging, {
          position: [snapValue(event.point.x, snap), y, snapValue(event.point.z, snap)],
        })
    },
    [snap, y]
  )

  const handleGroundPointerUp = useCallback(() => {
    draggingRef.current = null
  }, [])

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
        onPointerUp={handleGroundPointerUp}
      />
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
 *   <EditorScene groundSize={120} snap={0.5} />
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
