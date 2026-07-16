/**
 * Dynamic obstacle avoidance: pure X/Z-plane geometry helpers plus the
 * per-step steering used by {@link createAgent} when `config.avoid` is set.
 *
 * Avoidance is a **local perturbation of the current frame's step only** —
 * it never mutates the planned path. Everything here is deterministic
 * (no randomness) and free of three.js / React.
 */
import type { Obstacle } from './grid'

/** Configuration for `createAgent({ avoid })` — see {@link createAgent}. */
export interface AvoidOptions {
  /**
   * Returns the current dynamic obstacles, queried once per movement step.
   * Return a stable array when nothing changed; the agent never mutates it.
   */
  obstacles: () => ReadonlyArray<Obstacle>
  /**
   * How far ahead (world units) to probe along the movement direction.
   * The probe never extends past the current waypoint. @default 1.5
   */
  lookahead?: number
  /** Obstacles are inflated by this radius for clearance checks. @default 0.4 */
  agentRadius?: number
  /**
   * After being fully blocked (no clear deflection) for this many ms, an
   * agent with a grid re-plans its path to the current destination (and
   * retries every `stuckAfterMs` while still blocked). @default 1200
   */
  stuckAfterMs?: number
}

/**
 * Whether the segment `(ax, az) → (bx, bz)` comes within `radius` of the
 * circle center `(cx, cz)`. Tangency counts as a hit (`<=`). Degenerate
 * zero-length segments are treated as a point test.
 */
export function segmentHitsCircle(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  cx: number,
  cz: number,
  radius: number
): boolean {
  const dx = bx - ax
  const dz = bz - az
  const lengthSq = dx * dx + dz * dz
  // Parameter of the closest point on the segment, clamped to [0, 1].
  let t = 0
  if (lengthSq > 0) {
    t = ((cx - ax) * dx + (cz - az) * dz) / lengthSq
    t = t < 0 ? 0 : t > 1 ? 1 : t
  }
  const px = ax + dx * t - cx
  const pz = az + dz * t - cz
  return px * px + pz * pz <= radius * radius
}

/**
 * Rotate the direction `(dirX, dirZ)` by `angle` radians on the X/Z plane.
 * Positive angles rotate the same way `heading` grows (`atan2(dx, dz)`:
 * from +Z toward +X); magnitude is preserved.
 */
export function deflect(dirX: number, dirZ: number, angle: number): [number, number] {
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  return [dirX * cos + dirZ * sin, dirZ * cos - dirX * sin]
}

/**
 * Deflection angles tried when the forward probe is blocked, in order.
 * Fixed alternating ± order (30°, 60°, 90°) keeps steering deterministic.
 */
const DEFLECTION_ANGLES: ReadonlyArray<number> = [
  Math.PI / 6,
  -Math.PI / 6,
  Math.PI / 3,
  -Math.PI / 3,
  Math.PI / 2,
  -Math.PI / 2,
]

/** True when the probe from `(x, z)` along `(dirX, dirZ)` misses every inflated obstacle. */
function probeClear(
  obstacles: ReadonlyArray<Obstacle>,
  x: number,
  z: number,
  dirX: number,
  dirZ: number,
  probeLength: number,
  agentRadius: number
): boolean {
  const bx = x + dirX * probeLength
  const bz = z + dirZ * probeLength
  for (const obstacle of obstacles) {
    if (segmentHitsCircle(x, z, bx, bz, obstacle.x, obstacle.z, obstacle.radius + agentRadius)) {
      return false
    }
  }
  return true
}

/**
 * Pick this step's movement direction from `(x, z)` toward `(dirX, dirZ)`
 * (unit vector), probing `probeLength` ahead against `obstacles` inflated by
 * `agentRadius`:
 *
 * - forward clear → the input direction (same array values, so callers can
 *   detect "no deflection" by comparison),
 * - else the first clear deflection at ±30° / ±60° / ±90° (positive side
 *   first at each magnitude — fixed order, fully deterministic),
 * - `null` when every candidate is blocked (the agent should not move).
 */
export function steerStep(
  obstacles: ReadonlyArray<Obstacle>,
  x: number,
  z: number,
  dirX: number,
  dirZ: number,
  probeLength: number,
  agentRadius: number
): [number, number] | null {
  if (probeClear(obstacles, x, z, dirX, dirZ, probeLength, agentRadius)) {
    return [dirX, dirZ]
  }
  for (const angle of DEFLECTION_ANGLES) {
    const [deflectedX, deflectedZ] = deflect(dirX, dirZ, angle)
    if (probeClear(obstacles, x, z, deflectedX, deflectedZ, probeLength, agentRadius)) {
      return [deflectedX, deflectedZ]
    }
  }
  return null
}
