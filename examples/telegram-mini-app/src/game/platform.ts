import { gameEvents } from '@overworld-engine/core'
import {
  createBridge,
  detectPlatform,
  recommendedQualityPreset,
  shouldShowTouchControls,
} from '@overworld-engine/platform'
import { useQualityStore } from '@overworld-engine/scene'

/**
 * 平台桥装配 —— 模板里唯一与"跑在哪个端"相关的模块。
 * 在浏览器直开时 detectPlatform() 返回 'web',一切自动回退到 web 行为,
 * 因此同一份代码既能本地调试也能作为 Telegram Mini App 上线。
 */

export const platform = detectPlatform()

export const bridge = createBridge()

/** 生命周期接线:平台事件(切后台 / BackButton)→ 总线上的 app:paused/resumed/back */
bridge.bindLifecycle(gameEvents)

/** 平台修正版画质推荐(telegram 端最多 medium,详见 @overworld-engine/platform) */
useQualityStore.getState().setPreset(recommendedQualityPreset())

/** 触屏环境默认挂载虚拟摇杆 */
export const showTouchControls = shouldShowTouchControls()
