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

沿用 zustand persist,全框架统一约定:**`persist` 省略或 `false` = 不持久化;`true` =
默认配置开启;传对象 = 自定义 `name`/`version`/`storage`**。key 统一前缀
(`overworld:<name>`),版本化迁移,存储后端可替换(localStorage / `createMemoryStorage()` /
自定义云存档适配器)。

多存档位:core 的 `createSaveSlots()` 提供 live 存档快照/恢复与命名槽位
(`saveTo/loadFrom/listSlots/deleteSlot/clearCurrent`),槽位存于
`overworld:slots:<name>`。注意:已完成 hydration 的 store 在 `restore` 后需要刷新页面
或逐个调用 `persist.rehydrate()` 才会反映恢复的数据。

## 测试策略

- 无头引擎(core/quest/dialogue/inventory/achievements/tutorial/input/notifications):
  纯 node 环境 vitest 单测,注入独立 EventBus 与 memory storage。
- 3D 层:碰撞/场景 store 走单测;渲染部分靠 examples/starter 作为集成验收。

## v0.2 已落地

- `@overworld/environment`:昼夜循环(timeOfDay/相位/tick 驱动)+ 天气状态机(权重轮换、
  可注入随机源),R3F 组件 `EnvironmentTick`/`DayNightLighting`/`RainParticles`/
  `SnowParticles`/`WeatherVisuals`;事件表通过 declaration merging 扩展
  (`environment:phase-changed`/`environment:weather-changed`)——这正是留给游戏的扩展机制,
  框架自己也这么用。
- `@overworld/minimap`:标记注册表 + 等比投影 + canvas 顶视图组件,玩家位置/朝向通过
  结构化 ref 传入,不依赖 three.js。
- 虚拟摇杆:`@overworld/input` 的 `<VirtualJoystick>` + `createMovementInput()`;
  `Player` 的 `externalInput` 与键盘输入按向量合并,半推按比例减速。input 与 scene
  依然零相互依赖(共享形状靠结构化类型)。
- 存档槽位:见上文存档策略。

## v0.3 已落地

- `@overworld/ai`:网格 A* 寻路(圆形障碍栅格化、禁切角、绳拉平滑、不可达回退最近可走格)+
  `createAgent` 行为体(巡逻 loop/ping-pong、游荡、跟随、速度按秒计)+ `<NPCWalker>` R3F 组件。
  朝向约定与场景包 Player 一致;`collidersToObstacles` 通过结构化类型直接消费碰撞 store 的数据,
  不引入对 scene 包的依赖。
- `@overworld/devtools`:`validateDialogues/validateQuests/validateItems/validateAchievements/
  validateContent`(引用完整性、不可达节点、前置循环、效果/条件已注册核对、对话 quest.start →
  questId 跨包检查)+ `assertValidContent`(开发期启动即断言)+ `bindEventLogger`/
  `createEventRecorder`。校验输入是结构化 duck-type,devtools 不依赖任何系统包。
- 资产清单:loading 包的 `defineAssetManifest`/`mergeManifests`/`preloadManifest`
  (纯预热、不伪造进度,真实进度走 `useSceneLoadProgress`),见 docs/guides/assets.md。
- i18n 约定:内容字段一律不透明字符串(字面量或 key),渲染层翻译;Toast/事件载荷传
  key + 结构化参数,切语言不留旧语言残影。见 docs/guides/i18n.md,starter 有完整中英切换演示。

## v0.4 已落地

- `@overworld/editor`:游戏内场景编辑器雏形 —— `<EditorScene>`(Canvas 内射线放置/选择/
  XZ 拖拽、占位几何体)+ `<EditorPanel>`(实体列表、属性编辑、导入导出)+ `<EditorToggle>`。
  导出 JSON 与 scene 包的 NPCConfig/BuildingConfig **结构兼容**(不 import scene)。
- NPC 日程系统(ai 包):`createSchedule({ agent, entries })` 按相位声明式切换行为
  (patrol/wander/follow/goTo/idle),`bindScheduleToBus` 经 `onAny` 泛化订阅
  `environment:phase-changed` —— ai 与 environment 之间零类型耦合。
- 动态避障(ai 包):`createAgent` 的 `avoid.obstacles` 回调把移动实体(如玩家)当障碍,
  逐帧线段探测 + ±30°/±60°/±90° 固定序偏转(确定性),卡死超时后走网格重寻路;
  规划路径本身从不被避障篡改。
- 内容 JSON Schema(devtools 包):对话/任务/物品/成就的 draft 2020-12 Schema
  (`allContentSchemas`),供外部 .json 内容文件用 ajv 校验、编辑器 `$schema` 补全。

## v0.5 已落地

- `@overworld/net`:transport 无关的多人同步抽象 —— `Transport` 接口 + 三种参考实现
  (内存 hub / BroadcastChannel 跨标签页 / WebSocket 注入式),`createPresenceSync`
  (心跳按变更发送 + keepalive、过期清扫、bye 即时下线,`net:peer-joined/left` 事件),
  `relayEvents` 事件中继(重入标志防回声环),`<RemotePlayers>` 平滑插值渲染。
  starter 双开标签页即可互见幽灵玩家。
- 编辑器进阶:撤销/重做历史栈(拖拽/连续输入的 transient 突发合并为单个撤销步、上限 100)、
  实体复制(Ctrl/Cmd+D)、吸附步长可调、网格可视化。
- 层级化寻路(ai 包):`createHierarchicalGrid` 簇分区 + 入口图,`findPathHierarchical`
  窗口受限精化 + 全图 A* 兜底(可达性与普通 A* 严格一致);200×200 基准:访问格数
  3,393 vs 35,873。
- 行为树(ai 包):记忆式 sequence/selector、parallel(all/any)、wait/repeat/invert、
  blackboard、根完成自动复位;`goToAction/patrolAction` 等 agent 闭包动作节点,
  `tickTreeWithAgent` 显式组合(不魔改 agent)。

## v0.6 已落地

- 联机进阶(net 包):`createSnapshotBuffer` 延迟插值缓冲(渲染时刻 = now − delayMs,
  括值快照对插值、停发钳制不外推),presence 可选 `interpolation` + `samplePeer`,
  `<RemotePlayers>` 自动检测启用;`examples/ws-server` 参考中继服务器(房间、
  心跳收割、优雅关闭,真实三客户端验证)。
- 编辑器:实体模板目录(`setTemplates` 启动注册、放置模式选择器、字段预填走同一
  `addEntity` 路径继承撤销历史);GLTF 真实模型预览(fiber `useLoader` + Suspense +
  错误边界,失败回退占位几何体)。
- 云存档(core 包):`createRestStorage` 异步 REST 存储适配器(按 key 尾沿防抖、
  404=null、错误吞吐经 `onError`、`flush()` 关页前落盘),直接喂给 persist 的
  `storage` 即可切云存档。
- 性能剖析(devtools 包):`profileBus` 包裹 emit 统计每事件计数/总耗时/峰值,
  `top()`/`report()` 文本报表,叠加剖析链式生效(LIFO stop)。

## 版本路线(v0.7+)

输入预测/服务器对账参考实现、编辑器多选与对齐工具、内容热重载约定、
移动端性能预设(DPR/阴影/粒子降级)。
