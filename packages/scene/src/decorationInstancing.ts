import * as THREE from 'three'
import type { DecorationInstance } from './types'
import type { Collider } from './collisionStore'
import { selectLodLevel, type LodLevel } from './lod'

export interface DecorationSet {
  id: string
  modelPath: string
  instances: DecorationInstance[]
  collision?: { radius: number }
  lod?: LodLevel[]
}

const _euler = new THREE.Euler()
const _quat = new THREE.Quaternion()
const _pos = new THREE.Vector3()
const _scale = new THREE.Vector3()

/** Compose a transform matrix from one decoration instance. */
export function instanceMatrix(inst: DecorationInstance): THREE.Matrix4 {
  _pos.set(inst.position[0], inst.position[1], inst.position[2])
  const r = inst.rotation ?? [0, 0, 0]
  _euler.set(r[0], r[1], r[2])
  _quat.setFromEuler(_euler)
  const s = inst.scale ?? 1
  _scale.set(s, s, s)
  return new THREE.Matrix4().compose(_pos, _quat, _scale)
}

/** Single source of truth: colliders derived from the same instance list. */
export function decorationColliders(set: DecorationSet): Collider[] {
  if (!set.collision) return []
  return set.instances.map((inst, i) => ({
    id: `decoration-${set.id}-${i}`,
    position: new THREE.Vector3(inst.position[0], 0, inst.position[2]),
    radius: set.collision!.radius,
    type: 'decoration' as const,
  }))
}

/** All colliders across a list of decoration sets — the collision single source of truth. */
export function collidersForSets(sets: DecorationSet[]): Collider[] {
  return sets.flatMap(decorationColliders)
}

/** Average X/Z of a set's instances — the point LOD distance is measured from. */
export function setCentroid(set: DecorationSet): { x: number; z: number } {
  if (set.instances.length === 0) return { x: 0, z: 0 }
  let sx = 0
  let sz = 0
  for (const inst of set.instances) {
    sx += inst.position[0]
    sz += inst.position[2]
  }
  return { x: sx / set.instances.length, z: sz / set.instances.length }
}

/**
 * Pick the model a decoration set should render for the player's position.
 * Reuses the LOD hysteresis logic; the base `modelPath` is LOD0. Sets without
 * a `lod` field always render `modelPath` (unchanged behavior).
 */
export function selectDecorationModel(
  set: DecorationSet,
  playerPos: { x: number; z: number },
  prevIndex = 0,
): { index: number; modelPath: string } {
  if (!set.lod || set.lod.length === 0) return { index: 0, modelPath: set.modelPath }
  const levels: LodLevel[] = [{ distance: 0, modelPath: set.modelPath }, ...set.lod]
  const c = setCentroid(set)
  const dist = Math.hypot(playerPos.x - c.x, playerPos.z - c.z)
  const { index, level } = selectLodLevel(dist, levels, { prevIndex })
  return { index, modelPath: level.modelPath }
}
