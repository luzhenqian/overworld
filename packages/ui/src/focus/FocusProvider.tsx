import { useState, type ReactNode } from 'react'
import { init, useFocusable, FocusContext } from '@noriginmedia/norigin-spatial-navigation'

let initialized = false
function ensureInit(): void {
  if (!initialized) {
    init({})
    initialized = true
  }
}

export interface FocusProviderProps {
  children?: ReactNode
  /** Focus key for the root region. @default 'OW_FOCUS_ROOT' */
  focusKey?: string
}

/**
 * Root of a spatial-navigation region: initializes norigin once (installs its
 * global key listeners) and provides the root `FocusContext`. Wrap the part of
 * the UI that should be keyboard/gamepad navigable.
 */
export function FocusProvider({ children, focusKey = 'OW_FOCUS_ROOT' }: FocusProviderProps) {
  // Run init() once, during the first render, before useFocusable registers.
  useState(() => {
    ensureInit()
    return null
  })
  const { ref, focusKey: rootKey } = useFocusable({
    focusKey,
    saveLastFocusedChild: true,
    trackChildren: true,
  })
  return (
    <FocusContext.Provider value={rootKey}>
      <div ref={ref} className="ow-focus-root">
        {children}
      </div>
    </FocusContext.Provider>
  )
}
