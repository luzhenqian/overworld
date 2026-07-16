/**
 * R3F pointer / raycast bridge for WeChat mini-games.
 *
 * Lifts the v1.1 "pointer events not wired" limitation: `onClick`,
 * `onPointerDown/Move/Up`, `onPointerOver/Out` etc. on meshes now fire and
 * raycast picking works — driven **exclusively** by `wx.onTouchStart/Move/End`
 * (never by real DOM). Feeding fiber's own pointer pipeline from `wx` touches
 * means the bridge behaves identically inside the wx-shim harness (a real
 * browser) and on a real WeChat device: there is a single code path, so what
 * the harness validates is what ships.
 *
 * How it works: {@link createWeappPointerBridge} installs an
 * {@link https://docs.pmnd.rs/react-three-fiber | EventManager} into the R3F
 * root store (reusing fiber's internal `createEvents` pointer pipeline with a
 * custom, wx-aware `compute`), then on each `wx` touch synthesizes a
 * pointer-event-like object and dispatches it straight to the manager's
 * handlers — `onPointerDown` on touch-start, `onPointerMove` on touch-move,
 * `onPointerUp` on touch-end, plus an `onClick` when the touch was a tap
 * (short, no drag). No DOM listeners are ever attached (the manager's
 * `connect`/`disconnect` are no-ops), so on the web the wx-shim's synthetic
 * `wx` touches are the *only* source of pointer events — exactly as on device.
 *
 * Coexists with {@link createWeappTouchJoystick}: the joystick claims its own
 * region (default the left half) and consumes touches for movement; the
 * pointer bridge additionally sees those same touches, but only fires a pick
 * (`onClick`) on a **tap**, never on a **drag**, so a joystick drag never
 * doubles as a scene click. Games that want to hard-partition the screen can
 * pass `region: 'right-half'` to confine picking to the non-joystick side.
 */
import { createEvents } from '@react-three/fiber'
import type { ComputeFunction, EventManager, RootState } from '@react-three/fiber'
import type { R3FStore } from './canvasRoot'
import { getWx, type WxCanvas, type WxTouch, type WxTouchEvent } from './wxTypes'

export type { R3FStore }

/** CSS-pixel size the NDC math needs (a subset of R3F's `state.size`). */
export interface PointerSize {
  width: number
  height: number
}

/** Canvas top-left in CSS px. Fullscreen wx canvas → `{ left: 0, top: 0 }`. */
export interface CanvasOrigin {
  left: number
  top: number
}

/**
 * Map a `wx` touch (CSS-px `clientX/clientY`) to canvas-relative offset px.
 * For a fullscreen wx canvas the origin is `{ 0, 0 }`, so offset === client.
 */
export function touchToOffset(
  touch: { clientX: number; clientY: number },
  origin: CanvasOrigin = { left: 0, top: 0 }
): { offsetX: number; offsetY: number } {
  return { offsetX: touch.clientX - origin.left, offsetY: touch.clientY - origin.top }
}

/**
 * Convert a canvas-relative offset (px, top-left origin) to normalized device
 * coordinates in `[-1, 1]` (x right, y up) — the exact mapping fiber's default
 * `compute` uses: `x = offsetX / width * 2 - 1`, `y = -(offsetY / height) * 2 + 1`.
 */
export function offsetToNdc(
  offsetX: number,
  offsetY: number,
  size: PointerSize
): { x: number; y: number } {
  return {
    x: (offsetX / size.width) * 2 - 1,
    y: -(offsetY / size.height) * 2 + 1,
  }
}

/** Convenience: `wx` touch → NDC in one step (fullscreen origin by default). */
export function touchToNdc(
  touch: { clientX: number; clientY: number },
  size: PointerSize,
  origin: CanvasOrigin = { left: 0, top: 0 }
): { x: number; y: number } {
  const { offsetX, offsetY } = touchToOffset(touch, origin)
  return offsetToNdc(offsetX, offsetY, size)
}

/** Options for {@link createWeappPointerBridge}. */
export interface WeappPointerBridgeOptions {
  /**
   * Which taps drive picking: `'full'` (default) picks anywhere, `'left-half'`
   * / `'right-half'` confine picking to one half of the screen so it can
   * hard-partition against a joystick that owns the other half. (By default no
   * partition is needed — the tap-vs-drag rule already keeps a joystick drag
   * from registering as a click.)
   */
  region?: 'full' | 'left-half' | 'right-half'
  /** Max ms between touch-start and touch-end to count as a tap → `onClick`. Default 400. */
  tapMaxDurationMs?: number
  /** Max CSS-px travel between touch-start and touch-end to count as a tap. Default 12. */
  tapMaxDistance?: number
  /** Canvas top-left in CSS px (offset math). Default `{ left: 0, top: 0 }` (fullscreen). */
  canvasOrigin?: CanvasOrigin
}

/** Handle returned by {@link createWeappPointerBridge}. */
export interface WeappPointerBridge {
  /**
   * Unbind all `wx` touch listeners and disable the event layer (raycasting
   * stops, mesh handlers no longer fire). Idempotent.
   */
  dispose(): void
}

/** The pointer-event-like object we feed fiber's handlers. */
interface SyntheticPointerEvent {
  offsetX: number
  offsetY: number
  clientX: number
  clientY: number
  pageX: number
  pageY: number
  pointerId: number
  button: number
  buttons: number
  pointerType: 'touch'
  target: WxCanvas
  preventDefault(): void
  stopPropagation(): void
  nativeEvent: WxTouch
}

const DEFAULT_TAP_MS = 400
const DEFAULT_TAP_DIST = 12

/**
 * Wire R3F pointer events on a WeChat mini-game canvas, fed entirely by `wx`
 * touch events. Call it **after** the first `render()` (the R3F store must
 * exist):
 *
 * ```ts
 * const canvasRoot = createWeappCanvasRoot({ renderProps: { camera } })
 * canvasRoot.render(<World />)
 * const bridge = createWeappPointerBridge(canvasRoot)   // onClick etc. now fire
 * // ...later: bridge.dispose()
 * ```
 *
 * The `<mesh onClick>` / `<group onClick>` you author in the scene now receive
 * real raycast hits from taps. Movement stays with
 * {@link createWeappTouchJoystick}; see the module docs for how the two share
 * touches.
 *
 * @throws when `root.store` is null (call `render()` first) or when the `wx`
 * global touch APIs are missing (WeChat *mini-game* only).
 */
export function createWeappPointerBridge(
  root: { store: R3FStore | null; canvas: WxCanvas },
  options: WeappPointerBridgeOptions = {}
): WeappPointerBridge {
  const store = root.store
  if (!store) {
    throw new Error(
      '[overworld/adapters-weapp] createWeappPointerBridge needs a rendered root — ' +
        'call canvasRoot.render(<Scene/>) before attaching the pointer bridge.'
    )
  }

  const wx = getWx()
  if (
    typeof wx.onTouchStart !== 'function' ||
    typeof wx.onTouchMove !== 'function' ||
    typeof wx.onTouchEnd !== 'function'
  ) {
    throw new Error(
      '[overworld/adapters-weapp] wx.onTouchStart/Move/End are not available — ' +
        'createWeappPointerBridge needs a WeChat *mini-game* environment ' +
        '(mini-programs deliver touches through WXML bindings instead).'
    )
  }

  const canvas = root.canvas
  const origin = options.canvasOrigin ?? { left: 0, top: 0 }
  const tapMs = options.tapMaxDurationMs ?? DEFAULT_TAP_MS
  const tapDist = options.tapMaxDistance ?? DEFAULT_TAP_DIST
  const region = options.region ?? 'full'
  const halfWidth = wx.getSystemInfoSync().windowWidth / 2
  const inRegion = (touch: WxTouch): boolean => {
    if (region === 'left-half') return touch.clientX < halfWidth
    if (region === 'right-half') return touch.clientX >= halfWidth
    return true
  }

  // Build fiber's pointer pipeline over this root's store, with a wx-aware
  // `compute` (the default reads offsetX/offsetY too, but doing the NDC math
  // through the pure, unit-tested helper documents the mapping and guards
  // against a canvas whose top-left is not the viewport origin).
  const { handlePointer } = createEvents(store)
  const compute: ComputeFunction = (event, state) => {
    // `event.offsetX/offsetY` are present on every DomEvent (MouseEvent and its
    // subtypes) and, for our synthetic events, hold canvas-relative CSS px.
    const { x, y } = offsetToNdc(event.offsetX, event.offsetY, state.size)
    state.pointer.set(x, y)
    state.raycaster.setFromCamera(state.pointer, state.camera)
  }
  const handler = (name: string): ((event: SyntheticPointerEvent) => void) =>
    handlePointer(name) as unknown as (event: SyntheticPointerEvent) => void

  const onPointerDown = handler('onPointerDown')
  const onPointerMove = handler('onPointerMove')
  const onPointerUp = handler('onPointerUp')
  const onPointerCancel = handler('onPointerCancel')
  const onClick = handler('onClick')

  const manager: EventManager<WxCanvas> = {
    enabled: true,
    priority: 1,
    compute,
    connected: canvas,
    // No DOM listeners — every event enters through the wx touch handlers
    // below, so connect/disconnect are intentionally inert.
    connect: () => {},
    disconnect: () => {},
    update: () => {
      const { internal, events } = store.getState()
      const last = internal.lastEvent.current
      if (last && events.handlers) events.handlers.onPointerMove(last)
    },
  }
  // Install into the store. setEvents merges over the default event layer, so
  // our compute/connect/disconnect/update take effect and `intersect` reads a
  // fully-formed manager (enabled/priority/compute). Handlers are dispatched
  // directly from the wx touch callbacks below, not off the manager.
  store.getState().setEvents(manager as unknown as Parameters<RootState['setEvents']>[0])

  const makeEvent = (touch: WxTouch, phase: 'down' | 'move' | 'up'): SyntheticPointerEvent => {
    const { offsetX, offsetY } = touchToOffset(touch, origin)
    return {
      offsetX,
      offsetY,
      clientX: touch.clientX,
      clientY: touch.clientY,
      pageX: touch.clientX,
      pageY: touch.clientY,
      pointerId: touch.identifier,
      button: 0,
      buttons: phase === 'up' ? 0 : 1,
      pointerType: 'touch',
      target: canvas,
      preventDefault: () => {},
      stopPropagation: () => {},
      nativeEvent: touch,
    }
  }

  /** Touches this bridge is tracking (for tap detection), keyed by identifier. */
  const tracked = new Map<number, { x: number; y: number; t: number }>()

  const handleStart = (event: WxTouchEvent): void => {
    for (const touch of event.changedTouches) {
      if (!inRegion(touch)) continue
      tracked.set(touch.identifier, { x: touch.clientX, y: touch.clientY, t: Date.now() })
      onPointerDown(makeEvent(touch, 'down'))
    }
  }

  const handleMove = (event: WxTouchEvent): void => {
    for (const touch of event.changedTouches) {
      if (!tracked.has(touch.identifier)) continue
      onPointerMove(makeEvent(touch, 'move'))
    }
  }

  const handleEnd = (event: WxTouchEvent): void => {
    for (const touch of event.changedTouches) {
      const start = tracked.get(touch.identifier)
      if (!start) continue
      tracked.delete(touch.identifier)
      const up = makeEvent(touch, 'up')
      onPointerUp(up)
      const moved = Math.hypot(touch.clientX - start.x, touch.clientY - start.y)
      if (moved <= tapDist && Date.now() - start.t <= tapMs) onClick(up)
    }
  }

  const handleCancel = (event: WxTouchEvent): void => {
    for (const touch of event.changedTouches) {
      if (!tracked.has(touch.identifier)) continue
      tracked.delete(touch.identifier)
      onPointerCancel(makeEvent(touch, 'up'))
    }
  }

  wx.onTouchStart(handleStart)
  wx.onTouchMove(handleMove)
  wx.onTouchEnd(handleEnd)
  wx.onTouchCancel?.(handleCancel)

  let disposed = false
  return {
    dispose() {
      if (disposed) return
      disposed = true
      wx.offTouchStart?.(handleStart)
      wx.offTouchMove?.(handleMove)
      wx.offTouchEnd?.(handleEnd)
      wx.offTouchCancel?.(handleCancel)
      tracked.clear()
      manager.enabled = false
      store.getState().setEvents({ enabled: false })
    },
  }
}
