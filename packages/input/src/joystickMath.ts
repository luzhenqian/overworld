/**
 * Pure math for the virtual joystick: pointer offset → normalized movement
 * vector (dead zone + unit-circle clamping), run-threshold check and thumb
 * positioning. Kept free of DOM/React so it can be unit-tested directly.
 */

/** Default dead zone: vectors with magnitude below this read as no input. */
export const DEFAULT_DEAD_ZONE = 0.15

/** Default run threshold: magnitude at or above this requests run speed. */
export const DEFAULT_RUN_THRESHOLD = 0.85

/** Result of {@link computeJoystickVector}. */
export interface JoystickVector {
  /** World X component, −1 (left) … +1 (right). */
  x: number
  /** World Z component, −1 (forward/up-screen) … +1 (backward/down-screen). */
  z: number
  /** Vector magnitude, 0 … 1 (0 when inside the dead zone). */
  magnitude: number
}

/**
 * Convert a pointer offset from the joystick center into a normalized
 * movement vector in world axes.
 *
 * - `dx`/`dy` are screen-space pixels (y grows downward), `radius` is the
 *   pixel distance for full deflection. Screen down maps to world +Z
 *   (backward), matching WASD semantics.
 * - The result is clamped to the unit circle (magnitude ≤ 1).
 * - Magnitudes below `deadZone` collapse to `{ x: 0, z: 0, magnitude: 0 }`.
 */
export function computeJoystickVector(
  dx: number,
  dy: number,
  radius: number,
  deadZone: number = DEFAULT_DEAD_ZONE
): JoystickVector {
  if (radius <= 0) return { x: 0, z: 0, magnitude: 0 }

  let x = dx / radius
  let z = dy / radius

  // Clamp to the unit circle so magnitude never exceeds 1.
  const length = Math.hypot(x, z)
  if (length > 1) {
    x /= length
    z /= length
  }

  const magnitude = Math.min(1, length)
  if (magnitude < deadZone) return { x: 0, z: 0, magnitude: 0 }

  return { x, z, magnitude }
}

/**
 * Whether a joystick deflection requests run speed: true when `magnitude`
 * reaches `runThreshold` (and is non-zero).
 */
export function shouldRun(
  magnitude: number,
  runThreshold: number = DEFAULT_RUN_THRESHOLD
): boolean {
  return magnitude > 0 && magnitude >= runThreshold
}

/**
 * Clamp a pointer offset (pixels from the joystick center) to `maxDistance`
 * for positioning the thumb visual. Direction is preserved.
 */
export function computeThumbOffset(
  dx: number,
  dy: number,
  maxDistance: number
): { x: number; y: number } {
  if (maxDistance <= 0) return { x: 0, y: 0 }
  const length = Math.hypot(dx, dy)
  if (length <= maxDistance) return { x: dx, y: dy }
  const scale = maxDistance / length
  return { x: dx * scale, y: dy * scale }
}
