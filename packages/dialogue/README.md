# @overworld/dialogue

无头(headless)对话树引擎。只负责对话状态机:开始对话、按条件过滤选项、执行效果、
沿节点跳转、结束对话。不含任何 UI、不含任何游戏内容 —— 对话树以数据形式注入,
所有"条件"和"效果"都是指向 `@overworld/core` 注册表的声明式引用。

## 定位

- 对话内容(树)与行为(条件/效果处理器)彻底分离,引擎零内容、零玩法依赖。
- 跨系统通信只走事件总线:开始时 emit `dialogue:started`,结束时 emit `dialogue:ended`
  (任务系统可以据此完成"与某 NPC 对话"目标,无需互相 import)。
- 基于 zustand:返回值既是 React hook,也可通过 `getState()/subscribe()` 在 React 之外使用。

## 数据 Schema

```ts
interface DialogueTree {
  id: string
  startNodeId: string          // 起始节点
  nodes: DialogueNode[]
}

interface DialogueNode {
  id: string
  speaker?: string             // 说话人,引擎不解释
  text: string                 // 展示文本,可直接存 i18n key
  responses?: DialogueResponse[] // 玩家选项;省略则为线性节点,用 advance() 推进
  next?: string                // 线性节点的下一个节点
  effects?: EffectRef[]        // 进入节点时执行
  endsDialogue?: boolean       // 终止节点标记
}

interface DialogueResponse {
  id: string
  text: string
  conditions?: ConditionRef[]  // 全部通过才会出现在 availableResponses(AND 语义)
  effects?: EffectRef[]        // 选择时执行
  next?: string                // 跳转目标;省略则结束对话
}
```

## 快速上手

```ts
import { createConditionRegistry, createEffectRegistry } from '@overworld/core'
import { createDialogueEngine, relationshipEffects } from '@overworld/dialogue'

const conditions = createConditionRegistry<GameCtx>()
const effects = createEffectRegistry<GameCtx>()

// 游戏启动时注册自己的行为处理器
conditions.register('minLevel', (params, ctx) => ctx.player.level >= (params.level as number))
effects.register('wallet.addGold', (params, ctx) => ctx.wallet.add(params.amount as number))

const useDialogue = createDialogueEngine({
  dialogues: [guideTree],          // 对话树数据
  conditions,
  effects,
  context: () => gameContext,      // 传给每个条件/效果处理器,支持惰性求值
  // events: 自定义 EventBus(默认全局 gameEvents)
  // persist: false 或 { name?, version?, storage? }
})

// 内置的关系值效果:注册后内容里即可写
// { type: 'dialogue.adjustRelationship', params: { npcId: 'guide', delta: 5 } }
effects.registerAll(relationshipEffects(useDialogue))
```

## API

| 成员 | 说明 |
| --- | --- |
| `registerDialogues(...trees)` | 运行期增量注册/覆盖对话树 |
| `start(dialogueId, npcId?)` | 开始对话,emit `dialogue:started`;未知 id 警告并返回 `false` |
| `activeDialogue` / `currentNode` | 当前会话与当前节点(空闲时为 `null`) |
| `availableResponses` | 当前节点通过条件过滤后的选项(每次节点切换重新计算) |
| `choose(responseId)` | 选择选项:执行其效果,随 `next` 跳转或结束对话 |
| `advance()` | 推进线性节点(无可选项时):走 `next`,终止节点上结束对话 |
| `end()` | 立即关闭对话,emit `dialogue:ended` |
| `relationships` / `adjustRelationship(npcId, delta)` | 通用 NPC 关系值切片(不设上下限,含义由游戏定义) |
| `hasSeen(id)` / `hasCompleted(id)` | 该对话是否开始过 / 是否到达过终止节点 |

在 React 中直接把返回值当 hook 用:

```tsx
const node = useDialogue((s) => s.currentNode)
const responses = useDialogue((s) => s.availableResponses)
```

## 与事件总线的交互

- `start()` → emit `dialogue:started` `{ npcId, dialogueId }`(未传 npcId 时为空字符串)。
- 任何方式结束(选项收尾、`advance()` 到终点、`end()`)→ emit `dialogue:ended`
  `{ npcId, dialogueId, nodeId }`,`nodeId` 为结束时所在节点。
- 引擎自身不订阅任何事件;其它系统(如 @overworld/quest)通过订阅上述事件与对话解耦联动。

## 持久化

默认开启,经 `@overworld/core` 的 `persistOptions` 写入 `overworld:dialogue`
(可自定义 `name`/`version`/`storage`)。只持久化 `relationships`、`seenDialogues`、
`completedDialogues`;进行中的会话状态永不落盘。传 `persist: false` 可完全关闭。
