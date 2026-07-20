import type { Vec3 } from '@overworld-engine/core'

export interface OrbitState { distance: number; yaw: number; pitch: number }
export interface OrbitLimits {
  minDistance: number
  maxDistance: number
  minPitch: number
  maxPitch: number
}
export interface OrbitDelta { dYaw: number; dPitch: number; dZoom: number }

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/** Apply a user input delta to orbit state, clamped to limits. Pure. */
export function applyOrbitDelta(state: OrbitState, delta: OrbitDelta, limits: OrbitLimits): OrbitState {
  return {
    distance: clamp(state.distance + delta.dZoom, limits.minDistance, limits.maxDistance),
    yaw: state.yaw + delta.dYaw,
    pitch: clamp(state.pitch + delta.dPitch, limits.minPitch, limits.maxPitch),
  }
}

/** Convert spherical orbit state to a camera offset from the target. */
export function orbitToOffset(state: OrbitState): Vec3 {
  const { distance, yaw, pitch } = state
  const horizontal = Math.cos(pitch) * distance
  return [
    Math.sin(yaw) * horizontal,
    Math.sin(pitch) * distance,
    Math.cos(yaw) * horizontal,
  ]
}
