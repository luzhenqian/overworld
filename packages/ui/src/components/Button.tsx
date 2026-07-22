import { forwardRef, type ButtonHTMLAttributes, type ElementType } from 'react'
import { Slot } from '../primitives/Slot'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost' | 'danger'
  /** Render props/ref onto the single child element instead of a `<button>`. */
  asChild?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', className, asChild, ...rest },
  ref,
) {
  const Comp: ElementType = asChild ? Slot : 'button'
  return (
    <Comp
      ref={ref}
      {...(asChild ? {} : { type: 'button' })}
      className={className ? `ow-button ${className}` : 'ow-button'}
      data-ow-variant={variant}
      {...rest}
    />
  )
})

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Accessible name — required because the content is icon-only. */
  label: string
  /** Render props/ref onto the single child element instead of a `<button>`. */
  asChild?: boolean
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, className, asChild, ...rest },
  ref,
) {
  const Comp: ElementType = asChild ? Slot : 'button'
  return (
    <Comp
      ref={ref}
      {...(asChild ? {} : { type: 'button' })}
      className={className ? `ow-icon-button ${className}` : 'ow-icon-button'}
      aria-label={label}
      {...rest}
    />
  )
})
