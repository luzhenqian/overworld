import { gameEvents } from '@overworld-engine/core'
import {
  createBridge,
  detectPlatform,
  recommendedQualityPreset,
  shouldShowTouchControls,
} from '@overworld-engine/platform'
import { useQualityStore } from '@overworld-engine/scene'

/**
 * 平台桥装配。Tauri 壳内 detectPlatform() 返回 'tauri'
 * (识别 window.__TAURI_INTERNALS__);`pnpm dev` 浏览器直开时为 'web',
 * 一切自动回退,玩法开发不需要起壳。
 */

export const platform = detectPlatform()

export const bridge = createBridge()

/** 生命周期接线:关窗/失焦 → 总线上的 app:paused/resumed */
bridge.bindLifecycle(gameEvents)

/** 平台修正版画质推荐(桌面壳通常直接 high) */
useQualityStore.getState().setPreset(recommendedQualityPreset())

/** 桌面无触屏时为 false,虚拟摇杆不挂载 */
export const showTouchControls = shouldShowTouchControls()
