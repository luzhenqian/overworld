/**
 * Scene-level proximity detection. Each frame the hook compares the player
 * position against every tracked NPC/building, writes the nearest in-range
 * entity to the scene store and emits `proximity:enter` / `proximity:leave`
 * on the global event bus.
 *
 * Run this once per scene (SceneShell does it automatically); entity
 * components such as {@link BaseNPC} simply read `useSceneStore` to know
 * whether they are the nearby entity.
 */
import { useFrame } from '@react-three/fiber'
import { gameEvents, type Vec3 } from '@overworld-engine/core'
import { useSceneStore } from './sceneStore'
import { playerPositionRef } from './playerStore'

/** Minimal shape needed to track an entity's proximity. */
export interface ProximityEntity {
  id: string
  position: Vec3
}

export interface UseProximityDetectionOptions {
  /** NPCs to track. Omit (undefined) to leave NPC proximity unmanaged. */
  npcs?: ProximityEntity[]
  /** Buildings to track. Omit (undefined) to leave building proximity unmanaged. */
  buildings?: ProximityEntity[]
  /** Interaction distance for NPCs. Default: 3. */
  npcRadius?: number
  /** Interaction distance for buildings. Default: 8. */
  buildingRadius?: number
  /**
   * Live position refs for moving NPCs, keyed by npc id. When a ref exists
   * for an npc, its `.current` value is read every frame instead of the
   * static `ProximityEntity.position` passed in `npcs` — the ref is the
   * source of truth for that id from then on. Omit for fully static NPCs.
   */
  npcPositionRefs?: Record<string, { current: Vec3 }>
}

/** Return the id of the nearest entity within `radius`, or null. Prefers a live ref position over the static one when `refs[entity.id]` exists. */
function findNearest(
  entities: ProximityEntity[],
  radius: number,
  px: number,
  py: number,
  pz: number,
  refs: Record<string, { current: Vec3 }> | undefined
): string | null {
  let bestId: string | null = null
  let bestDistance = radius
  for (const entity of entities) {
    const position = refs?.[entity.id]?.current ?? entity.position
    const dx = position[0] - px
    const dy = position[1] - py
    const dz = position[2] - pz
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz)
    if (distance < bestDistance) {
      bestDistance = distance
      bestId = entity.id
    }
  }
  return bestId
}

function updateKind(
  kind: 'npc' | 'building',
  entities: ProximityEntity[] | undefined,
  radius: number,
  px: number,
  py: number,
  pz: number,
  refs: Record<string, { current: Vec3 }> | undefined
): void {
  if (!entities) return
  const state = useSceneStore.getState()
  const current = kind === 'npc' ? state.nearbyNpcId : state.nearbyBuildingId
  const next = findNearest(entities, radius, px, py, pz, refs)
  if (next === current) return

  if (kind === 'npc') {
    state.setNearbyNpc(next)
  } else {
    state.setNearbyBuilding(next)
  }
  if (current) gameEvents.emit('proximity:leave', { kind, id: current })
  if (next) gameEvents.emit('proximity:enter', { kind, id: next })
}

/**
 * Track player proximity to the given entities. Must be used inside a
 * react-three-fiber `<Canvas>`.
 */
export function useProximityDetection({
  npcs,
  buildings,
  npcRadius = 3,
  buildingRadius = 8,
  npcPositionRefs,
}: UseProximityDetectionOptions): void {
  useFrame(() => {
    const [px, py, pz] = playerPositionRef.current
    updateKind('npc', npcs, npcRadius, px, py, pz, npcPositionRefs)
    updateKind('building', buildings, buildingRadius, px, py, pz, undefined)
  })
}
