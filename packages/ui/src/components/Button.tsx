import type { ButtonHTMLAttributes } from 'react'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost' | 'danger'
}

export function Button({ variant = 'primary', className, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      className={className ? `ow-button ${className}` : 'ow-button'}
      data-ow-variant={variant}
      {...rest}
    />
  )
}

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Accessible name — required because the content is icon-only. */
  label: string
}

export function IconButton({ label, className, ...rest }: IconButtonProps) {
  return (
    <button
      type="button"
      className={className ? `ow-icon-button ${className}` : 'ow-icon-button'}
      aria-label={label}
      {...rest}
    />
  )
}
