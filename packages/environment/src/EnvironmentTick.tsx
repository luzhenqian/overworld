import { useFrame } from '@react-three/fiber'
import type { Environment } from './createEnvironment'

/** Props for {@link EnvironmentTick}. */
export interface EnvironmentTickProps {
  /** Engine to drive. */
  engine: Environment
}

/**
 * Frame-loop driver: calls `engine.tick(deltaMs)` every rendered frame.
 * Mount once inside your `<Canvas>`. Renders nothing.
 *
 * Outside a canvas (menus, headless), drive the engine yourself with
 * `setInterval`/`requestAnimationFrame` instead.
 */
export function EnvironmentTick({ engine }: EnvironmentTickProps) {
  useFrame((_, delta) => {
    engine.tick(delta * 1000)
  })
  return null
}
