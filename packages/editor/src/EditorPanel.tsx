/**
 * DOM half of the editor: a fixed dark side panel with mode switching, the
 * entity list, property editing and JSON import/export, plus a small
 * floating `<EditorToggle>` button. Rendered outside the three.js canvas as
 * a plain HTML overlay (same pattern as `@overworld/minimap`).
 *
 * Angles: the store keeps `rotationY` in **radians**; this panel displays
 * and edits **degrees** and converts on commit.
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from 'react'
import {
  useEditorStore,
  type EditorEntityKind,
  type EditorMode,
} from './editorStore'

/** Props for {@link EditorPanel}. */
export interface EditorPanelProps {
  /** Extra styles merged over the panel's fixed-position defaults. */
  style?: CSSProperties
  className?: string
}

/** Props for {@link EditorToggle}. */
export interface EditorToggleProps {
  /**
   * Optional `KeyboardEvent.key` that toggles the editor (e.g. `'F2'`,
   * `'e'`). Compared case-insensitively; ignored while typing in
   * inputs/textareas. Default: none.
   */
  hotkey?: string
  style?: CSSProperties
  className?: string
}

const KIND_LABELS: Record<EditorEntityKind, string> = {
  npc: 'NPC',
  building: '建筑',
  decoration: '装饰',
}

const MODE_LABELS: Record<EditorMode, string> = { select: '选择', place: '放置' }

const panelStyle: CSSProperties = {
  position: 'fixed',
  top: 16,
  right: 16,
  width: 280,
  maxHeight: 'calc(100vh - 32px)',
  overflowY: 'auto',
  padding: 12,
  boxSizing: 'border-box',
  background: 'rgba(15, 20, 30, 0.92)',
  color: '#e2e8f0',
  border: '1px solid rgba(148, 163, 184, 0.25)',
  borderRadius: 12,
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  fontSize: 12,
  lineHeight: 1.5,
  zIndex: 10000,
}

const sectionTitleStyle: CSSProperties = {
  margin: '10px 0 4px',
  fontSize: 11,
  letterSpacing: 1,
  textTransform: 'uppercase',
  color: '#94a3b8',
}

const buttonStyle: CSSProperties = {
  padding: '4px 10px',
  marginRight: 6,
  background: 'rgba(51, 65, 85, 0.6)',
  color: '#e2e8f0',
  border: '1px solid rgba(148, 163, 184, 0.3)',
  borderRadius: 6,
  fontFamily: 'inherit',
  fontSize: 12,
  cursor: 'pointer',
}

const activeButtonStyle: CSSProperties = {
  ...buttonStyle,
  background: '#0ea5e9',
  borderColor: '#38bdf8',
  color: '#0b1220',
}

const inputStyle: CSSProperties = {
  width: '100%',
  padding: '3px 6px',
  boxSizing: 'border-box',
  background: 'rgba(2, 6, 23, 0.6)',
  color: '#e2e8f0',
  border: '1px solid rgba(148, 163, 184, 0.3)',
  borderRadius: 4,
  fontFamily: 'inherit',
  fontSize: 12,
}

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  marginBottom: 4,
}

const rowLabelStyle: CSSProperties = { width: 72, flexShrink: 0, color: '#94a3b8' }

function formatNumber(value: number): string {
  return String(Math.round(value * 1000) / 1000)
}

function Btn(props: {
  active?: boolean
  onClick: () => void
  children: ReactNode
  danger?: boolean
}): ReactElement {
  const style = props.active ? activeButtonStyle : buttonStyle
  return (
    <button
      type="button"
      style={props.danger ? { ...style, background: '#7f1d1d', borderColor: '#ef4444' } : style}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  )
}

/**
 * Controlled number input that tolerates transient text ("-", "1.") while
 * typing and re-syncs from the store when the value changes externally
 * (e.g. dragging the entity in the 3D view).
 */
function NumberField(props: {
  label: string
  value: number
  onCommit: (value: number) => void
  step?: number
}): ReactElement {
  const [text, setText] = useState(() => formatNumber(props.value))
  const lastValue = useRef(props.value)

  useEffect(() => {
    if (props.value !== lastValue.current) {
      lastValue.current = props.value
      setText(formatNumber(props.value))
    }
  }, [props.value])

  return (
    <label style={rowStyle}>
      <span style={rowLabelStyle}>{props.label}</span>
      <input
        style={inputStyle}
        type="number"
        step={props.step ?? 0.5}
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          const parsed = Number(e.target.value)
          if (e.target.value !== '' && Number.isFinite(parsed)) {
            lastValue.current = parsed
            props.onCommit(parsed)
          }
        }}
      />
    </label>
  )
}

function TextField(props: {
  label: string
  value: string
  placeholder?: string
  onCommit: (value: string) => void
}): ReactElement {
  return (
    <label style={rowStyle}>
      <span style={rowLabelStyle}>{props.label}</span>
      <input
        style={inputStyle}
        type="text"
        value={props.value}
        placeholder={props.placeholder}
        onChange={(e) => props.onCommit(e.target.value)}
      />
    </label>
  )
}

/** Property editors for the currently selected entity. */
function SelectedEntityEditor(): ReactElement | null {
  const selectedId = useEditorStore((s) => s.selectedId)
  const entity = useEditorStore((s) =>
    s.selectedId === null ? undefined : s.entities.find((e) => e.id === s.selectedId)
  )
  const updateEntity = useEditorStore((s) => s.updateEntity)
  const removeEntity = useEditorStore((s) => s.removeEntity)

  if (!entity || selectedId === null) return null
  const id = entity.id

  const setPositionAxis = (axis: 0 | 1 | 2, value: number): void => {
    const position: [number, number, number] = [...entity.position]
    position[axis] = value
    updateEntity(id, { position })
  }

  return (
    <div key={id}>
      <div style={sectionTitleStyle}>
        属性 — {id} ({KIND_LABELS[entity.kind]})
      </div>
      <NumberField label="X" value={entity.position[0]} onCommit={(v) => setPositionAxis(0, v)} />
      <NumberField label="Y" value={entity.position[1]} onCommit={(v) => setPositionAxis(1, v)} />
      <NumberField label="Z" value={entity.position[2]} onCommit={(v) => setPositionAxis(2, v)} />
      <NumberField
        label="旋转 (°)"
        step={15}
        value={(entity.rotationY * 180) / Math.PI}
        onCommit={(deg) => updateEntity(id, { rotationY: (deg * Math.PI) / 180 })}
      />
      <NumberField
        label="缩放"
        step={0.1}
        value={entity.scale}
        onCommit={(v) => updateEntity(id, { scale: v })}
      />
      <TextField
        label="名称"
        value={entity.name ?? ''}
        placeholder="(未命名)"
        onCommit={(v) => updateEntity(id, { name: v === '' ? undefined : v })}
      />
      <TextField
        label="模型路径"
        value={entity.modelPath ?? ''}
        placeholder="/models/….glb"
        onCommit={(v) => updateEntity(id, { modelPath: v === '' ? undefined : v })}
      />
      <NumberField
        label="碰撞半径"
        step={0.5}
        value={entity.collisionRadius ?? 2}
        onCommit={(v) => updateEntity(id, { collisionRadius: v })}
      />
      <div style={{ marginTop: 6 }}>
        <Btn danger onClick={() => removeEntity(id)}>
          删除实体
        </Btn>
      </div>
    </div>
  )
}

/** Copy text to the clipboard, if available. Never throws. */
function copyToClipboard(text: string): void {
  if (typeof navigator !== 'undefined' && navigator.clipboard) {
    navigator.clipboard.writeText(text).catch(() => {
      /* clipboard unavailable (permissions, insecure context) — download still works */
    })
  }
}

/** Trigger a browser download of `text` as `filename`. No-op outside a DOM. */
function downloadJSON(text: string, filename: string): void {
  if (typeof document === 'undefined' || typeof URL === 'undefined' || !URL.createObjectURL) {
    return
  }
  const blob = new Blob([text], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

/**
 * The editor side panel (mount as a sibling of `<Canvas>`, not inside it).
 * Renders `null` while the editor is disabled. Includes: mode toggle,
 * placing-kind selector, entity list, selected-entity property editors and
 * JSON import/export. Errors are reported on an inline status line — never
 * via `window.alert`.
 */
export function EditorPanel({ style, className }: EditorPanelProps): ReactElement | null {
  const enabled = useEditorStore((s) => s.enabled)
  const mode = useEditorStore((s) => s.mode)
  const placingKind = useEditorStore((s) => s.placingKind)
  const entities = useEditorStore((s) => s.entities)
  const selectedId = useEditorStore((s) => s.selectedId)

  const [importText, setImportText] = useState('')
  const [status, setStatus] = useState<string | null>(null)

  const handleExport = useCallback(() => {
    const state = useEditorStore.getState()
    const json = JSON.stringify(state.exportScene(), null, 2)
    copyToClipboard(json)
    downloadJSON(json, 'overworld-scene.json')
    setStatus(`已导出 ${state.entities.length} 个实体(剪贴板 + 下载)`)
  }, [])

  const handleImport = useCallback(() => {
    try {
      const parsed: unknown = JSON.parse(importText)
      useEditorStore.getState().importScene(parsed)
      setStatus(`导入成功:${useEditorStore.getState().entities.length} 个实体`)
    } catch (error) {
      setStatus(`导入失败:${error instanceof Error ? error.message : String(error)}`)
    }
  }, [importText])

  if (!enabled) return null

  return (
    <div style={{ ...panelStyle, ...style }} className={className}>
      <div style={{ fontWeight: 700, fontSize: 13 }}>Overworld 场景编辑器</div>

      <div style={sectionTitleStyle}>模式</div>
      <div>
        {(Object.keys(MODE_LABELS) as EditorMode[]).map((m) => (
          <Btn key={m} active={mode === m} onClick={() => useEditorStore.getState().setMode(m)}>
            {MODE_LABELS[m]}
          </Btn>
        ))}
      </div>

      {mode === 'place' && (
        <>
          <div style={sectionTitleStyle}>放置类型</div>
          <div>
            {(Object.keys(KIND_LABELS) as EditorEntityKind[]).map((kind) => (
              <Btn
                key={kind}
                active={placingKind === kind}
                onClick={() => useEditorStore.getState().setPlacingKind(kind)}
              >
                {KIND_LABELS[kind]}
              </Btn>
            ))}
          </div>
        </>
      )}

      <div style={sectionTitleStyle}>实体 ({entities.length})</div>
      <div
        style={{
          maxHeight: 150,
          overflowY: 'auto',
          border: '1px solid rgba(148, 163, 184, 0.2)',
          borderRadius: 6,
        }}
      >
        {entities.length === 0 && (
          <div style={{ padding: 6, color: '#64748b' }}>(空 — 切到“放置”模式点击地面)</div>
        )}
        {entities.map((entity) => (
          <div
            key={entity.id}
            onClick={() => useEditorStore.getState().select(entity.id)}
            style={{
              padding: '3px 8px',
              cursor: 'pointer',
              display: 'flex',
              justifyContent: 'space-between',
              background: entity.id === selectedId ? 'rgba(14, 165, 233, 0.35)' : 'transparent',
            }}
          >
            <span>{entity.id}</span>
            <span style={{ color: '#94a3b8' }}>{KIND_LABELS[entity.kind]}</span>
          </div>
        ))}
      </div>

      <SelectedEntityEditor />

      <div style={sectionTitleStyle}>导出 / 导入</div>
      <div>
        <Btn onClick={handleExport}>导出 JSON</Btn>
        <Btn danger onClick={() => useEditorStore.getState().clear()}>
          清空场景
        </Btn>
      </div>
      <textarea
        style={{ ...inputStyle, height: 64, marginTop: 6, resize: 'vertical' }}
        placeholder="粘贴场景 JSON…"
        value={importText}
        onChange={(e) => setImportText(e.target.value)}
      />
      <div style={{ marginTop: 4 }}>
        <Btn onClick={handleImport}>导入 JSON</Btn>
      </div>
      {status !== null && (
        <div
          style={{
            marginTop: 6,
            color: status.startsWith('导入失败') ? '#f87171' : '#4ade80',
            wordBreak: 'break-all',
          }}
        >
          {status}
        </div>
      )}
    </div>
  )
}

const toggleStyle: CSSProperties = {
  position: 'fixed',
  bottom: 16,
  right: 16,
  padding: '6px 14px',
  background: 'rgba(15, 20, 30, 0.92)',
  color: '#e2e8f0',
  border: '1px solid rgba(148, 163, 184, 0.35)',
  borderRadius: 999,
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  fontSize: 12,
  cursor: 'pointer',
  zIndex: 10000,
}

/**
 * Floating button that flips `useEditorStore.enabled`. Always visible (it is
 * the way *into* the editor). Optionally binds a keyboard shortcut:
 *
 * ```tsx
 * <EditorToggle hotkey="F2" />
 * ```
 */
export function EditorToggle({ hotkey, style, className }: EditorToggleProps): ReactElement {
  const enabled = useEditorStore((s) => s.enabled)

  useEffect(() => {
    if (!hotkey || typeof window === 'undefined') return
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        return
      }
      if (event.key.toLowerCase() === hotkey.toLowerCase()) {
        const store = useEditorStore.getState()
        store.setEnabled(!store.enabled)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [hotkey])

  return (
    <button
      type="button"
      className={className}
      style={{
        ...toggleStyle,
        ...(enabled ? { borderColor: '#38bdf8', color: '#38bdf8' } : null),
        ...style,
      }}
      onClick={() => {
        const store = useEditorStore.getState()
        store.setEnabled(!store.enabled)
      }}
    >
      编辑器 {enabled ? 'ON' : 'OFF'}
    </button>
  )
}
