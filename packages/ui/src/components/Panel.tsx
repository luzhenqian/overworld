import type { HTMLAttributes, ReactNode } from 'react'

export interface PanelProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  title?: ReactNode
  /** Renders a close button in the title bar when provided. */
  onClose?: () => void
}

/** Themed surface: the base chrome for windows, dialogs and HUD cards. */
export function Panel({ title, onClose, children, className, ...rest }: PanelProps) {
  return (
    <section className={className ? `ow-panel ${className}` : 'ow-panel'} {...rest}>
      {(title != null || onClose) && (
        <header className="ow-panel-title">
          <span className="ow-panel-title-text">{title}</span>
          {onClose && (
            <button type="button" className="ow-panel-close" aria-label="Close" onClick={onClose}>
              ×
            </button>
          )}
        </header>
      )}
      <div className="ow-panel-body">{children}</div>
    </section>
  )
}
