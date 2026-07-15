# Overworld 架构说明

## 分层与依赖方向

```
┌─────────────────────────────────────────────────────┐
│                     你的游戏 (app)                    │
│   内容数据(NPC/对话/任务/成就) + 玩法系统 + UI 皮肤     │
└──────────────────────────┬──────────────────────────┘
                           │ 依赖(按需组合)
┌──────────────────────────▼──────────────────────────┐
│  系统包(互相之间零依赖)                                │
│  scene  input  dialogue  quest  inventory            │
│  achievements  tutorial  audio  notifications        │
│  loading  analytics                                  │
└──────────────────────────┬──────────────────────────┘
                           │ 只允许依赖 core
┌──────────────────────────▼──────────────────────────┐
│  @overworld/core                                     │
│  EventBus / Registry / persistOptions / 公共类型      │
└─────────────────────────────────────────────────────┘
```

规则只有一条但必须严格遵守:**系统包之间禁止 import,只能通过 core 的事件总线和注册表间接协作**。
这是从 degener-city 中吸取的教训——那里的 questStore 直接 import 了 8 个玩法 store,
导致任务系统无法复用。

## 三种解耦机制

### 1. 事件总线(EventBus)

`@overworld/core` 导出全局单例 `gameEvents`(也可以自建实例注入引擎,测试时必须自建)。
框架事件表 `OverworldEventMap` 覆盖玩家移动、场景切换、邻近、交互、对话、任务、物品、
成就、教程。游戏用 declaration merging 扩展:

```ts
declare module '@overworld/core' {
  interface OverworldEventMap {
    'market:trade': { symbol: string; amount: number }
  }
}
```

典型链路:`Player` 发 `player:moved` → 任务引擎中 trigger 为 `player:moved` 的目标
按 `amountFrom: 'distance'` 累计 → 达标后发 `quest:objective-completed` →
成就引擎的计数器 +1 → UI 订阅弹 Toast。四个系统零相互引用。

### 2. 条件/效果注册表(Registry)

内容数据里的行为全部是声明式引用:

```ts
// 任务奖励(数据)
rewards: [{ type: 'wallet.addGold', params: { amount: 100 } }]

// 游戏启动时(代码)
effects.register('wallet.addGold', (params) => wallet.add(params.amount as number))
```

- `runEffects`:按序执行,未注册的 type 打 warning 跳过(内容错误不崩游戏)。
- `evaluateConditions`:AND 语义,空数组为 true,未注册的条件**fail closed**(返回 false)。

### 3. 内容注入(工厂函数)

每个引擎是 `createXxx(config)` 工厂,内容(任务表、对话树、成就表)从 config 传入,
支持运行期增量注册(`registerQuests` 等)。持久化通过 `persistOptions` 统一:
key 规范为 `overworld:<name>`、带版本号与 migrate、存储后端可替换
(localStorage / `createMemoryStorage()` / 自定义云存档适配器)。

## 3D 世界层(@overworld/scene)

数据驱动:场景 = `SceneShell` + `NPCConfig[]` + `BuildingConfig[]` + 主题(`SceneTheme`)。
SceneShell 负责碰撞注册、NPC/建筑渲染(GLTF 加载失败回退几何体)、选中光环、玩家。
`Player` 是参数化控制器(模型/动画映射/速度/边界/碰撞半径,无模型时回退胶囊体),
移动经过碰撞解算(圆形碰撞体 + 迭代推出),按累计距离节流发出 `player:moved`。
邻近检测每帧比对玩家与实体距离,写入 sceneStore 并发 `proximity:enter/leave`;
交互键触发 `interact` 事件,由游戏决定打开对话还是面板。

键盘输入的**屏蔽判定**通过 `isInputBlocked` 回调注入(通常接 `@overworld/input` 的
优先级层级),scene 包自身不依赖 input 包。

## 存档策略

沿用 zustand persist:各引擎默认持久化自己的进度切片(任务进度、成就、背包、好感度、
教程完成态),key 统一前缀,版本化迁移。需要"多存档位/云存档"时替换 StorageAdapter 即可。

## 测试策略

- 无头引擎(core/quest/dialogue/inventory/achievements/tutorial/input/notifications):
  纯 node 环境 vitest 单测,注入独立 EventBus 与 memory storage。
- 3D 层:碰撞/场景 store 走单测;渲染部分靠 examples/starter 作为集成验收。

## 版本路线(v0.2+)

天气/昼夜系统、3D 小地图、移动端虚拟摇杆、存档槽位管理、i18n 内容组织约定。
