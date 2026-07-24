# @overworld-engine/platform

运行时平台检测与能力桥:同一份 Web 构建跑在浏览器、Telegram 小程序、
Tauri 桌面壳、Capacitor 移动壳与微信环境上,端差异全部收敛到这一个包。
**零硬依赖** —— 壳 SDK(`window.Telegram.WebApp`、`window.Capacitor`、
Tauri 插件)一律运行时动态探测,依赖面只有 `@overworld-engine/core`(peer: react 可选)。

## 安装

```bash
pnpm add @overworld-engine/platform @overworld-engine/core
```

## 平台检测

```ts
import { detectPlatform, configurePlatform, resetPlatform } from '@overworld-engine/platform'

detectPlatform()
// 'web' | 'telegram' | 'tauri' | 'capacitor' | 'weapp' | 'node'
```

按特异性降序探测:`wx`(weapp)→ `__TAURI_INTERNALS__`(tauri)→
`window.Capacitor`(capacitor,web 构建的非原生运行时会被跳过)→
`window.Telegram.WebApp.initData` 非空(telegram)→ `window`(web)→ node。
测试/调试时用 `configurePlatform({ force: 'telegram' })` 强制指定,
`resetPlatform()` 恢复真实探测。

## 能力与画质推荐

```ts
import {
  getCapabilities, shouldShowTouchControls, recommendedQualityPreset,
} from '@overworld-engine/platform'

getCapabilities()
// { kind, hasDOM, hasWebGL, hasTouch, hasKeyboard,
//   persistentStorage: 'localStorage' | 'file' | 'wx' | 'memory' }

// VirtualJoystick 的默认开关:有触摸且没有物理键盘时为 true
{shouldShowTouchControls() && <VirtualJoystick target={inputRef} />}

// 平台修正后的画质推荐(telegram/capacitor/weapp 至多 'medium')
useQualityStore.getState().setPreset(recommendedQualityPreset())
```

React 侧可用 `usePlatform()`(memoized 的 `getCapabilities()` 结果)。

## PlatformBridge

```ts
import { gameEvents } from '@overworld-engine/core'
import { createBridge } from '@overworld-engine/platform'

const bridge = createBridge()            // 缺省按 detectPlatform()
bridge.storage()                         // EnumerableStorage,直接喂 persistOptions/createSaveSlots
bridge.openExternal('https://example.com')
bridge.safeAreaInsets()                  // { top, right, bottom, left }
bridge.vibrate?.('light')                // 平台支持时存在
const unbind = bridge.bindLifecycle(gameEvents)  // 端事件 → 'app:paused/resumed/back'
bridge.quit?.()                          // 桌面壳可用
```

内置桥(未注册的 kind 回退 web 桥并 `console.warn`):

- **web** —— localStorage(不可用时进程内 memory 兜底)、`window.open`、
  `visibilitychange` → `app:paused/resumed`。
- **telegram** —— 直接读 `window.Telegram.WebApp`(不依赖 @twa-dev/sdk):
  创建即 `ready()+expand()`;`openLink` 外链;`BackButton` 显示并发 `app:back`;
  `getTheme()` 暴露 `themeParams`;生命周期优先 `activated/deactivated`
  事件(Bot API ≥ 8.0),否则回退 `visibilitychange`。
- **tauri** —— 存档默认仍走 localStorage(WebView 持久);外链走 shell/opener
  插件(全局对象或动态 import),兜底 `window.open`;`visibilitychange` +
  `beforeunload`(关窗)→ `app:paused`;`quit()` 关闭当前窗口。
- **capacitor** —— App 插件 `pause/resume/backButton` → 总线(插件缺席回退
  `visibilitychange`);safe-area 读 CSS `env(safe-area-inset-*)`;
  Haptics 可用时接 `vibrate`。
- **weapp** —— 不内置,由 `@overworld-engine/adapters-weapp` 的
  `registerWeappBridge()` 通过 `registerBridge('weapp', factory)` 注入。

## Tauri 文件存档(可选升级)

`createTauriFileStorage()` 动态 `import('@tauri-apps/plugin-fs')`
(插件装在**壳模板**里,本包无 Tauri 依赖),返回
`Promise<EnumerableStorage>` —— 先 resolve,再交给 `persistOptions` /
`createSaveSlots`:

```ts
import { createTauriFileStorage } from '@overworld-engine/platform'

const storage = await createTauriFileStorage()   // 应用数据目录下的 JSON 文件
persistOptions({ name: 'inventory', storage: () => storage })
createSaveSlots({ storage })
```

写入按序串行落盘;插件缺失时 Promise 以带安装指引的错误 reject。

## Web 存档原语(`AtomicFileBackend`)

`createWebSaveFileBackend()` 实现 `@overworld-engine/core` 的
`AtomicFileBackend`(temp write / fsync / rename 六原语接口,配合
`commitSlot`/`recoverSlot` 使用,详见
`docs/superpowers/specs/2026-07-24-save-hardening-design.md`),基于
`localStorage`:

```ts
import { createWebSaveFileBackend } from '@overworld-engine/platform'
import { commitSlot, recoverSlot } from '@overworld-engine/core'

const backend = createWebSaveFileBackend()
await commitSlot(backend, 'saves/slot-1', payloadBytes)
const outcome = await recoverSlot(backend, 'saves/slot-1')
```

`syncFile` 是 no-op —— 浏览器没有 fsync 等价物,且 `localStorage.setItem`
本身是同步落盘,没有额外的"刷盘"步骤可触发。桌面壳的等价实现见
`@overworld-engine/adapters-savefile`(Tauri 插件,真正调用 `fsync`)。

## app:* 事件(declaration merging)

本包向 `OverworldEventMap` 合并三个空负载事件,任何总线上完全类型化:

- `app:paused` —— 切后台 / 失焦 / 关窗
- `app:resumed` —— 回到前台
- `app:back` —— Android 返回键 / TG BackButton,**游戏自行决定**关面板还是退出

```ts
gameEvents.on('app:back', () => closeTopPanel())
```

## 许可

MIT
