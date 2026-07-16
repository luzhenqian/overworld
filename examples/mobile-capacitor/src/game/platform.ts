import { gameEvents } from '@overworld-engine/core'
import {
  createBridge,
  detectPlatform,
  recommendedQualityPreset,
  shouldShowTouchControls,
} from '@overworld-engine/platform'
import { useQualityStore } from '@overworld-engine/scene'

/**
 * 平台桥装配。Capacitor 壳内 detectPlatform() 返回 'capacitor'
 * (识别 window.Capacitor);`pnpm dev` 浏览器直开时为 'web',
 * 一切自动回退,玩法开发不需要装 Xcode/Android Studio。
 */

export const platform = detectPlatform()

export const bridge = createBridge()

/**
 * 生命周期接线:capacitorBridge 监听 @capacitor/app 的 pause/resume/backButton,
 * 转发为总线上的 app:paused / app:resumed / app:back(Android 返回键)。
 */
bridge.bindLifecycle(gameEvents)

/** 平台修正版画质推荐(capacitor 端最多 medium,兜底低端机 WebView) */
useQualityStore.getState().setPreset(recommendedQualityPreset())

/** 手机触屏环境为 true —— 虚拟摇杆默认挂载 */
export const showTouchControls = shouldShowTouchControls()
