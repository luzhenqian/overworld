// Detection
export { detectPlatform, configurePlatform, resetPlatform } from './detection'
export type { PlatformKind, PlatformConfig } from './detection'

// Capabilities
export {
  getCapabilities,
  shouldShowTouchControls,
  recommendedQualityPreset,
} from './capabilities'
export type { PlatformCapabilities, QualityPresetName } from './capabilities'

// Bridges
export {
  createBridge,
  registerBridge,
  createWebBridge,
  createTelegramBridge,
  createTauriBridge,
  createCapacitorBridge,
  createTauriFileStorage,
} from './bridge'
export type {
  PlatformBridge,
  TelegramBridge,
  SafeAreaInsets,
  TauriFileStorageOptions,
} from './bridge'

// app:* lifecycle events (declaration merging into OverworldEventMap)
export { APP_EVENTS } from './events'
export type { AppEventName } from './events'

// React (optional; requires the react peer)
export { usePlatform } from './react'
