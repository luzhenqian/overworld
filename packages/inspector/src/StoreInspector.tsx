/**
 * DOM dev-overlay for a zustand store: a collapsible, live JSON snapshot of
 * the store's state. Accepts either a bare `StoreApi` or a bound hook
 * (`create(...)` result) — both expose `getState` / `subscribe`, which is all
 * this needs, so there is no React-render subscription and no `zustand`
 * runtime import (types only; `zustand` is a peer dependency).
 *
 * Dev-only, like {@link EventBusInspector}.
 */
import { useEffect, useState, type CSSProperties, type ReactElement } from 'react'
import type { StoreApi } from 'zustand'
import { panelStyle, titleStyle } from './styles'

/** Default `data-testid` for the {@link StoreInspector} panel root. */
export const DEFAULT_STORE_INSPECTOR_TESTID = 'ow-store-inspector'

/**
 * The read surface {@link StoreInspector} needs. A zustand `StoreApi` and a
 * bound hook (which carries the store API on itself) both satisfy this.
 */
export type InspectableStore<T> = Pick<StoreApi<T>, 'getState' | 'subscribe'>

/** Props for {@link StoreInspector}. */
export interface StoreInspectorProps<T> {
  /** The zustand store to inspect — a `StoreApi` or a bound `create(...)` hook. */
  store: InspectableStore<T>
  /** Heading shown above the snapshot. @default 'store' */
  label?: string
  /** Start collapsed (heading only). @default false */
  collapsed?: boolean
  /** Extra styles merged over the panel's fixed-position defaults. */
  style?: CSSProperties
  className?: string
  /** Stable `data-testid` on the panel root. @default 'ow-store-inspector' */
  testId?: string
}

/**
 * `JSON.stringify` that tolerates the things game stores hold: functions
 * become `'[fn]'`, circular refs become `'[circular]'`, `undefined`/symbols
 * are dropped as usual, and any thrown replacer error degrades gracefully.
 */
function safeStringify(value: unknown): string {
  const seen = new WeakSet<object>()
  try {
    return JSON.stringify(
      value,
      (_key, val) => {
        if (typeof val === 'function') return '[fn]'
        if (typeof val === 'bigint') return `${val}n`
        if (typeof val === 'object' && val !== null) {
          if (seen.has(val)) return '[circular]'
          seen.add(val)
        }
        return val
      },
      2
    )
  } catch (error) {
    return `[unserializable: ${error instanceof Error ? error.message : String(error)}]`
  }
}

const preStyle: CSSProperties = {
  margin: 0,
  padding: 8,
  maxHeight: 320,
  overflow: 'auto',
  background: 'rgba(2, 6, 23, 0.5)',
  border: '1px solid rgba(148, 163, 184, 0.2)',
  borderRadius: 6,
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  fontSize: 11,
  lineHeight: 1.45,
  whiteSpace: 'pre',
  color: '#cbd5e1',
}

const toggleStyle: CSSProperties = {
  background: 'transparent',
  color: '#e2e8f0',
  border: 'none',
  padding: 0,
  marginRight: 6,
  fontFamily: 'inherit',
  fontSize: 12,
  cursor: 'pointer',
}

/**
 * Collapsible live JSON view of a zustand store:
 *
 * ```tsx
 * import { useGameStore } from './game/state'
 * <StoreInspector store={useGameStore} label="game" />
 * ```
 */
export function StoreInspector<T>({
  store,
  label = 'store',
  collapsed = false,
  style,
  className,
  testId = DEFAULT_STORE_INSPECTOR_TESTID,
}: StoreInspectorProps<T>): ReactElement {
  const [open, setOpen] = useState(!collapsed)
  const [state, setState] = useState<T>(() => store.getState())

  useEffect(() => {
    // Re-sync immediately (the store may have moved between render and effect).
    setState(store.getState())
    const unsubscribe = store.subscribe((next) => setState(next))
    return () => unsubscribe()
  }, [store])

  return (
    <div
      style={{ ...panelStyle, top: 16, left: 16, width: 300, ...style }}
      className={className}
      data-testid={testId}
    >
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <button
          type="button"
          style={toggleStyle}
          data-testid={`${testId}-toggle`}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? '▾' : '▸'}
        </button>
        <span style={titleStyle}>{label}</span>
      </div>
      {open && (
        <pre style={preStyle} data-testid={`${testId}-json`}>
          {safeStringify(state)}
        </pre>
      )}
    </div>
  )
}
