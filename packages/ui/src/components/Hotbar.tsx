import type { ReactNode } from 'react'

export interface HotbarProps {
  children?: ReactNode
}

/** Horizontal action bar; place `Slot`s (with `keybind`) inside. */
export function Hotbar({ children }: HotbarProps) {
  return (
    <div className="ow-hotbar" role="toolbar">
      {children}
    </div>
  )
}
