/**
 * Full 3D on WeChat mini-games: an R3F root on `wx.createCanvas()` via
 * `@react-three/fiber`'s low-level `createRoot` API (no react-dom, no DOM
 * `<Canvas>`), sized from `wx.getSystemInfoSync()`.
 *
 * Requires the official `weapp-adapter` polyfill to be loaded first (it
 * provides the `window`/`document`/RAF/XHR shims three.js and React's
 * scheduler rely on) — see the weapp-game template.
 *
 * **v1.1 limitation (by design):** R3F **pointer events are not wired**
 * (`events: undefined`) — `onClick`/`onPointerOver` etc. on meshes never
 * fire, raycast picking is unavailable. Overworld games interact through
 * proximity detection + `interact()` and move via
 * `createWeappTouchJoystick`, which consume `wx` touch events directly, so
 * no scene graph events are needed. A custom EventManager bridge may come
 * in a later release.
 */
import type { ReactNode } from 'react'
import * as THREE_NS from 'three'
import { extend, createRoot, type ReconcilerRoot, type RenderProps } from '@react-three/fiber'
import { getWx, type WxCanvas } from './wxTypes'

/** Resolved canvas size: CSS-pixel dimensions plus device pixel ratio. */
export interface CanvasRootSize {
  /** Width in CSS px (`windowWidth`). */
  width: number
  /** Height in CSS px (`windowHeight`). */
  height: number
  /** Device pixel ratio, clamped to `[1, 2]`. */
  dpr: number
}

/** DPR is clamped to this maximum: >2 costs fill rate for invisible gains. */
export const MAX_CANVAS_DPR = 2

/**
 * Pure sizing math for {@link createWeappCanvasRoot}: window size from
 * system info, dpr = `dprOverride ?? pixelRatio` clamped to `[1, 2]`.
 */
export function computeCanvasRootSize(
  info: { windowWidth: number; windowHeight: number; pixelRatio: number },
  dprOverride?: number
): CanvasRootSize {
  const raw = dprOverride ?? info.pixelRatio
  const dpr = Math.min(Math.max(raw, 1), MAX_CANVAS_DPR)
  return { width: info.windowWidth, height: info.windowHeight, dpr }
}

/** The type `createRoot` must satisfy — also the test seam. */
export type CreateRootFn = (canvas: HTMLCanvasElement) => ReconcilerRoot<HTMLCanvasElement>

/** Options for {@link createWeappCanvasRoot}. */
export interface WeappCanvasRootOptions {
  /** Render canvas. Defaults to `wx.createCanvas()` (the on-screen canvas). */
  canvas?: WxCanvas
  /** Device pixel ratio override. Defaults to `getSystemInfoSync().pixelRatio`, clamped to 2. */
  dpr?: number
  /**
   * Extra R3F render props merged **over** the defaults (`gl` antialias,
   * size, dpr, `frameloop: 'always'`, no events) — e.g. `camera`,
   * `shadows`, `onCreated`.
   */
  renderProps?: RenderProps<HTMLCanvasElement>
  /** Test seam: replaces fiber's `createRoot`. */
  createRootImpl?: CreateRootFn
}

/** Handle returned by {@link createWeappCanvasRoot}. */
export interface WeappCanvasRoot {
  /** The configured R3F root (call `root.configure(...)` again to reconfigure). */
  root: ReconcilerRoot<HTMLCanvasElement>
  /** The WeChat canvas being rendered to. */
  canvas: WxCanvas
  /** Resolved size/dpr the root was configured with. */
  size: CanvasRootSize
  /** Render a React element tree into the root (re-render by calling again). */
  render(node: ReactNode): void
  /** Unmount the tree and release the root. Idempotent. */
  dispose(): void
}

/**
 * Create and configure an R3F root on a WeChat mini-game canvas:
 *
 * ```ts
 * import { createWeappCanvasRoot } from '@overworld-engine/adapters-weapp'
 *
 * const { render, dispose } = createWeappCanvasRoot()
 * render(<Game />)   // any R3F scene — SceneShell, Player, ...
 * ```
 *
 * Internally: `createRoot(canvas).configure({ size, dpr, gl: { antialias,
 * alpha: false }, frameloop: 'always', events: undefined })`. Pointer
 * events are intentionally not wired — see the module JSDoc.
 *
 * @throws outside a WeChat mini-game (no `wx.createCanvas`) when no
 * `canvas` is provided.
 */
let threeExtended = false

export function createWeappCanvasRoot(options: WeappCanvasRootOptions = {}): WeappCanvasRoot {
  if (!threeExtended) {
    // 底层 createRoot 不像 <Canvas> 会自动注册 three 的 JSX 目录,这里代劳
    extend(THREE_NS as unknown as Parameters<typeof extend>[0])
    threeExtended = true
  }
  const wx = getWx()

  let canvas = options.canvas
  if (!canvas) {
    if (typeof wx.createCanvas !== 'function') {
      throw new Error(
        '[overworld/adapters-weapp] wx.createCanvas is not available — ' +
          'createWeappCanvasRoot needs a WeChat *mini-game* environment ' +
          '(mini-programs have no global canvas); alternatively pass options.canvas.'
      )
    }
    canvas = wx.createCanvas()
  }

  const size = computeCanvasRootSize(wx.getSystemInfoSync(), options.dpr)
  // Pre-size the backing store; R3F's renderer.setSize confirms it later.
  canvas.width = size.width * size.dpr
  canvas.height = size.height * size.dpr

  const create = options.createRootImpl ?? (createRoot as CreateRootFn)
  // WxCanvas is runtime-compatible with what three's WebGLRenderer needs;
  // fiber's type only accepts HTMLCanvasElement | OffscreenCanvas.
  const root = create(canvas as unknown as HTMLCanvasElement)
  root.configure({
    gl: { antialias: true, alpha: false, powerPreference: 'high-performance' },
    // updateStyle: false — a wx canvas has no CSSStyleDeclaration to write.
    size: { width: size.width, height: size.height, top: 0, left: 0, updateStyle: false },
    dpr: size.dpr,
    frameloop: 'always',
    events: undefined,
    ...options.renderProps,
  })

  let disposed = false
  return {
    root,
    canvas,
    size,
    render(node) {
      if (disposed) {
        throw new Error('[overworld/adapters-weapp] this canvas root was disposed')
      }
      root.render(node)
    },
    dispose() {
      if (disposed) return
      disposed = true
      root.unmount()
    },
  }
}
