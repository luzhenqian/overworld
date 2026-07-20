# @overworld-engine/core

Overworld 框架的最底层。所有系统包只允许依赖本包;跨系统协作全部经由这里提供的
机制完成:**类型化事件总线**(系统间通信)、**条件/效果注册表**(数据驱动内容与
代码解耦)、**统一的持久化约定**(`persistOptions` + 存档槽位 + 云存档适配器)。
本包零 UI、零渲染依赖,可在纯 Node 环境中使用与测试。

## 事件总线(EventBus)

```ts
import { EventBus, gameEvents, type OverworldEventMap } from '@overworld-engine/core'

// 全局单例:所有系统的零配置默认总线
const off = gameEvents.on('quest:completed', ({ questId }) => {
  console.log('任务完成', questId)
})
gameEvents.emit('quest:started', { questId: 'welcome' })
off() // on/once/onAny 都返回退订函数

// 测试或多实例场景:自建总线,经各引擎的 events 配置注入
const bus = new EventBus<OverworldEventMap>()
```

框架事件表 `OverworldEventMap` 覆盖玩家移动、场景切换、邻近、交互、对话、任务、
物品、成就、教程;游戏通过 declaration merging 扩展:

```ts
declare module '@overworld-engine/core' {
  interface OverworldEventMap {
    'market:trade': { symbol: string; amount: number }
  }
}
```

行为细节:监听器抛异常会被捕获打日志、不影响其他监听器;emit 中订阅/退订不影响
本次分发;`onAny` 订阅全部事件(调试面板、埋点、录制回放)。

## 条件/效果注册表(Registry)

内容数据里只写声明式引用(`{ type, params }`),游戏启动时注册处理函数:

```ts
import { createConditionRegistry, createEffectRegistry, runEffects, evaluateConditions } from '@overworld-engine/core'

const effects = createEffectRegistry<GameCtx>()
effects.register('wallet.addGold', (params, ctx) => ctx.wallet.add(params.amount as number))
runEffects(effects, [{ type: 'wallet.addGold', params: { amount: 100 } }], gameCtx)
```

- `runEffects`:按序执行,未注册的 type 打 warning 跳过(内容错误不崩游戏)。
- `evaluateConditions`:AND 语义,空数组为 true,未注册的条件 **fail closed**(返回 false)。

## 持久化(persistOptions)

为 zustand `persist` 中间件生成统一选项:key 规范为 `overworld:<name>`、版本号 +
`migrate`、存储后端可替换(localStorage / `createMemoryStorage()` / 自定义适配器)。

```ts
create<State>()(persist(initializer, persistOptions({ name: 'inventory', version: 1 })))
```

- `createMemoryStorage()` — 测试 / SSR 用内存存储,同时满足 `StateStorage` 与 `EnumerableStorage`。
- `createRestStorage(config)` — 异步 REST 云存档适配器(按 key 尾沿防抖、404=null、`flush()` 关页前落盘)。
- `createSaveSlots(config)` — 多存档位:live 快照/恢复与命名槽位(`saveTo/loadFrom/listSlots/deleteSlot/clearCurrent`),槽位存于 `overworld:slots:<name>`。可注入 `clock`(`() => number`,默认 `Date.now`)提供 `savedAt` 时间戳——同 seed 重放需注入 clock;引擎值层面无 `Math.random`。

## 公共类型

`Vec3`、`EntityKind`、`EntityRef`、`EffectRef`/`ConditionRef`、
`OverworldPersistConfig`、`OverworldEventName` 等。

## 本版本新增:输入锁(inputLock)

无头、框架无关的"游戏输入是否被挂起"单一事实来源:键盘、摇杆、交互键、
相机拖拽等任意输入源都咨询它,互不 import。

```ts
import { inputLock } from '@overworld-engine/core'

inputLock.acquire('dialogue')     // 打开对话时获取具名锁(幂等)
inputLock.isLocked()              // → true,任意输入源据此挂起响应
inputLock.release('dialogue')     // 关闭对话时释放
```

- `inputLock` — 绑定全局 `gameEvents` 的单例;`createInputLock(bus?)` 可创建
  隔离实例(测试/多引擎场景)。
- `acquire(id)` / `release(id)` 幂等;`activeLocks()` 返回当前持有的锁 id
  (稳定排序);`releaseAll()` 用于场景切换/测试清理。
- `subscribe(fn)` 订阅锁状态变化;每次变化同时在总线上发出
  `input:lock-changed`(`{ locked, active }`)。
- `@overworld-engine/input` 的 `useKeyboardLayer({ lockInput: true })` 与
  `<VirtualJoystick respectInputLock>`、`@overworld-engine/scene` 的
  `Player`/交互键/`FollowCamera` orbit 均默认消费本锁。

## 依赖

peerDependency 仅 `zustand`(持久化辅助);事件总线与注册表零依赖。
