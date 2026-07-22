import type { ReactNode } from 'react'
import { useStore } from 'zustand'
import { Button } from './Button'
import { Modal } from './Modal'
import { Panel } from './Panel'
import type { AlertStateLike, ReadableStore } from '../engineTypes'

export interface AlertHostProps {
  /** Pass `useAlertStore` from @overworld-engine/notifications (or any store of the same shape). */
  store: ReadableStore<AlertStateLike>
  /** Render opaque payloads. @default String(message) */
  renderMessage?: (message: unknown) => ReactNode
}

/** Renders the current alert/confirm dialog from the notifications queue. */
export function AlertHost({ store, renderMessage }: AlertHostProps) {
  const current = useStore(store, (s) => s.current)
  if (!current) return null
  const render = renderMessage ?? ((m: unknown) => String(m))
  return (
    <Modal.Root open onDismiss={() => store.getState().resolveCurrent(false)}>
      <Modal.Content>
        <Panel title={current.title != null ? render(current.title) : undefined}>
          <p className="ow-alert-message">{render(current.message)}</p>
          <footer className="ow-alert-actions">
            {current.kind === 'confirm' && (
              <Button variant="ghost" onClick={() => store.getState().resolveCurrent(false)}>
                {current.cancelLabel ?? 'Cancel'}
              </Button>
            )}
            <Button onClick={() => store.getState().resolveCurrent(true)}>
              {current.confirmLabel ?? 'OK'}
            </Button>
          </footer>
        </Panel>
      </Modal.Content>
    </Modal.Root>
  )
}
