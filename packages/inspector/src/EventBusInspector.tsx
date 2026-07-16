/**
 * DOM dev-overlay for the Overworld event bus. Renders outside the three.js
 * canvas (plain HTML overlay, same idiom as `@overworld-engine/editor` /
 * `@overworld-engine/minimap`): a live event stream, a per-event count table
 * and pause/clear controls.
 *
 * The data comes from {@link createEventStream} (a `bus.onAny` ring buffer)
 * and, when `profile` is on, `@overworld-engine/devtools`' `profileBus` for
 * per-event `totalMs`. The overlay only ever reads — it never emits — so it is
 * safe to leave mounted while playing.
 *
 * Dev-only: mount it behind a key toggle / `import.meta.env.DEV` guard; it is
 * not meant to ship in production builds.
 */
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
} from 'react'
import { gameEvents, type EventBus, type OverworldEventMap } from '@overworld-engine/core'
import { profileBus, type BusProfiler, type EventStats } from '@overworld-engine/devtools'
import { createEventStream, type EventEntry, type EventStream } from './eventStream'
import {
  activeButtonStyle,
  buttonStyle,
  headerStyle,
  panelStyle,
  positionStyle,
  sectionTitleStyle,
  titleStyle,
  type InspectorPosition,
} from './styles'

export type { InspectorPosition } from './styles'

/** Default `data-testid` for the {@link EventBusInspector} panel root. */
export const DEFAULT_INSPECTOR_TESTID = 'ow-inspector'

/** Props for {@link EventBusInspector}. */
export interface EventBusInspectorProps<M extends object = OverworldEventMap> {
  /** Bus to observe. Defaults to the global `gameEvents`. */
  bus?: EventBus<M>
  /** Ring-buffer capacity passed to {@link createEventStream}. @default 200 */
  max?: number
  /** Corner to pin the panel to. @default 'top-right' */
  position?: InspectorPosition
  /** Start paused (freeze the live view). @default false */
  paused?: boolean
  /**
   * Also attach `profileBus` to show per-event `totalMs` in the count table.
   * Monkey-patches `bus.emit` while mounted and restores it on unmount.
   * @default true
   */
  profile?: boolean
  /** View refresh interval in ms. @default 250 */
  refreshMs?: number
  /** Extra styles merged over the panel's fixed-position defaults. */
  style?: CSSProperties
  className?: string
  /** Stable `data-testid` on the panel root. @default 'ow-inspector' */
  testId?: string
}

const DEFAULT_MAX = 200
const DEFAULT_REFRESH_MS = 250
const PAYLOAD_MAX_CHARS = 80

/** One-line, length-capped payload preview. Never throws. */
function compactPayload(payload: unknown): string {
  if (payload === undefined) return ''
  let text: string
  try {
    text = JSON.stringify(payload)
  } catch {
    text = String(payload)
  }
  if (text === undefined) text = String(payload)
  return text.length > PAYLOAD_MAX_CHARS ? `${text.slice(0, PAYLOAD_MAX_CHARS - 1)}…` : text
}

interface Snapshot {
  entries: EventEntry[]
  counts: Record<string, number>
  stats: Record<string, EventStats>
}

const EMPTY_SNAPSHOT: Snapshot = { entries: [], counts: {}, stats: {} }

const streamListStyle: CSSProperties = {
  flex: 1,
  minHeight: 80,
  maxHeight: 220,
  overflowY: 'auto',
  border: '1px solid rgba(148, 163, 184, 0.2)',
  borderRadius: 6,
  padding: 4,
  background: 'rgba(2, 6, 23, 0.5)',
}

const rowStyle: CSSProperties = {
  display: 'flex',
  gap: 6,
  padding: '1px 2px',
  whiteSpace: 'nowrap',
}

const seqStyle: CSSProperties = { color: '#64748b', flexShrink: 0, width: 34, textAlign: 'right' }
const eventNameStyle: CSSProperties = { color: '#7dd3fc', flexShrink: 0 }
const payloadStyle: CSSProperties = {
  color: '#94a3b8',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}

const countsTableStyle: CSSProperties = {
  maxHeight: 140,
  overflowY: 'auto',
  border: '1px solid rgba(148, 163, 184, 0.2)',
  borderRadius: 6,
}

const countRowStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 8,
  padding: '1px 8px',
}

/**
 * Live event-bus overlay. Mount it as a sibling of `<Canvas>` (not inside it):
 *
 * ```tsx
 * {import.meta.env.DEV && showInspector && <EventBusInspector />}
 * ```
 */
export function EventBusInspector<M extends object = OverworldEventMap>(
  props: EventBusInspectorProps<M>
): ReactElement {
  const {
    bus = gameEvents as unknown as EventBus<M>,
    max = DEFAULT_MAX,
    position = 'top-right',
    paused: initialPaused = false,
    profile = true,
    refreshMs = DEFAULT_REFRESH_MS,
    style,
    className,
    testId = DEFAULT_INSPECTOR_TESTID,
  } = props

  const [paused, setPaused] = useState(initialPaused)
  const [snapshot, setSnapshot] = useState<Snapshot>(EMPTY_SNAPSHOT)
  const streamRef = useRef<EventStream | null>(null)
  const profilerRef = useRef<BusProfiler | null>(null)

  // Attach the headless stream (+ optional profiler) once per bus/max/profile.
  useEffect(() => {
    const stream = createEventStream(bus, { max })
    streamRef.current = stream
    const profiler = profile ? profileBus(bus) : null
    profilerRef.current = profiler
    return () => {
      stream.stop()
      profiler?.stop()
      streamRef.current = null
      profilerRef.current = null
    }
  }, [bus, max, profile])

  // Poll the stream into React state; frozen while paused.
  useEffect(() => {
    if (paused) return
    const pull = (): void => {
      const stream = streamRef.current
      if (!stream) return
      setSnapshot({
        entries: stream.entries(),
        counts: stream.counts(),
        stats: profilerRef.current ? profilerRef.current.stats() : {},
      })
    }
    pull()
    const id = setInterval(pull, refreshMs)
    return () => clearInterval(id)
  }, [paused, refreshMs])

  const clear = (): void => {
    streamRef.current?.clear()
    profilerRef.current?.reset()
    setSnapshot(EMPTY_SNAPSHOT)
  }

  // Newest first — latest event is always visible without scrolling.
  const rows = [...snapshot.entries].reverse()
  const countRows = Object.entries(snapshot.counts).sort((a, b) => b[1] - a[1])
  const totalEmissions = countRows.reduce((sum, [, count]) => sum + count, 0)

  return (
    <div
      style={{ ...panelStyle, ...positionStyle(position), ...style }}
      className={className}
      data-testid={testId}
    >
      <div style={headerStyle}>
        <span style={titleStyle}>事件总线 · Event Bus</span>
        <button
          type="button"
          style={paused ? activeButtonStyle : buttonStyle}
          data-testid={`${testId}-pause`}
          onClick={() => setPaused((p) => !p)}
        >
          {paused ? '▶ 继续' : '⏸ 暂停'}
        </button>
        <button
          type="button"
          style={buttonStyle}
          data-testid={`${testId}-clear`}
          onClick={clear}
        >
          清空
        </button>
      </div>

      <div style={sectionTitleStyle}>事件流 ({totalEmissions})</div>
      <div style={streamListStyle} data-testid={`${testId}-stream`}>
        {rows.length === 0 && (
          <div style={{ color: '#64748b', padding: 2 }}>暂无事件 —— 开始游戏以观察事件</div>
        )}
        {rows.map((entry) => (
          <div key={entry.seq} style={rowStyle} data-testid={`${testId}-event`}>
            <span style={seqStyle}>#{entry.seq}</span>
            <span style={eventNameStyle}>{entry.event}</span>
            <span style={payloadStyle}>{compactPayload(entry.payload)}</span>
          </div>
        ))}
      </div>

      <div style={sectionTitleStyle}>计数 ({countRows.length})</div>
      <div style={countsTableStyle} data-testid={`${testId}-counts`}>
        {countRows.length === 0 && <div style={{ color: '#64748b', padding: '1px 8px' }}>—</div>}
        {countRows.map(([event, count]) => {
          const stat = snapshot.stats[event]
          return (
            <div key={event} style={countRowStyle}>
              <span style={{ color: '#7dd3fc', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {event}
              </span>
              <span style={{ flexShrink: 0, color: '#94a3b8' }}>
                ×{count}
                {stat ? ` · ${stat.totalMs.toFixed(2)}ms` : ''}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
