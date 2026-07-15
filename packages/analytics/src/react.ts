import { useMemo } from 'react'
import { track, trackPage, type AnalyticsParams } from './analytics'

/** Stable tracking callbacks returned by {@link useAnalytics}. */
export interface UseAnalyticsResult {
  /** See {@link track}. */
  track: (name: string, params?: AnalyticsParams) => void
  /** See {@link trackPage}. */
  trackPage: (path: string) => void
}

/**
 * Thin React binding over the module-level tracking functions. The returned
 * object is referentially stable, so it is safe in dependency arrays.
 */
export function useAnalytics(): UseAnalyticsResult {
  return useMemo(() => ({ track, trackPage }), [])
}
