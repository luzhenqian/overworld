/**
 * Shared inline-style building blocks for the inspector overlays. Same
 * dark-panel idiom as `@overworld-engine/editor` / `@overworld-engine/minimap`
 * so the dev overlays read as one family. No external CSS — everything is
 * inline styles the game can override via the `style` prop.
 */
import type { CSSProperties } from 'react'

/** Corner the overlay is pinned to. */
export type InspectorPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'

/** Fixed-position offsets for each {@link InspectorPosition}. */
export function positionStyle(position: InspectorPosition): CSSProperties {
  switch (position) {
    case 'top-left':
      return { top: 16, left: 16 }
    case 'bottom-left':
      return { bottom: 16, left: 16 }
    case 'bottom-right':
      return { bottom: 16, right: 16 }
    case 'top-right':
    default:
      return { top: 16, right: 16 }
  }
}

export const panelStyle: CSSProperties = {
  position: 'fixed',
  width: 320,
  maxHeight: 'calc(100vh - 32px)',
  display: 'flex',
  flexDirection: 'column',
  boxSizing: 'border-box',
  padding: 10,
  background: 'rgba(15, 20, 30, 0.92)',
  color: '#e2e8f0',
  border: '1px solid rgba(148, 163, 184, 0.25)',
  borderRadius: 12,
  fontFamily: MONO,
  fontSize: 12,
  lineHeight: 1.5,
  zIndex: 10000,
}

export const headerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  marginBottom: 6,
}

export const titleStyle: CSSProperties = {
  fontWeight: 700,
  fontSize: 12,
  letterSpacing: 0.5,
  flex: 1,
}

export const sectionTitleStyle: CSSProperties = {
  margin: '8px 0 4px',
  fontSize: 10,
  letterSpacing: 1,
  textTransform: 'uppercase',
  color: '#94a3b8',
}

export const buttonStyle: CSSProperties = {
  padding: '3px 9px',
  background: 'rgba(51, 65, 85, 0.6)',
  color: '#e2e8f0',
  border: '1px solid rgba(148, 163, 184, 0.3)',
  borderRadius: 6,
  fontFamily: 'inherit',
  fontSize: 11,
  cursor: 'pointer',
}

export const activeButtonStyle: CSSProperties = {
  ...buttonStyle,
  background: '#0ea5e9',
  borderColor: '#38bdf8',
  color: '#0b1220',
}
