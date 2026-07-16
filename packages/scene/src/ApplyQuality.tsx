/**
 * Applies the GL-facing parts of the active {@link QualitySettings} to the
 * running Canvas. Mount it once anywhere inside `<Canvas>`.
 */
import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import { useQualityStore } from './quality'

/**
 * Bridge between {@link useQualityStore} and the R3F Canvas:
 *
 * - `settings.dpr` is forwarded to R3F's `setDpr` as a `[min, max]` range —
 *   R3F clamps the real `window.devicePixelRatio` into it, so a Retina
 *   display renders at most `max`, a 1x display at least `min`.
 * - `settings.shadows` toggles `gl.shadowMap.enabled` and flags
 *   `gl.shadowMap.needsUpdate` so the shadow map is re-rendered on the next
 *   frame. Note: materials created while shadows were off may need a
 *   `material.needsUpdate = true` (or a remount) to pick shadows back up —
 *   prefer choosing the preset before the scene mounts when possible.
 *
 * `settings.shadowMapSize` is deliberately NOT applied here: shadow-casting
 * lights belong to the game, so read the value from the store where you
 * create them (`shadow-mapSize={[size, size]}`). Renders nothing.
 */
export function ApplyQuality() {
  const gl = useThree((state) => state.gl)
  const setDpr = useThree((state) => state.setDpr)
  const dpr = useQualityStore((state) => state.settings.dpr)
  const shadows = useQualityStore((state) => state.settings.shadows)

  useEffect(() => {
    setDpr([dpr[0], dpr[1]])
  }, [setDpr, dpr])

  useEffect(() => {
    if (gl.shadowMap.enabled === shadows) return
    gl.shadowMap.enabled = shadows
    gl.shadowMap.needsUpdate = true
  }, [gl, shadows])

  return null
}
