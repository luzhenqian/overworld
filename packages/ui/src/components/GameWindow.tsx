import type { ReactNode } from 'react'
import { Panel } from './Panel'
import { useUiStore } from '../uiStore'

export interface GameWindowProps {
  /** Window registry id (also used by `useUiStore` open/close/toggle). */
  id: string
  title?: ReactNode
  children?: ReactNode
}

/** A closable, focusable window managed by the `useUiStore` z-order registry. */
export function GameWindow({ id, title, children }: GameWindowProps) {
  const entry = useUiStore((s) => s.windows[id])
  const closeWindow = useUiStore((s) => s.closeWindow)
  const focusWindow = useUiStore((s) => s.focusWindow)
  if (!entry?.open) return null
  return (
    <div
      className="ow-window"
      data-ow-state="open"
      style={{ zIndex: entry.z }}
      onPointerDown={() => focusWindow(id)}
    >
      <Panel title={title} onClose={() => closeWindow(id)}>
        {children}
      </Panel>
    </div>
  )
}
