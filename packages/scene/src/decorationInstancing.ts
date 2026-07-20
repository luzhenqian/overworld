import * as THREE from 'three'
import type { DecorationInstance } from './types'
import type { Collider } from './collisionStore'

export interface DecorationSet {
  id: string
  modelPath: string
  instances: DecorationInstance[]
  collision?: { radius: number }
  lod?: import('./lod').LodLevel[]
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
