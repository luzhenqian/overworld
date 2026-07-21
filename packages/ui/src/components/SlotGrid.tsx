import { forwardRef, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from 'react'

export interface SlotGridProps {
  /** Grid column count. @default 5 */
  columns?: number
  children?: ReactNode
}

export function SlotGrid({ columns = 5, children }: SlotGridProps) {
  return (
    <div className="ow-slot-grid" role="grid" style={{ '--ow-columns': columns } as CSSProperties}>
      {children}
    </div>
  )
}

export interface SlotProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: ReactNode
  /** Stack count badge; hidden when omitted or <= 1. */
  quantity?: number
  /** Rarity key exposed as `data-ow-rarity` for theme styling. */
  rarity?: string
  /** Keybinding label badge (hotbar use). */
  keybind?: string
  selected?: boolean
}

export const Slot = forwardRef<HTMLButtonElement, SlotProps>(function Slot(
  { icon, quantity, rarity, keybind, selected, className, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      className={className ? `ow-slot ${className}` : 'ow-slot'}
      data-ow-rarity={rarity}
      data-ow-state={selected ? 'selected' : undefined}
      {...rest}
    >
      <span className="ow-slot-icon" aria-hidden="true">
        {icon}
      </span>
      {quantity != null && quantity > 1 && <span className="ow-slot-qty">{quantity}</span>}
      {keybind && <span className="ow-slot-key">{keybind}</span>}
    </button>
  )
})
