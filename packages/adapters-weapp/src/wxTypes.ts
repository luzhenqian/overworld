/**
 * Minimal structural typings for the WeChat `wx` global — exactly the
 * surface this package consumes, nothing more. Declared here (instead of
 * depending on `@types/wechat-miniprogram` etc.) so the package has zero
 * type-level dependencies on WeChat SDKs and the same shapes double as the
 * contract for test fakes (`vi.stubGlobal('wx', fake)`).
 *
 * Members that only exist in **mini-games** (canvas, global touch events)
 * are optional; the adapters that need them throw a helpful error when
 * they are missing (e.g. when running in a WXML mini-program).
 */

/** Result of `wx.getStorageInfoSync()`. */
export interface WxStorageInfo {
  /** All keys currently present in `wx` storage. */
  keys: string[]
}

/** Result of `wx.getSystemInfoSync()` (subset). */
export interface WxSystemInfo {
  /** Viewport width in CSS px. */
  windowWidth: number
  /** Viewport height in CSS px. */
  windowHeight: number
  /** Device pixel ratio. */
  pixelRatio: number
  /** Safe area in CSS px, when the device reports one (notches etc.). */
  safeArea?: {
    top: number
    right: number
    bottom: number
    left: number
    width: number
    height: number
  }
}

/** One touch point in a WeChat touch event. */
export interface WxTouch {
  identifier: number
  clientX: number
  clientY: number
}

/** Payload of `wx.onTouchStart/Move/End/Cancel` callbacks. */
export interface WxTouchEvent {
  touches: WxTouch[]
  changedTouches: WxTouch[]
}

/** Listener for WeChat touch events. */
export type WxTouchListener = (event: WxTouchEvent) => void

/** The `SocketTask` returned by `wx.connectSocket` (subset). */
export interface WxSocketTask {
  send(options: { data: string }): void
  close(options?: { code?: number; reason?: string }): void
  onOpen(callback: () => void): void
  onMessage(callback: (result: { data: string | ArrayBuffer }) => void): void
  onClose(callback: () => void): void
  onError(callback: (error: unknown) => void): void
}

/** The `InnerAudioContext` returned by `wx.createInnerAudioContext` (subset). */
export interface WxInnerAudioContext {
  src: string
  loop: boolean
  volume: number
  /** Whether playback is currently paused or stopped (read-only in wx). */
  readonly paused: boolean
  play(): void
  pause(): void
  stop(): void
  destroy(): void
  onEnded(callback: () => void): void
  offEnded(callback: () => void): void
}

/** The canvas returned by `wx.createCanvas()` in mini-games (subset). */
export interface WxCanvas {
  width: number
  height: number
  getContext(contextId: string): unknown
}

/**
 * Structural interface for the parts of the WeChat `wx` global used by
 * `@overworld-engine/adapters-weapp`.
 */
export interface Wx {
  // --- Storage (mini-program + mini-game) ---
  getStorageSync(key: string): unknown
  setStorageSync(key: string, value: unknown): void
  removeStorageSync(key: string): void
  getStorageInfoSync(): WxStorageInfo

  // --- Networking ---
  connectSocket(options: { url: string; protocols?: string[] }): WxSocketTask

  // --- Audio ---
  createInnerAudioContext(): WxInnerAudioContext

  // --- System ---
  getSystemInfoSync(): WxSystemInfo

  // --- App lifecycle ---
  onShow(callback: () => void): void
  onHide(callback: () => void): void
  offShow?(callback: () => void): void
  offHide?(callback: () => void): void

  // --- Mini-game only: rendering canvas ---
  createCanvas?(): WxCanvas

  // --- Mini-game only: global touch events ---
  onTouchStart?(callback: WxTouchListener): void
  onTouchMove?(callback: WxTouchListener): void
  onTouchEnd?(callback: WxTouchListener): void
  onTouchCancel?(callback: WxTouchListener): void
  offTouchStart?(callback: WxTouchListener): void
  offTouchMove?(callback: WxTouchListener): void
  offTouchEnd?(callback: WxTouchListener): void
  offTouchCancel?(callback: WxTouchListener): void
}

/**
 * The `wx` global, structurally typed.
 *
 * @throws outside a WeChat environment (no `wx` global) with a hint that
 * these adapters only run inside WeChat mini-games / mini-programs.
 */
export function getWx(): Wx {
  const wx = (globalThis as { wx?: Wx }).wx
  if (!wx) {
    throw new Error(
      '[overworld/adapters-weapp] the `wx` global is not available: these adapters ' +
        'only run inside WeChat mini-games / mini-programs (or tests that stub `wx`). ' +
        'On the web, use the regular web implementations instead ' +
        '(localStorage, createWebSocketTransport, the default audio backend).'
    )
  }
  return wx
}
