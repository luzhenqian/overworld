import { cloneElement, forwardRef, isValidElement, type HTMLAttributes, type ReactElement, type ReactNode, type Ref } from 'react'

export interface SlotProps extends HTMLAttributes<HTMLElement> {
  children?: ReactNode
}

type PropsWithRef = Record<string, unknown> & { ref?: Ref<unknown> }

export function mergeProps(
  slotProps: Record<string, unknown>,
  childProps: Record<string, unknown>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...slotProps, ...childProps }
  for (const key in slotProps) {
    const slotValue = slotProps[key]
    const childValue = childProps[key]
    const isHandler = /^on[A-Z]/.test(key)
    if (isHandler && typeof slotValue === 'function' && typeof childValue === 'function') {
      merged[key] = (...args: unknown[]) => {
        ;(slotValue as (...a: unknown[]) => void)(...args)
        ;(childValue as (...a: unknown[]) => void)(...args)
      }
    } else if (key === 'style' && slotValue && childValue) {
      merged[key] = { ...(slotValue as object), ...(childValue as object) }
    } else if (key === 'className' && slotValue) {
      merged[key] = childValue ? `${slotValue as string} ${childValue as string}` : slotValue
    }
  }
  return merged
}

export function mergeRefs<T>(...refs: Array<Ref<T> | undefined>): (value: T | null) => void {
  return (value) => {
    for (const ref of refs) {
      if (typeof ref === 'function') ref(value)
      else if (ref) (ref as { current: T | null }).current = value
    }
  }
}

/**
 * Merges its own props/ref onto its single child element instead of rendering
 * a DOM node of its own — used by `asChild`-capable components (Button,
 * IconButton, Modal.Close) so consumers can swap the rendered tag (e.g. an
 * anchor or router Link) while keeping the component's styling/behavior.
 */
export const Slot = forwardRef<HTMLElement, SlotProps>(function Slot({ children, ...slotProps }, forwardedRef) {
  if (!isValidElement(children)) {
    console.error('<Slot> expects exactly one valid React element child; rendering children as-is.')
    return <>{children ?? null}</>
  }
  const child = children as ReactElement<Record<string, unknown>> & PropsWithRef
  return cloneElement(child, {
    ...mergeProps(slotProps as Record<string, unknown>, child.props),
    ref: mergeRefs(forwardedRef, child.ref),
  })
})
