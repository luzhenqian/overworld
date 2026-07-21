import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { positionTooltip } from '../tooltipPosition'

export interface TooltipProps {
  content: ReactNode
  children?: ReactNode
}

/** Anchored tooltip shown on hover/focus of the wrapped trigger. */
export function Tooltip({ content, children }: TooltipProps) {
  const triggerRef = useRef<HTMLSpanElement>(null)
  const tipRef = useRef<HTMLSpanElement>(null)
  const [visible, setVisible] = useState(false)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)

  useLayoutEffect(() => {
    if (!visible) {
      setPos(null)
      return
    }
    const trigger = triggerRef.current
    const tip = tipRef.current
    if (!trigger || !tip) return
    const a = trigger.getBoundingClientRect()
    const t = tip.getBoundingClientRect()
    const p = positionTooltip(
      { x: a.x, y: a.y, width: a.width, height: a.height },
      { width: t.width, height: t.height },
      { width: window.innerWidth, height: window.innerHeight },
    )
    setPos({ x: p.x, y: p.y })
  }, [visible])

  return (
    <span
      ref={triggerRef}
      className="ow-tooltip-trigger"
      onPointerEnter={() => setVisible(true)}
      onPointerLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      {children}
      {visible && (
        <span
          ref={tipRef}
          role="tooltip"
          className="ow-tooltip"
          data-ow-state={pos ? 'open' : 'measuring'}
          style={
            pos
              ? { position: 'fixed', left: pos.x, top: pos.y }
              : { position: 'fixed', left: 0, top: 0, visibility: 'hidden' }
          }
        >
          {content}
        </span>
      )}
    </span>
  )
}
