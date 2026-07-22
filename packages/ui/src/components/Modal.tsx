import {
  createContext,
  forwardRef,
  useContext,
  useEffect,
  useRef,
  type ButtonHTMLAttributes,
  type ElementType,
  type HTMLAttributes,
  type MouseEvent,
  type ReactNode,
  type RefObject,
} from 'react'
import { FOCUSABLE_SELECTOR, nextTrapIndex } from '../focusTrap'
import { Slot } from '../primitives/Slot'

interface ModalContextValue {
  onDismiss?: () => void
  contentRef: RefObject<HTMLDivElement>
}

const ModalContext = createContext<ModalContextValue | null>(null)

function useModalContext(component: string): ModalContextValue {
  const ctx = useContext(ModalContext)
  if (!ctx) throw new Error(`Modal.${component} must be used within Modal.Root`)
  return ctx
}

export interface ModalRootProps {
  open: boolean
  /** Called on backdrop click or Escape. Omit to make the modal non-dismissable. */
  onDismiss?: () => void
  children?: ReactNode
}

/**
 * Centered modal layer with a keyboard focus trap: on open it focuses the first
 * focusable inside `Modal.Content` (or Content itself), cycles Tab/Shift+Tab
 * within, calls `onDismiss` on Escape, and restores focus on close. Renders
 * nothing when closed.
 */
function ModalRoot({ open, onDismiss, children }: ModalRootProps) {
  const contentRef = useRef<HTMLDivElement>(null)
  const onDismissRef = useRef(onDismiss)
  onDismissRef.current = onDismiss

  useEffect(() => {
    if (!open) return
    const previouslyFocused = document.activeElement as HTMLElement | null
    const content = contentRef.current
    const focusables = (): HTMLElement[] =>
      content ? Array.from(content.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)) : []
    ;(focusables()[0] ?? content)?.focus()

    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        onDismissRef.current?.()
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
  }, [open])

  if (!open) return null
  return (
    <div
      className="ow-modal-backdrop"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onDismiss?.()
      }}
    >
      <ModalContext.Provider value={{ onDismiss, contentRef }}>{children}</ModalContext.Provider>
    </div>
  )
}

export interface ModalContentProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode
}

function ModalContent({ children, ...rest }: ModalContentProps) {
  const { contentRef } = useModalContext('Content')
  return (
    <div className="ow-modal" role="dialog" aria-modal="true" tabIndex={-1} ref={contentRef} {...rest}>
      {children}
    </div>
  )
}

export interface ModalCloseProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Render props/ref onto the single child element instead of a `<button>`. */
  asChild?: boolean
}

const ModalClose = forwardRef<HTMLButtonElement, ModalCloseProps>(function ModalClose(
  { asChild, onClick, ...rest },
  ref,
) {
  const { onDismiss } = useModalContext('Close')
  const Comp: ElementType = asChild ? Slot : 'button'
  return (
    <Comp
      ref={ref}
      {...(asChild ? {} : { type: 'button' })}
      onClick={(e: MouseEvent<HTMLButtonElement>) => {
        onClick?.(e)
        onDismiss?.()
      }}
      {...rest}
    />
  )
})

export const Modal = { Root: ModalRoot, Content: ModalContent, Close: ModalClose }
