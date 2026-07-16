# @overworld/devtools

开发期工具:**内容静态校验**(对话 / 任务 / 物品 / 成就)与**事件总线日志**。
所有校验器都是纯函数,只返回问题列表、从不抛出;`assertValidContent` 供
开发启动脚本与测试在存在 error 时快速失败。

## 零交叉依赖:结构化输入类型

devtools 校验的是 dialogue / quest / inventory / achievements 包的内容数据,
但**不 import 这些包**——唯一的运行时依赖是 `@overworld/core`。输入类型
(`DialogueTreeLike`、`QuestLike`、`ItemLike`、`AchievementLike`)是在本包内
定义的**结构化子集**(duck typing):TypeScript 是结构化类型系统,真实的
`DialogueTree` / `QuestDefinition` / `ItemDefinition` / `AchievementDefinition`
可以直接原样传入,无需转换。

## 校验 API

```ts
import { assertValidContent, formatReport, validateContent } from '@overworld/devtools'

const report = validateContent(
  { dialogues, quests, items, achievements },        // 每个分区都可选
  {
    effectTypes: effects.types(),                     // 注册表已知类型,提供才检查
    conditionTypes: conditions.types(),
    knownEvents: ['player:moved', 'item:added'],      // 提供才检查 trigger.event
    questStartEffectType: 'quest.start',              // 跨分区检查用,默认 'quest.start'
  }
)
console.log(formatReport(report))                     // 人类可读的多行摘要
if (import.meta.env.DEV) assertValidContent({ dialogues, quests }) // 有 error 即抛出
```

`ValidationReport = { issues, errors, warnings, ok }`,`ok` 表示没有 error
(warning 不影响)。每条 `ValidationIssue` 带 `severity`、`source`
(如 `dialogue:guide-intro`)、`path`(如 `nodes.hello.responses.ask.next`)与 `message`。

分区校验器也可单独使用:`validateDialogues` / `validateQuests` /
`validateItems` / `validateAchievements`。

### 规则一览

| 分区 | error | warning |
| --- | --- | --- |
| 对话 | 树/节点 id 重复;startNodeId 缺失;`next` / `response.next` 指向不存在的节点 | 从 startNodeId 不可达的节点;空 `responses: []`;`endsDialogue` 节点上永不生效的 `next`;未注册的 effect/condition 类型 |
| 任务 | 任务/目标 id 重复;零目标;`target < 1`;前置/`chainNext` 指向未知任务;前置循环(A 依赖 B 依赖 A) | 未注册的奖励/前置条件类型;`trigger.event` 不在已知事件表;autoStart 同时又是别人的 chainNext(双重启动);从未被内容启动的任务 |
| 物品 | id 重复 | 未注册的 `useEffects` 类型;`maxStack < 1` |
| 成就 | id 重复;`trigger.count < 1` | 缺失 `trigger` 字段;未注册的奖励类型;`trigger.event` 不在已知事件表 |

跨分区(`validateContent` 独有):对话中 `quest.start` 类效果的
`params.questId` 若缺失或不是已知任务 id → error;同时,被这类效果启动的
任务不再报"从未被启动"的 warning。

### 终止节点语义(与对话引擎一致)

已对照 `@overworld/dialogue` 引擎源码确认:**没有 `responses` 也没有 `next`
的节点就是合法的终止节点**——`advance()` 会在此结束对话并计为完成,与
`endsDialogue: true` 等价,因此校验器不会对它报任何问题。相反,
`endsDialogue` 节点上的 `next` 永远不会被走到(`advance()` 先判
`endsDialogue`),会得到 warning,且不算作可达性的边。

## 事件日志

```ts
import { bindEventLogger, createEventRecorder } from '@overworld/devtools'
import { gameEvents } from '@overworld/core'

// 开发期把总线上的所有事件打到控制台(基于 bus.onAny)
const unbind = bindEventLogger(gameEvents, {
  filter: (event) => event.startsWith('quest:'),  // 可选
  includePayload: true,                            // 默认 true
  log: (line, payload) => console.debug(line, payload), // 默认 console.debug,前缀 [overworld]
})
unbind()

// 测试断言:录制事件序列
const recorder = createEventRecorder(bus)
bus.emit('quest:started', { questId: 'welcome' })
recorder.events // [{ event: 'quest:started', payload: {...}, at: 0 }]
recorder.stop()
```

注意:`RecordedEvent.at` 是**单调递增的序号**(0、1、2…),不是
`Date.now()` 时间戳——这样在假时钟、同毫秒多次 emit 或任何运行环境下,
顺序断言都是确定的。
