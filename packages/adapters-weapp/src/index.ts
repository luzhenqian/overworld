// wx global (structural typings + accessor)
export { getWx } from './wxTypes'
export type {
  Wx,
  WxStorageInfo,
  WxSystemInfo,
  WxTouch,
  WxTouchEvent,
  WxTouchListener,
  WxSocketTask,
  WxInnerAudioContext,
  WxCanvas,
} from './wxTypes'

// Save storage (core EnumerableStorage over wx storage)
export { createWeappStorage } from './storage'

// Networking (WebSocketConstructor-compatible wrapper for @overworld-engine/net)
export { WeappWebSocket, WS_CONNECTING, WS_OPEN, WS_CLOSING, WS_CLOSED } from './socket'

// Audio backend (for @overworld-engine/audio's `backend` config)
export { createWeappAudioBackend } from './audio'
export type { AudioBackend, AudioHandle } from './audio'

// Mini-game 3D: R3F canvas root
export { createWeappCanvasRoot, computeCanvasRootSize, MAX_CANVAS_DPR } from './canvasRoot'
export type {
  WeappCanvasRoot,
  WeappCanvasRootOptions,
  CanvasRootSize,
  CreateRootFn,
} from './canvasRoot'

// Mini-game touch joystick (writes a MovementInputRef)
export { createWeappTouchJoystick } from './joystick'
export type { WeappTouchJoystick, WeappTouchJoystickOptions } from './joystick'

// Platform bridge registration
export { registerWeappBridge, createWeappBridge } from './bridge'
