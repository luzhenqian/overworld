import type { ReactNode } from 'react'
import { useStore } from 'zustand'
import type { ReadableStore, ToastStateLike } from '../engineTypes'

export interface ToastViewportProps {
  /** Pass `useToastStore` from @overworld-engine/notifications (or any store of the same shape). */
  store: ReadableStore<ToastStateLike>
  /** Screen corner for the stack. @default 'top-right' */
  anchor?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
  /** Render opaque toast payloads. @default String(message) */
  renderMessage?: (message: unknown) => ReactNode
}

/** Renders the toast queue as a stacked corner viewport. */
export function ToastViewport({ store, anchor = 'top-right', renderMessage }: ToastViewportProps) {
  const toasts = useStore(store, (s) => s.toasts)
  if (toasts.length === 0) return null
  return (
    <ol className="ow-toasts" data-ow-anchor={anchor}>
      {toasts.map((t) => (
        <li key={t.id} className="ow-toast" data-ow-variant={t.variant}>
          {t.icon && (
            <span className="ow-toast-icon" aria-hidden="true">
              {t.icon}
            </span>
          )}
          <span className="ow-toast-message">
            {renderMessage ? renderMessage(t.message) : String(t.message)}
          </span>
          <button
            type="button"
            className="ow-toast-dismiss"
            aria-label="Dismiss"
            onClick={() => store.getState().dismiss(t.id)}
          >
            ×
          </button>
        </li>
      ))}
    </ol>
  )
}
