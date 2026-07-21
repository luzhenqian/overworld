import { forwardRef, type ButtonHTMLAttributes } from 'react'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost' | 'danger'
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', className, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      className={className ? `ow-button ${className}` : 'ow-button'}
      data-ow-variant={variant}
      {...rest}
    />
  )
})

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Accessible name — required because the content is icon-only. */
  label: string
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, className, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      className={className ? `ow-icon-button ${className}` : 'ow-icon-button'}
      aria-label={label}
      {...rest}
    />
  )
})
