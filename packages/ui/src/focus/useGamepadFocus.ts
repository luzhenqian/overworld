import { useEffect, useRef } from 'react'
import { navigateByDirection } from '@noriginmedia/norigin-spatial-navigation'
import { axisToDirection } from '../gamepadAxis'

export interface UseGamepadFocusOptions {
  /** Analog-stick dead zone. @default 0.5 */
  deadZone?: number
  /** Minimum ms between repeated directional moves while a direction is held. @default 180 */
  repeatMs?: number
  /** Poll and navigate only when true. @default true */
  enabled?: boolean
}

/**
 * Bridge a gamepad to spatial navigation: the left stick / D-pad move focus via
 * `navigateByDirection`, and the A button (index 0) dispatches a synthetic Enter
 * keydown so norigin's `onEnterPress` handlers fire. No-op when disabled or when
 * the Gamepad API / a connected pad is unavailable.
 */
export function useGamepadFocus(options?: UseGamepadFocusOptions): void {
  const { deadZone = 0.5, repeatMs = 180, enabled = true } = options ?? {}
  const lastMove = useRef(0)
  const aWasDown = useRef(false)

  useEffect(() => {
    if (!enabled || typeof navigator === 'undefined' || !navigator.getGamepads) return
    let raf = 0
    const tick = (now: number): void => {
      const pad = navigator.getGamepads?.()[0]
      if (pad) {
        const dpad = pad.buttons[12]?.pressed
          ? 'up'
          : pad.buttons[13]?.pressed
            ? 'down'
            : pad.buttons[14]?.pressed
              ? 'left'
              : pad.buttons[15]?.pressed
                ? 'right'
                : null
        const dir = dpad ?? axisToDirection(pad.axes[0] ?? 0, pad.axes[1] ?? 0, deadZone)
        if (dir && now - lastMove.current >= repeatMs) {
          lastMove.current = now
          void navigateByDirection(dir, {})
        } else if (!dir) {
          lastMove.current = 0
        }
        const aDown = pad.buttons[0]?.pressed ?? false
        if (aDown && !aWasDown.current) {
          window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
          window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }))
        }
        aWasDown.current = aDown
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [enabled, deadZone, repeatMs])
}
