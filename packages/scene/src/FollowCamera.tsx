/**
 * Smooth third-person follow camera. Extracted from the source game's player
 * controller so it can be used standalone (cutscenes, spectator targets, ...).
 */
import { useRef } from 'react'
import { Vector3 } from 'three'
import type * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import type { Vec3 } from '@overworld/core'

export interface FollowCameraProps {
  /** Object the camera follows (e.g. the player group). */
  targetRef: React.RefObject<THREE.Object3D | null>
  /** Camera offset from the target. Default: [0, 10, 30]. */
  offset?: Vec3
  /** Lerp factor per frame (0-1). Default: 0.05. */
  lerp?: number
}

/**
 * Lerp the default camera toward `target + offset` every frame and look at
 * the target. Renders nothing.
 */
export function FollowCamera({ targetRef, offset = [0, 10, 30], lerp = 0.05 }: FollowCameraProps) {
  const { camera } = useThree()
  const cameraTarget = useRef(new Vector3())
  const desiredPosition = useRef(new Vector3())

  useFrame(() => {
    const target = targetRef.current
    if (!target) return

    cameraTarget.current.set(target.position.x, target.position.y, target.position.z)
    desiredPosition.current.set(
      cameraTarget.current.x + offset[0],
      cameraTarget.current.y + offset[1],
      cameraTarget.current.z + offset[2]
    )

    camera.position.lerp(desiredPosition.current, lerp)
    camera.lookAt(cameraTarget.current)
  })

  return null
}
