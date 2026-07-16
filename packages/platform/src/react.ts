/**
 * Optional React convenience — the rest of the package is framework-free.
 */
import { useMemo } from 'react'
import { getCapabilities, type PlatformCapabilities } from './capabilities'

/**
 * The current platform's capabilities, memoized for the component's
 * lifetime (platforms don't change mid-session):
 *
 * ```tsx
 * const { kind, hasTouch } = usePlatform()
 * ```
 */
export function usePlatform(): PlatformCapabilities {
  return useMemo(() => getCapabilities(), [])
}
