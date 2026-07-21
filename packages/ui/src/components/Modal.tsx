import type { ReactNode } from 'react'

export interface ModalProps {
  open: boolean
  /** Called on backdrop click. Omit to make the modal non-dismissable. */
  onDismiss?: () => void
  children?: ReactNode
}

/** Centered modal layer. Renders nothing when closed. */
export function Modal({ open, onDismiss, children }: ModalProps) {
  if (!open) return null
  return (
    <div
      className="ow-modal-backdrop"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onDismiss?.()
      }}
    >
      <div className="ow-modal" role="dialog" aria-modal="true">
        {children}
      </div>
    </div>
  )
}
