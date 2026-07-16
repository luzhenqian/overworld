/**
 * DOM-less virtual joystick for WeChat mini-games: consumes global `wx`
 * touch events directly (there is no DOM to attach `<VirtualJoystick>` to)
 * and writes the exact same normalized movement vector into a
 * `MovementInputRef` — hand that ref to `<Player externalInput>` and
 * movement works like on the web.
 *
 * The stick is **anchored at the touch-start point** (a "floating"
 * joystick): the first touch in the configured region becomes the center,
 * dragging away from it deflects the stick, releasing resets to neutral.
 * All the math is `@overworld-engine/input`'s pure joystick functions, so
 * dead zone and run threshold behave identically to `<VirtualJoystick>`.
 */
import {
  DEFAULT_DEAD_ZONE,
  DEFAULT_RUN_THRESHOLD,
  computeJoystickVector,
  shouldRun,
  type MovementInputRef,
} from '@overworld-engine/input'
import { getWx, type WxTouch, type WxTouchEvent } from './wxTypes'

/** Options for {@link createWeappTouchJoystick}. */
export interface WeappTouchJoystickOptions {
  /**
   * Which touches grab the joystick: `'left-half'` (default) only reacts to
   * touches starting on the left half of the screen (leaving the right half
   * for interact buttons), `'full'` reacts anywhere.
   */
  region?: 'left-half' | 'full'
  /**
   * Virtual stick diameter in px — full deflection is reached `size / 2`
   * px away from the anchor. Default: 120 (matches `<VirtualJoystick>`).
   */
  size?: number
  /** Deflections below this magnitude read as no input. Default: 0.15. */
  deadZone?: number
  /** Deflections at/above this magnitude set `running: true`. Default: 0.85. */
  runThreshold?: number
}

/** Handle returned by {@link createWeappTouchJoystick}. */
export interface WeappTouchJoystick {
  /** Unbind all touch listeners and reset the target to neutral. */
  dispose(): void
}

/**
 * Subscribe to `wx.onTouchStart/Move/End/Cancel` and drive `target`:
 *
 * ```ts
 * const movement = createMovementInput()
 * const joystick = createWeappTouchJoystick(movement)
 * // <Player externalInput={movement} /> in the R3F tree
 * ```
 *
 * @throws when the global `wx` touch APIs are missing (WeChat *mini-game*
 * only; mini-programs receive touches through WXML instead).
 */
export function createWeappTouchJoystick(
  target: MovementInputRef,
  options: WeappTouchJoystickOptions = {}
): WeappTouchJoystick {
  const wx = getWx()
  if (
    typeof wx.onTouchStart !== 'function' ||
    typeof wx.onTouchMove !== 'function' ||
    typeof wx.onTouchEnd !== 'function'
  ) {
    throw new Error(
      '[overworld/adapters-weapp] wx.onTouchStart/Move/End are not available — ' +
        'createWeappTouchJoystick needs a WeChat *mini-game* environment ' +
        '(mini-programs deliver touches through WXML bindings instead).'
    )
  }

  const region = options.region ?? 'left-half'
  const radius = (options.size ?? 120) / 2
  const deadZone = options.deadZone ?? DEFAULT_DEAD_ZONE
  const runThreshold = options.runThreshold ?? DEFAULT_RUN_THRESHOLD
  const regionMaxX =
    region === 'full' ? Number.POSITIVE_INFINITY : wx.getSystemInfoSync().windowWidth / 2

  /** Touch currently driving the joystick (null when idle). */
  let activeId: number | null = null
  let anchorX = 0
  let anchorY = 0

  const reset = (): void => {
    activeId = null
    target.current.x = 0
    target.current.z = 0
    target.current.running = false
  }

  const findActive = (touches: WxTouch[]): WxTouch | undefined =>
    touches.find((touch) => touch.identifier === activeId)

  const onTouchStart = (event: WxTouchEvent): void => {
    if (activeId !== null) return
    const touch = event.changedTouches.find((t) => t.clientX < regionMaxX)
    if (!touch) return
    activeId = touch.identifier
    anchorX = touch.clientX
    anchorY = touch.clientY
    // The anchor itself is zero deflection — no movement until a drag.
  }

  const onTouchMove = (event: WxTouchEvent): void => {
    if (activeId === null) return
    const touch = findActive(event.changedTouches) ?? findActive(event.touches)
    if (!touch) return
    const vector = computeJoystickVector(
      touch.clientX - anchorX,
      touch.clientY - anchorY,
      radius,
      deadZone
    )
    target.current.x = vector.x
    target.current.z = vector.z
    target.current.running = shouldRun(vector.magnitude, runThreshold)
  }

  const onTouchEnd = (event: WxTouchEvent): void => {
    if (activeId === null) return
    if (findActive(event.changedTouches)) reset()
  }

  wx.onTouchStart(onTouchStart)
  wx.onTouchMove(onTouchMove)
  wx.onTouchEnd(onTouchEnd)
  wx.onTouchCancel?.(onTouchEnd)

  return {
    dispose() {
      wx.offTouchStart?.(onTouchStart)
      wx.offTouchMove?.(onTouchMove)
      wx.offTouchEnd?.(onTouchEnd)
      wx.offTouchCancel?.(onTouchEnd)
      reset()
    },
  }
}
