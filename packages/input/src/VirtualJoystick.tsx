/**
 * Self-contained on-screen virtual joystick (base circle + draggable thumb)
 * for touch and mouse, built on Pointer Events. It renders plain DOM with
 * inline styles — place it anywhere outside (or above) your 3D canvas.
 *
 * The joystick does not know about players or scenes: it only writes a
 * normalized movement vector into the `target` ref (see
 * {@link createMovementInput}). Consumers such as `<Player>` in
 * `@overworld-engine/scene` read the same shape via structural typing.
 */
import { useCallback, useEffect, useRef } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import { inputLock } from '@overworld-engine/core'
import type { MovementInputRef } from './movementInput'
import {
  DEFAULT_DEAD_ZONE,
  DEFAULT_RUN_THRESHOLD,
  computeJoystickVector,
  computeThumbOffset,
  resolveJoystickOutput,
  shouldRun,
} from './joystickMath'

export interface VirtualJoystickProps {
  /**
   * Movement input the joystick writes into every pointer move (and resets
   * to `{ x: 0, z: 0, running: false }` on release/unmount). Create one with
   * {@link createMovementInput} and hand the same object to your movement
   * consumer.
   */
  target: MovementInputRef
  /** Base circle diameter in px. Default: 120. */
  size?: number
  /** Deflections below this magnitude read as no input. Default: 0.15. */
  deadZone?: number
  /** Deflections at/above this magnitude set `running: true`. Default: 0.85. */
  runThreshold?: number
  /** Extra class on the base element (for game-specific styling). */
  className?: string
  /**
   * Style overrides merged over the defaults. The joystick defaults to
   * `position: fixed` in the bottom-left corner — override `left`/`bottom`/
   * `right`/`position` here to place it elsewhere.
   */
  style?: CSSProperties
  /**
   * Stable `data-testid` for E2E selectors: the base element gets `testId`,
   * the thumb gets `` `${testId}-thumb` ``. Default: `'ow-joystick'`.
   */
  testId?: string
  /**
   * Zero the joystick output while the shared `inputLock` (from
   * `@overworld-engine/core`) is held — e.g. during dialogue or a cutscene
   * that acquired the lock via `useKeyboardLayer(id, priority, { lockInput: true })`.
   * Default: `true`.
   */
  respectInputLock?: boolean
}

/**
 * Pointer-events based virtual joystick. Works for touch and mouse, blocks
 * page scrolling while dragging (`touch-action: none`) and cleans up /
 * resets `target` on release and unmount.
 *
 * ```tsx
 * const movement = createMovementInput()
 * <Canvas>… <Player externalInput={movement} /> …</Canvas>
 * <VirtualJoystick target={movement} />
 * ```
 */
export function VirtualJoystick({
  target,
  size = 120,
  deadZone = DEFAULT_DEAD_ZONE,
  runThreshold = DEFAULT_RUN_THRESHOLD,
  className,
  style,
  testId = 'ow-joystick',
  respectInputLock = true,
}: VirtualJoystickProps) {
  const baseRef = useRef<HTMLDivElement>(null)
  const thumbRef = useRef<HTMLDivElement>(null)
  /** Pointer currently driving the joystick (null when idle). */
  const activePointerId = useRef<number | null>(null)

  // Keep the latest target without re-binding handlers.
  const targetRef = useRef(target)
  targetRef.current = target

  const radius = size / 2
  const thumbSize = Math.round(size * 0.42)

  /** Zero the movement input and recenter the thumb. */
  const reset = useCallback(() => {
    activePointerId.current = null
    const input = targetRef.current.current
    input.x = 0
    input.z = 0
    input.running = false
    const thumb = thumbRef.current
    if (thumb) thumb.style.transform = 'translate(-50%, -50%)'
  }, [])

  // Never leave stale input behind when the joystick unmounts mid-drag.
  useEffect(() => reset, [reset])

  const applyPointer = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const base = baseRef.current
      if (!base) return

      const rect = base.getBoundingClientRect()
      const dx = event.clientX - (rect.left + rect.width / 2)
      const dy = event.clientY - (rect.top + rect.height / 2)

      const vector = computeJoystickVector(dx, dy, radius, deadZone)
      const locked = inputLock.isLocked()
      const gated = resolveJoystickOutput(
        { x: vector.x, z: vector.z, running: shouldRun(vector.magnitude, runThreshold) },
        { locked, respect: respectInputLock }
      )
      const input = targetRef.current.current
      input.x = gated.x
      input.z = gated.z
      input.running = gated.running

      const thumb = thumbRef.current
      if (thumb) {
        // Recenter the visible thumb when the lock zeroed the output; otherwise track the pointer.
        const offset =
          respectInputLock && locked ? { x: 0, y: 0 } : computeThumbOffset(dx, dy, radius)
        thumb.style.transform = `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`
      }
    },
    [radius, deadZone, runThreshold, respectInputLock]
  )

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (activePointerId.current !== null) return
      activePointerId.current = event.pointerId
      // Route subsequent moves to the base even when the finger leaves it.
      event.currentTarget.setPointerCapture?.(event.pointerId)
      event.preventDefault()
      applyPointer(event)
    },
    [applyPointer]
  )

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.pointerId !== activePointerId.current) return
      applyPointer(event)
    },
    [applyPointer]
  )

  const handlePointerEnd = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.pointerId !== activePointerId.current) return
      reset()
    },
    [reset]
  )

  const baseStyle: CSSProperties = {
    position: 'fixed',
    left: 24,
    bottom: 24,
    width: size,
    height: size,
    borderRadius: '50%',
    background: 'rgba(255, 255, 255, 0.08)',
    border: '2px solid rgba(255, 255, 255, 0.25)',
    boxSizing: 'border-box',
    // Keep the page from scrolling / zooming while dragging the stick.
    touchAction: 'none',
    userSelect: 'none',
    WebkitUserSelect: 'none',
    cursor: 'pointer',
    zIndex: 1000,
    ...style,
  }

  const thumbStyle: CSSProperties = {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: thumbSize,
    height: thumbSize,
    borderRadius: '50%',
    background: 'rgba(255, 255, 255, 0.35)',
    border: '2px solid rgba(255, 255, 255, 0.5)',
    boxSizing: 'border-box',
    transform: 'translate(-50%, -50%)',
    pointerEvents: 'none',
  }

  return (
    <div
      ref={baseRef}
      className={className}
      style={baseStyle}
      data-testid={testId}
      role="application"
      aria-label="Virtual joystick"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onLostPointerCapture={handlePointerEnd}
    >
      <div ref={thumbRef} style={thumbStyle} data-testid={`${testId}-thumb`} />
    </div>
  )
}
