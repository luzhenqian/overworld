import { useEffect, useRef, type ReactNode } from 'react'
import { FOCUSABLE_SELECTOR, nextTrapIndex } from '../focusTrap'

export interface ModalProps {
  open: boolean
  /** Called on backdrop click or Escape. Omit to make the modal non-dismissable. */
  onDismiss?: () => void
  children?: ReactNode
}

/**
 * Centered modal layer with a keyboard focus trap: on open it focuses the first
 * focusable inside (or the dialog itself), cycles Tab/Shift+Tab within, calls
 * `onDismiss` on Escape, and restores focus on close. Renders nothing when closed.
 */
export function Modal({ open, onDismiss, children }: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const previouslyFocused = document.activeElement as HTMLElement | null
    const modal = modalRef.current
    const focusables = (): HTMLElement[] =>
      modal ? Array.from(modal.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)) : []
    ;(focusables()[0] ?? modal)?.focus()

    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        onDismiss?.()
        return
      }
      if (e.key !== 'Tab') return
      const els = focusables()
      e.preventDefault()
      if (els.length === 0) return
      const idx = els.indexOf(document.activeElement as HTMLElement)
      els[nextTrapIndex(els.length, idx, !e.shiftKey)]?.focus()
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      previouslyFocused?.focus?.()
    }
  }, [open, onDismiss])

  if (!open) return null
  return (
    <div
      className="ow-modal-backdrop"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onDismiss?.()
      }}
    >
      <div className="ow-modal" role="dialog" aria-modal="true" ref={modalRef} tabIndex={-1}>
        {children}
      </div>
    </div>
  )
}
