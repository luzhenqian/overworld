# 内容热重载:改内容,不丢进行中的状态

## 约定:内容是纯数据,引擎按 id 增量替换

内容(任务 / 对话 / 物品 / 成就)是纯数据模块——starter 的 `game/content.ts`
只有导出的数组,没有代码、没有副作用。四个引擎都提供 registerX 入口,
**按 id 新增或替换定义**,注意参数形式不同:

| 引擎 | 调用 | 参数形式 |
|---|---|---|
| quest | `quests.getState().registerQuests(...QUESTS)` | rest 参数(zustand action) |
| dialogue | `dialogue.getState().registerDialogues(...DIALOGUES)` | rest 参数(zustand action) |
| inventory | `inventory.registerItems(ITEMS)` | 数组(引擎对象方法) |
| achievements | `achievements.registerAchievements(ACHIEVEMENTS)` | 数组(引擎对象方法) |

热重载因此只是一件事:在 Vite 的 `import.meta.hot.accept` 回调里拿到新的
内容模块,重新调一遍 registerX。运行时状态(任务进度、背包、成就计数、
好感度)全部留在原地——改文案、调数值不用重玩一遍。

## 接线(engines.ts 末尾)

```ts
if (import.meta.hot) {
  import.meta.hot.accept('./content', (mod) => {
    if (!mod) return // 接受失败(如新模块抛错)时 mod 为 undefined
    quests.getState().registerQuests(...mod.QUESTS)
    dialogue.getState().registerDialogues(...mod.DIALOGUES)
    inventory.registerItems(mod.ITEMS)
    achievements.registerAchievements(mod.ACHIEVEMENTS)
  })
}
```

quest / dialogue 是 rest 参数要展开,inventory / achievements 直接传数组——
写反了 TypeScript 会报错,但别靠猜。

## 推荐:先用 validateContent 校验再注册

@overworld-engine/devtools 的 `validateContent` 是纯函数,天然适合放在 accept
回调里做门禁:内容有错就保留旧定义,控制台报错,不让坏数据进引擎。

```ts
if (import.meta.hot) {
  import.meta.hot.accept('./content', async (mod) => {
    if (!mod) return
    const devtools = await import('@overworld-engine/devtools')
    const bundle = {
      dialogues: mod.DIALOGUES,
      quests: mod.QUESTS,
      items: mod.ITEMS,
      achievements: mod.ACHIEVEMENTS,
    }
    const report = devtools.validateContent(bundle, {
      effectTypes: effects.types(),
      conditionTypes: conditions.types(),
    })
    if (!report.ok) {
      console.error(devtools.formatReport(report))
      return // 有 error:不注册,继续跑旧内容
    }
    quests.getState().registerQuests(...mod.QUESTS)
    dialogue.getState().registerDialogues(...mod.DIALOGUES)
    inventory.registerItems(mod.ITEMS)
    achievements.registerAchievements(mod.ACHIEVEMENTS)
  })
}
```

`report.ok` 只看 error;warning(如未注册的 effect 类型)不拦截注册。

## 替换语义:进行中的状态会怎样

以下行为与各引擎源码一致,热更前请对号入座:

- **任务(registerQuests)**——`active`(逐 objective 进度)与 `completed`
  原样保留;注册后引擎重新 diff 事件订阅,所以改 objective 的
  `trigger.event` / `filter` 对进行中的任务**立即生效**。调小 `target`
  不会立刻结算完成——要等下一个匹配事件(或 `reportProgress`)到来时按新
  target 钳制并检查。批次里带 `autoStart` 的定义若满足前置会被立即启动。
  ⚠️ 给**已激活**的任务新增 objective 会把它卡死:进度条目在 startQuest
  时一次性创建,新 objective 没有条目,事件推进被忽略,而完成检查又要求
  新定义的所有 objective 都完成——这种改动请刷新页面。删除 objective 无害
  (残留进度被忽略,完成检查只看新定义)。
- **对话(registerDialogues)**——纯定义表替换,不打断进行中的对话:
  当前节点与响应列表仍是旧树的快照,但下一次 `choose` / `advance` 会从
  **新树**查找目标节点;若新树没有那个节点 id,引擎告警并强制结束对话
  (不计入完成)。`relationships` / `seenDialogues` / `completedDialogues`
  不受影响。
- **物品(registerItems)**——只更新定义表,背包槽位原样保留;调小
  `maxStack` 不压缩已有堆叠,只约束之后的 `add`。不涉及事件订阅。
- **成就(registerAchievements)**——逐条**退订旧触发器 → 替换定义 →
  订阅新触发器**。触发器回调闭包捕获定义对象,所以重新注册正是触发器
  变更生效的唯一途径。累计进度与已解锁状态保留;已解锁的成就忽略后续
  事件;改 `count` 后累计值在下一个匹配事件时按新目标结算。

共同点:registerX 只增改、**从不删除**——从内容文件里删掉的定义会留在
引擎里直到整页刷新。经验法则:文案、数值、奖励、触发条件的小改热更;
结构性大改(删内容、给活跃任务加 objective、重排对话节点 id)刷新页面。

## 局限与配套

- **场景实体不用手动处理**:`NPCS` 这类数组由 React 组件当 props 消费,
  Vite 的 React 插件热更组件时自然带着新数据重渲染,不需要出现在
  accept 回调里。
- **persist 开启时留意版本**:引擎持久化的是进度而非定义,热更定义不会
  写坏存档;但当改动影响持久化状态的含义(重命名 quest id、改 objective
  id 等),旧存档会指向不存在的定义。正式发布这类改动时,用
  `persistOptions` 的 `version` + `migrate`(@overworld-engine/core)迁移旧存档,
  开发期直接清 localStorage 更省事。
