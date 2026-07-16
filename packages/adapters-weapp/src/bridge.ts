/**
 * The weapp `PlatformBridge`, registered into `@overworld-engine/platform`.
 *
 * platform deliberately has no `wx` code of its own — its `createBridge()`
 * looks the `weapp` kind up in the bridge registry, and this module fills
 * that slot. Call {@link registerWeappBridge} once at startup (before
 * `createBridge()`), in the same place the weapp template loads its other
 * adapters.
 */
import type { EventBus, OverworldEventMap } from '@overworld-engine/core'
import { registerBridge, type PlatformBridge, type SafeAreaInsets } from '@overworld-engine/platform'
import { createWeappStorage } from './storage'
import { getWx } from './wxTypes'

function weappSafeAreaInsets(): SafeAreaInsets {
  const info = getWx().getSystemInfoSync()
  const safeArea = info.safeArea
  if (!safeArea) return { top: 0, right: 0, bottom: 0, left: 0 }
  return {
    top: safeArea.top,
    right: Math.max(0, info.windowWidth - safeArea.right),
    bottom: Math.max(0, info.windowHeight - safeArea.bottom),
    left: safeArea.left,
  }
}

/** `wx.onShow`/`onHide` → `app:resumed`/`app:paused` on the bus. */
function bindWeappLifecycle(bus: EventBus<OverworldEventMap>): () => void {
  const wx = getWx()
  const onShow = (): void => bus.emit('app:resumed', {})
  const onHide = (): void => bus.emit('app:paused', {})
  wx.onShow(onShow)
  wx.onHide(onHide)
  return () => {
    wx.offShow?.(onShow)
    wx.offHide?.(onHide)
  }
}

/**
 * Build the weapp {@link PlatformBridge}: `wx` storage for saves,
 * `onShow`/`onHide` lifecycle, safe area from `getSystemInfoSync()`.
 * `openExternal` is a warn-only no-op — WeChat mini-games cannot open
 * external browsers.
 *
 * Usually not called directly — use {@link registerWeappBridge} and let
 * platform's `createBridge()` construct it.
 */
export function createWeappBridge(): PlatformBridge {
  return {
    kind: 'weapp',
    storage: createWeappStorage,
    openExternal: (url) => {
      console.warn(
        `[overworld/adapters-weapp] openExternal("${url}") ignored: WeChat mini-games ` +
          'cannot open external URLs (platform policy).'
      )
    },
    safeAreaInsets: weappSafeAreaInsets,
    bindLifecycle: bindWeappLifecycle,
  }
}

/**
 * Register the weapp bridge with `@overworld-engine/platform`, so
 * `createBridge()` (and `createBridge('weapp')`) returns it inside WeChat:
 *
 * ```ts
 * import { registerWeappBridge } from '@overworld-engine/adapters-weapp'
 * import { createBridge } from '@overworld-engine/platform'
 *
 * registerWeappBridge()
 * const bridge = createBridge() // kind === 'weapp' inside WeChat
 * ```
 */
export function registerWeappBridge(): void {
  registerBridge('weapp', createWeappBridge)
}
