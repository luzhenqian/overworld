import type { ReactNode, RefObject } from 'react'
import { useFocusable } from '@noriginmedia/norigin-spatial-navigation'

export interface FocusableProps<E extends HTMLElement = HTMLElement> {
  focusKey?: string
  onEnterPress?: () => void
  onFocus?: () => void
  /**
   * Render-prop child. Attach `ref` to a DOM element (e.g. a forwardRef
   * `Slot`/`Button`) and use `focused` to style the focused state.
   */
  children: (state: { ref: RefObject<E>; focused: boolean; focusSelf: () => void }) => ReactNode
}

/** Makes its render-prop child spatially focusable via norigin. */
export function Focusable<E extends HTMLElement = HTMLElement>({
  focusKey,
  onEnterPress,
  onFocus,
  children,
}: FocusableProps<E>) {
  const { ref, focused, focusSelf } = useFocusable<object, E>({
    focusKey,
    onEnterPress: onEnterPress ? () => onEnterPress() : undefined,
    onFocus: onFocus ? () => onFocus() : undefined,
  })
  return <>{children({ ref, focused, focusSelf })}</>
}
