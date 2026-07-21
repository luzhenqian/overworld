import {
  setFocus,
  navigateByDirection,
  getCurrentFocusKey,
} from '@noriginmedia/norigin-spatial-navigation'

export interface SpatialFocusApi {
  /** Move focus to a specific focus key. */
  setFocus: typeof setFocus
  /** Move focus in a direction ('up' | 'down' | 'left' | 'right'). */
  navigate: typeof navigateByDirection
  /** The currently focused key. */
  currentFocusKey: () => string
}

const spatialFocusApi: SpatialFocusApi = {
  setFocus,
  navigate: navigateByDirection,
  currentFocusKey: getCurrentFocusKey,
}

/** Imperative spatial-focus controls (thin wrapper over norigin's module API). */
export function useSpatialFocus(): SpatialFocusApi {
  return spatialFocusApi
}
