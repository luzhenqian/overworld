export { FocusProvider } from './FocusProvider'
export type { FocusProviderProps } from './FocusProvider'

// Re-export norigin's primitives so consumers use them through this subpath.
export {
  useFocusable,
  FocusContext,
  setFocus,
  navigateByDirection,
} from '@noriginmedia/norigin-spatial-navigation'
export type { Direction } from '@noriginmedia/norigin-spatial-navigation'

export { Focusable } from './Focusable'
export type { FocusableProps } from './Focusable'
export { useSpatialFocus } from './useSpatialFocus'
export type { SpatialFocusApi } from './useSpatialFocus'
