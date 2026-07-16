# @overworld-engine/quest

无头(headless)、事件驱动的任务状态机。任务定义以数据注入,目标进度由事件总线
自动推进,奖励与前置条件通过 `@overworld-engine/core` 的效果/条件注册表解析 ——
引擎不 import 任何玩法系统。

## 定位

原型(degener-city 的 questStore)直接 import 了 8 个玩法 store,并为每种玩法
写死了目标类型。本包用两个模式取代全部耦合:

- **进度 = 事件订阅**:目标声明 `trigger: { event, filter?, amountFrom? }`,
  引擎只订阅活跃任务实际需要的事件;玩法系统只管 emit。
- **奖励/前置 = 注册表引用**:奖励写 `{ type: 'wallet.addGold', params: {...} }`,
  前置条件写 `ConditionRef`,由游戏在启动时注册对应处理器。

## 数据 Schema

```ts
interface QuestDefinition {
  id: string
  category?: string            // 自由分组标签
  title?: string               // 展示文本,可存 i18n key
  description?: string
  prerequisites?: {
    quests?: string[]          // 必须先完成的任务 id
    conditions?: ConditionRef[] // 经条件注册表求值(AND 语义)
  }
  objectives: ObjectiveDefinition[]
  rewards?: EffectRef[]        // 完成时经效果注册表执行
  autoStart?: boolean          // 注册/初始化时自动开始(前置通过才生效)
  chainNext?: string[]         // 完成后自动开始的后续任务
}

interface ObjectiveDefinition {
  id: string
  description?: string
  target: number               // 达到该进度即完成
  trigger?: {
    event: string              // 事件名(支持游戏扩展的事件表)
    filter?: Record<string, unknown> // payload 字段浅相等匹配,全部命中才计数
    amountFrom?: string        // 从 payload 取数值累加(如 'distance');省略则每次 +1
  }
  hidden?: boolean             // UI 提示:目标先隐藏
}
```

## 快速上手

```ts
import { createConditionRegistry, createEffectRegistry, gameEvents } from '@overworld-engine/core'
import { createQuestEngine } from '@overworld-engine/quest'

const conditions = createConditionRegistry<GameCtx>()
const effects = createEffectRegistry<GameCtx>()
conditions.register('minLevel', (params, ctx) => ctx.player.level >= (params.level as number))
effects.register('wallet.addGold', (params, ctx) => ctx.wallet.add(params.amount as number))

const quests = createQuestEngine({
  quests: [
    {
      id: 'walk-the-city',
      objectives: [
        { id: 'distance', target: 20, trigger: { event: 'player:moved', amountFrom: 'distance' } },
        { id: 'talk', target: 1, trigger: { event: 'dialogue:ended', filter: { npcId: 'guide' } } },
      ],
      rewards: [{ type: 'wallet.addGold', params: { amount: 100 } }],
      chainNext: ['visit-market'],
    },
  ],
  conditions,
  effects,
  context: () => gameContext,   // 传给条件/效果处理器,支持惰性求值
  events: gameEvents,           // 默认即全局总线,可换成自建 EventBus
  // persist: 省略/false=不持久化;true=默认配置;或 { name?, version?, storage? }
  // clock: () => number,默认 Date.now,提供 startedAt 时间戳
})

quests.startQuest('walk-the-city')
// 玩家移动系统只需:gameEvents.emit('player:moved', { position, distance })
```

> **确定性**:同 seed 重放需注入 `clock`(否则 `startedAt` 写入墙钟时间,重放无法
> 逐字节复现);引擎值层面无 `Math.random`。

## API

| 成员 | 说明 |
| --- | --- |
| `store` | 底层 zustand vanilla store(`StoreApi<QuestEngineState>`),可直接 `subscribe`,React 里配合 `useStore` |
| `getState()` | 当前状态快照(等价于 `store.getState()`) |
| `registerQuests(...quests)` | 运行期增量注册;`autoStart` 任务满足前置即自动开始 |
| `startQuest(id)` | 校验前置(已完成集合 + 条件注册表),emit `quest:started`;未知 id 警告并返回 `false` |
| `reportProgress(questId, objectiveId, amount?)` | 手动推进(默认 +1),适合无事件可订阅的目标;非活跃任务被忽略,进度在 `target` 处截断 |
| `completeQuest(id)` | 全部目标完成时自动触发;发奖励 → emit `quest:completed` → 自动开始满足前置的 `chainNext` |
| `canStartQuest(id)` / `getAvailableQuests()` | 前置判定 / 当前可开始的任务定义 |
| `isActive(id)` / `isCompleted(id)` | 状态查询 |
| `resubscribe()` | 重挂活跃任务的触发器订阅(常规场景自动处理) |
| `dispose()` | 解除全部总线订阅,停止自动推进(`resubscribe()` 可恢复) |

状态字段(`active` 活跃任务(含每目标进度)、`completed` 已完成 id 列表、`definitions`)
通过 `engine.getState()` 快照读取,或订阅 `engine.store`。React 里用 zustand 的 `useStore`:

```tsx
import { useStore } from 'zustand'

const active = useStore(quests.store, (s) => s.active)
const completed = useStore(quests.store, (s) => s.completed)
```

## 与事件总线的交互

- **订阅**:引擎按"活跃任务中未完成目标的 `trigger.event` 去重集合"动态挂载监听,
  任务完成或目标达成后自动解除,不留悬挂监听。
- **发布**:`quest:started`、`quest:objective-progress`(含 `current`/`target`)、
  `quest:objective-completed`、`quest:completed`。HUD、音效、成就系统订阅即可,
  无需引用本包。

## 持久化

显式开启(`persist: true` 或配置对象),经 `persistOptions` 写入 `overworld:quest`
(可自定义 `name`/`version`/`storage`);省略或 `false` 则不持久化。
只持久化 `active`(含每目标进度)与 `completed`;任务定义属于内容,永不落盘。
重新水合后引擎会自动为恢复的活跃任务重挂触发器订阅(同步与异步 storage 均已处理)。
