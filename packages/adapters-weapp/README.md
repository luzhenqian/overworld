# @overworld-engine/adapters-weapp

微信环境适配器合集:把微信小游戏 / 小程序的 `wx` API 适配成 Overworld 既有的
注入点 —— 存档存储、WebSocket、音频后端、平台桥,以及小游戏专属的
**完整 3D 渲染入口**(R3F `createRoot` + `wx.createCanvas()`)与无 DOM 触摸摇杆。
所有导出都是**注入物**:喂给既有包的配置项即可,游戏代码其余部分与 Web 端共用。

> **依赖说明**:本包依赖 `core` + `input` + `platform` 三个工作区包 ——
> 这是**适配层的例外**(适配器的职责就是粘合它所服务的包)。系统包之间
> "只依赖 core"的 api-review 依赖规则不受影响,依旧适用于全部系统包。

## 安装

```bash
pnpm add @overworld-engine/adapters-weapp @overworld-engine/core @overworld-engine/input @overworld-engine/platform
# peers: react three @react-three/fiber zustand
```

小游戏工程还需要官方 [weapp-adapter](https://developers.weixin.qq.com/minigame/dev/guide/best-practice/adapter.html)
polyfill(`window`/`document`/RAF/XHR/触摸事件),请在模板内**锁定版本**;
基础库最低 2.19(WebGL1 兜底,three 自动降级)。

## 一览

| 导出 | 注入到 | 说明 |
| --- | --- | --- |
| `createWeappStorage()` | core `persistOptions` / `createSaveSlots` | `wx` 同步存储 API 上的 `EnumerableStorage` |
| `WeappWebSocket` | net `createWebSocketTransport({ WebSocketImpl })` | `wx.connectSocket` 上的标准 WebSocket 包装类 |
| `createWeappAudioBackend()` | audio `createAudioManager({ backend })` | `wx.createInnerAudioContext` 音频后端 |
| `createWeappCanvasRoot(options?)` | —(小游戏 3D 入口) | R3F root on `wx.createCanvas()` |
| `createWeappTouchJoystick(target, options?)` | scene `<Player externalInput>` | 无 DOM 触摸摇杆 |
| `registerWeappBridge()` | platform `createBridge()` | 注册 weapp 平台桥 |

## 存档:`createWeappStorage()`

```ts
import { createSaveSlots, persistOptions } from '@overworld-engine/core'
import { createWeappStorage } from '@overworld-engine/adapters-weapp'

const storage = createWeappStorage()
const slots = createSaveSlots({ storage })
// 各 store:persistOptions({ ..., storage: () => storage })
```

键枚举来自 `wx.getStorageInfoSync().keys`。注意:`wx.getStorageSync` 对不存在的
键返回 `''`,因此空字符串值不可表示、读取为 `null`(持久层只存 JSON 文档,
实际不受影响)。

## 联机:`WeappWebSocket`

标准 `WebSocket` 表面(`readyState`/`send`/`close`/`onopen`/`onmessage`/
`onclose`/`onerror`)包装 `wx.connectSocket` 的 SocketTask,与
`@overworld-engine/net` 的 `WebSocketConstructor` **结构兼容**(本包不依赖 net)。
一行注入,net 的 `{ from, data }` 信封、连接期缓冲、限次重连与 `close()`
语义原样生效:

```ts
import { createWebSocketTransport } from '@overworld-engine/net'
import { WeappWebSocket } from '@overworld-engine/adapters-weapp'

const transport = createWebSocketTransport({
  url: 'wss://example.com/room1',
  WebSocketImpl: WeappWebSocket,
})
```

(小游戏后台需将服务器域名加入 socket 合法域名白名单。)

## 音频:`createWeappAudioBackend()`

```ts
import { createAudioManager } from '@overworld-engine/audio'
import { createWeappAudioBackend } from '@overworld-engine/adapters-weapp'

const audio = createAudioManager({
  tracks,
  backend: createWeappAudioBackend(),
  pauseOnHide: true, // 配合 platform 桥的 app:paused/resumed
})
```

`AudioBackend`/`AudioHandle` 与 `@overworld-engine/audio` 的接口**结构一致**
(契约测试对两个后端跑同一套断言)。每个 handle 对应一个
`InnerAudioContext`,manager 会在一次性音效播完与切曲时自动 `destroy()` 释放。

## 小游戏 3D:`createWeappCanvasRoot(options?)`

R3F 底层 `createRoot(canvas)`(不依赖 react-dom)+ `wx.createCanvas()`:

```tsx
import { createWeappCanvasRoot } from '@overworld-engine/adapters-weapp'

const { render, dispose } = createWeappCanvasRoot()
render(<Game />) // SceneShell / Player / 任意 R3F 场景
```

- 尺寸取 `wx.getSystemInfoSync()`,dpr 钳制到 2(`options.dpr` 可覆盖);
- 缺省配置 `gl: { antialias: true, alpha: false }`、`frameloop: 'always'`;
  `options.renderProps` 可合并覆盖(如 `camera`、`shadows`、`onCreated`);
- 返回 `{ root, canvas, size, render, dispose }`,`dispose()` 幂等。

**v1.1 已知限制(设计如此)**:R3F **指针事件未接线**(`events: undefined`)——
mesh 上的 `onClick`/`onPointerOver` 等不会触发,射线拾取不可用。Overworld
游戏采用"接近检测 + `interact()` + 触摸摇杆"的交互模型(与官方示例一致),
不需要场景图事件;自定义 EventManager 桥接留待后续版本。

其他约束:drei `Text`(troika)在小游戏不可用 —— `BaseNPC`/`BaseBuilding`
传 `labelMode="sprite"`,并在启动时调用 scene 的
`setLabelCanvasFactory(() => wx.createCanvas())`;`useGLTF` 走 adapter 的
XHR polyfill,模型需放入包内或加入 CDN 白名单域。

## 触摸摇杆:`createWeappTouchJoystick(target, options?)`

无 DOM 的浮动摇杆:直接消费 `wx.onTouchStart/Move/End/Cancel`,以触点落点为
锚心,复用 `@overworld-engine/input` 的纯函数摇杆数学(死区 / 跑步阈值与
`<VirtualJoystick>` 完全一致),写入 `MovementInputRef`:

```ts
import { createMovementInput } from '@overworld-engine/input'
import { createWeappTouchJoystick } from '@overworld-engine/adapters-weapp'

const movement = createMovementInput()
const joystick = createWeappTouchJoystick(movement, { region: 'left-half' })
// <Player externalInput={movement} />;退出场景时 joystick.dispose()
```

选项:`region`(`'left-half'` 缺省 / `'full'`)、`size`(直径 px,缺省 120)、
`deadZone`、`runThreshold`。

## 平台桥:`registerWeappBridge()`

```ts
import { registerWeappBridge } from '@overworld-engine/adapters-weapp'
import { createBridge } from '@overworld-engine/platform'

registerWeappBridge() // 启动时调用一次
const bridge = createBridge() // 微信内 kind === 'weapp'
```

桥内容:`storage()` = `createWeappStorage()`;`bindLifecycle(bus)` 把
`wx.onShow/onHide` 转成总线 `app:resumed`/`app:paused`;`safeAreaInsets()`
读 `getSystemInfoSync().safeArea`;`openExternal()` 为 warn no-op(平台政策
不允许打开外部链接)。

## 测试

本包全部单测基于 `vi.stubGlobal('wx', fake)`;真实 WebGL 渲染由 wx-shim
浏览器 harness(playwright 注入模拟 `wx`)覆盖,微信开发者工具真机预览作为
最终人工确认。

## License

MIT
