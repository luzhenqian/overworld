# @overworld-engine/inspector

开发期调试覆盖层:实时观察 **事件总线** 与 **zustand store**。纯 DOM 覆盖层
(不依赖 three.js),挂在 `<Canvas>` 之外即可,和 `@overworld-engine/editor` /
`@overworld-engine/minimap` 同一套内联样式风格。**仅供开发期使用** —— 请用
`import.meta.env.DEV` 或按键开关把它挡在生产构建之外。

运行时依赖只有 `@overworld-engine/core` 与 `@overworld-engine/devtools`;
`react`、`zustand` 是 peer。

## 无头层:`createEventStream`

订阅 `bus.onAny`(默认全局 `gameEvents`),维护一个最近 `max` 条(默认 200)的
环形缓冲与每事件累计计数。`seq` / `at` 用**单调计数器**(非 `Date.now`),因此
在假时钟、同毫秒连发、SSR 下顺序都确定、可测。

```ts
import { createEventStream } from '@overworld-engine/inspector'
import { gameEvents } from '@overworld-engine/core'

const stream = createEventStream(gameEvents, { max: 100 })
gameEvents.emit('quest:started', { questId: 'welcome' })

stream.entries() // [{ seq: 0, event: 'quest:started', payload: {…}, at: 0 }]
stream.counts()  // { 'quest:started': 1 }
stream.clear()   // 清空缓冲与计数(seq 仍单调递增)
stream.stop()    // 取消订阅(幂等),返回 unsubscribe 函数
```

## 事件总线覆盖层:`<EventBusInspector>`

固定面板,展示实时事件流(事件名 + 精简 payload + `seq`)、每事件计数表与
暂停 / 清空控件;开启 `profile`(默认)时用 `profileBus` 附带每事件 `totalMs`。
面板只读、从不 emit,常驻挂着也安全。

```tsx
import { EventBusInspector } from '@overworld-engine/inspector'

{import.meta.env.DEV && show && <EventBusInspector position="top-right" />}
```

Props:`bus?`、`max?`(默认 200)、`position?`(`top-left` / `top-right` /
`bottom-left` / `bottom-right`,默认 `top-right`)、`paused?`、`profile?`
(默认 true)、`refreshMs?`(默认 250)、`style?`、`className?`、`testId?`
(默认 `'ow-inspector'`)。

## Store 覆盖层:`<StoreInspector>`

订阅一个 zustand store(裸 `StoreApi` 或 `create(...)` 绑定 hook 均可),渲染
可折叠的实时 JSON 快照。函数值显示为 `[fn]`、循环引用显示为 `[circular]`。

```tsx
import { StoreInspector } from '@overworld-engine/inspector'
import { useGameStore } from './game/state'

<StoreInspector store={useGameStore} label="game" collapsed />
```

Props:`store`(必填)、`label?`(默认 `'store'`)、`collapsed?`、`style?`、
`className?`、`testId?`(默认 `'ow-store-inspector'`)。
