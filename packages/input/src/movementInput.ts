/**
 * Shared movement-input contract between on-screen controls (e.g. the
 * `VirtualJoystick`) and movement consumers (e.g. `<Player>` in
 * `@overworld-engine/scene`).
 *
 * The shape is a mutable ref-like object so producers can write per-frame
 * without triggering React re-renders. `@overworld-engine/input` and
 * `@overworld-engine/scene` deliberately do not import each other — each declares
 * this interface itself and the two are **structurally compatible**, so a
 * value created here can be passed straight to `<Player externalInput>`.
 */

/** Current movement state written by an input source. */
export interface MovementInputState {
  /** World X axis: −1 = left … +1 = right (matches A/D keys). */
  x: number
  /** World Z axis: −1 = forward/up-screen … +1 = backward/down-screen (matches W/S keys). */
  z: number
  /** Whether the consumer should use its run speed. */
  running: boolean
}

/**
 * Mutable ref-like container for a movement vector in world axes.
 * `(x, z)` magnitude is always ≤ 1; consumers may scale speed by it.
 */
export interface MovementInputRef {
  current: MovementInputState
}

/**
 * Create a neutral movement input: `{ current: { x: 0, z: 0, running: false } }`.
 * Pass it to `<VirtualJoystick target={...}>` as the write side and to a
 * movement consumer (e.g. `<Player externalInput={...}>`) as the read side.
 */
export function createMovementInput(): MovementInputRef {
  return { current: { x: 0, z: 0, running: false } }
}
