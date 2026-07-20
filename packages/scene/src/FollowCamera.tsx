/**
 * Smooth third-person follow camera. Extracted from the source game's player
 * controller so it can be used standalone (cutscenes, spectator targets, ...).
 */
import { useEffect, useRef } from 'react'
import { Vector3 } from 'three'
import type * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import type { Vec3 } from '@overworld-engine/core'
import { applyOrbitDelta, orbitToOffset, type OrbitLimits, type OrbitState } from './orbitCamera'
import { resolveInputBlocked } from './inputBlocked'

/** Optional orbit/zoom/drag configuration for {@link FollowCamera}. */
export interface FollowCameraOrbitOptions {
  /** Enable orbit mode. Default: true whenever `orbit` is provided. */
  enabled?: boolean
  minDistance?: number
  maxDistance?: number
  minPitch?: number
  maxPitch?: number
  initialDistance?: number
  initialYaw?: number
  initialPitch?: number
  /** Scales wheel/pinch delta into distance change. Default: 0.02. */
  zoomSpeed?: number
  /** Scales pointer/touch drag delta (px) into yaw/pitch change (rad). Default: 0.005. */
  rotateSpeed?: number
  /** Enable mouse drag + wheel input. Default: true. */
  pointer?: boolean
  /** Enable single-finger drag + two-finger pinch input. Default: true. */
  touch?: boolean
}

export interface FollowCameraProps {
  /** Object the camera follows (e.g. the player group). */
  targetRef: React.RefObject<THREE.Object3D | null>
  /** Camera offset from the target. Default: [0, 10, 30]. */
  offset?: Vec3
  /** Lerp factor per frame (0-1). Default: 0.05. */
  lerp?: number
  /**
   * Optional orbit/zoom/drag controls. When omitted, the camera uses the
   * fixed `offset` above (unchanged default behavior). When provided, the
   * offset is instead derived each frame from a spherical orbit state driven
   * by pointer drag / wheel / pinch input.
   */
  orbit?: FollowCameraOrbitOptions
}

const DEFAULT_ORBIT_DISTANCE = 20
const DEFAULT_ORBIT_YAW = 0
const DEFAULT_ORBIT_PITCH = 0.6
const DEFAULT_MIN_DISTANCE = 5
const DEFAULT_MAX_DISTANCE = 60
const DEFAULT_MIN_PITCH = -1.3
const DEFAULT_MAX_PITCH = 1.3
const DEFAULT_ROTATE_SPEED = 0.005
const DEFAULT_ZOOM_SPEED = 0.02

/**
 * Lerp the default camera toward `target + offset` every frame and look at
 * the target. Renders nothing.
 */
export function FollowCamera({ targetRef, offset = [0, 10, 30], lerp = 0.05, orbit }: FollowCameraProps) {
  const { camera, gl } = useThree()
  const cameraTarget = useRef(new Vector3())
  const desiredPosition = useRef(new Vector3())

  const orbitEnabled = orbit != null && orbit.enabled !== false
  const orbitOptionsRef = useRef(orbit)
  orbitOptionsRef.current = orbit

  const orbitState = useRef<OrbitState>({
    distance: orbit?.initialDistance ?? DEFAULT_ORBIT_DISTANCE,
    yaw: orbit?.initialYaw ?? DEFAULT_ORBIT_YAW,
    pitch: orbit?.initialPitch ?? DEFAULT_ORBIT_PITCH,
  })

  useEffect(() => {
    if (!orbitEnabled) return

    const element = gl.domElement
    const isBlocked = resolveInputBlocked(undefined)

    let dragging = false
    let lastX = 0
    let lastY = 0
    let pinchDistance = 0

    const currentLimits = (): OrbitLimits => {
      const o = orbitOptionsRef.current
      return {
        minDistance: o?.minDistance ?? DEFAULT_MIN_DISTANCE,
        maxDistance: o?.maxDistance ?? DEFAULT_MAX_DISTANCE,
        minPitch: o?.minPitch ?? DEFAULT_MIN_PITCH,
        maxPitch: o?.maxPitch ?? DEFAULT_MAX_PITCH,
      }
    }

    const rotate = (dx: number, dy: number) => {
      const rotateSpeed = orbitOptionsRef.current?.rotateSpeed ?? DEFAULT_ROTATE_SPEED
      orbitState.current = applyOrbitDelta(
        orbitState.current,
        { dYaw: -dx * rotateSpeed, dPitch: -dy * rotateSpeed, dZoom: 0 },
        currentLimits()
      )
    }
    const zoom = (dz: number) => {
      const zoomSpeed = orbitOptionsRef.current?.zoomSpeed ?? DEFAULT_ZOOM_SPEED
      orbitState.current = applyOrbitDelta(
        orbitState.current,
        { dYaw: 0, dPitch: 0, dZoom: dz * zoomSpeed },
        currentLimits()
      )
    }
    const touchDistance = (touches: TouchList) => {
      const a = touches[0]
      const b = touches[1]
      if (!a || !b) return 0
      return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (isBlocked()) return
      dragging = true
      lastX = event.clientX
      lastY = event.clientY
    }
    const handlePointerMove = (event: PointerEvent) => {
      if (!dragging) return
      if (isBlocked()) {
        dragging = false
        return
      }
      const dx = event.clientX - lastX
      const dy = event.clientY - lastY
      lastX = event.clientX
      lastY = event.clientY
      rotate(dx, dy)
    }
    const handlePointerUp = () => {
      dragging = false
    }
    const handleWheel = (event: WheelEvent) => {
      if (isBlocked()) return
      event.preventDefault()
      zoom(event.deltaY)
    }

    const handleTouchStart = (event: TouchEvent) => {
      if (isBlocked()) return
      if (event.touches.length === 1) {
        const touch = event.touches[0]
        if (!touch) return
        dragging = true
        lastX = touch.clientX
        lastY = touch.clientY
      } else if (event.touches.length === 2) {
        dragging = false
        pinchDistance = touchDistance(event.touches)
      }
    }
    const handleTouchMove = (event: TouchEvent) => {
      if (isBlocked()) return
      if (event.touches.length === 1 && dragging) {
        const touch = event.touches[0]
        if (!touch) return
        const dx = touch.clientX - lastX
        const dy = touch.clientY - lastY
        lastX = touch.clientX
        lastY = touch.clientY
        rotate(dx, dy)
      } else if (event.touches.length === 2) {
        const distance = touchDistance(event.touches)
        const delta = pinchDistance - distance
        pinchDistance = distance
        zoom(delta)
      }
    }
    const handleTouchEnd = () => {
      dragging = false
      pinchDistance = 0
    }

    const usePointer = orbit?.pointer !== false
    const useTouch = orbit?.touch !== false

    if (usePointer) {
      element.addEventListener('pointerdown', handlePointerDown)
      element.addEventListener('pointermove', handlePointerMove)
      element.addEventListener('pointerup', handlePointerUp)
      element.addEventListener('pointerleave', handlePointerUp)
      element.addEventListener('wheel', handleWheel, { passive: false })
    }
    if (useTouch) {
      element.addEventListener('touchstart', handleTouchStart, { passive: true })
      element.addEventListener('touchmove', handleTouchMove, { passive: true })
      element.addEventListener('touchend', handleTouchEnd)
      element.addEventListener('touchcancel', handleTouchEnd)
    }

    return () => {
      if (usePointer) {
        element.removeEventListener('pointerdown', handlePointerDown)
        element.removeEventListener('pointermove', handlePointerMove)
        element.removeEventListener('pointerup', handlePointerUp)
        element.removeEventListener('pointerleave', handlePointerUp)
        element.removeEventListener('wheel', handleWheel)
      }
      if (useTouch) {
        element.removeEventListener('touchstart', handleTouchStart)
        element.removeEventListener('touchmove', handleTouchMove)
        element.removeEventListener('touchend', handleTouchEnd)
        element.removeEventListener('touchcancel', handleTouchEnd)
      }
    }
  }, [gl, orbitEnabled, orbit?.pointer, orbit?.touch])

  useFrame(() => {
    const target = targetRef.current
    if (!target) return

    cameraTarget.current.set(target.position.x, target.position.y, target.position.z)
    const effectiveOffset = orbitEnabled ? orbitToOffset(orbitState.current) : offset
    desiredPosition.current.set(
      cameraTarget.current.x + effectiveOffset[0],
      cameraTarget.current.y + effectiveOffset[1],
      cameraTarget.current.z + effectiveOffset[2]
    )

    camera.position.lerp(desiredPosition.current, lerp)
    camera.lookAt(cameraTarget.current)
  })

  return null
}
