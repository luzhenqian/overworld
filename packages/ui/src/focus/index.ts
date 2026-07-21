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
