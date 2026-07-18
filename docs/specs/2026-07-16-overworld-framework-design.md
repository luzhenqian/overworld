# Overworld — Web 3D RPG 游戏开发框架设计文档

初稿:2026-07-16 · 现行:反映至 v1.5(23 个包)
逐版本演进见 [架构说明](../architecture.md) 的版本记录;当前分层能力以架构说明为准。

本文记录框架的设计目标、架构决策与解耦机制 —— 回答"**为什么这样分层**"。
逐包 API 见各包 README,面向使用者的说明见文档站。

## 1. 目标与范围

把一款生产 3D RPG 中与"具体玩法无关"的系统沉淀为一个独立、可复用、可扩展的游戏开发框架。
后续开发同类游戏(3D 可探索世界 + NPC 对话 + 任务 + 物品 + 成就)时,直接依赖
`@overworld-engine/*` 包,只需编写**游戏内容数据**和**玩法专属系统**。

非目标:

- 不提取纯玩法系统(游戏专属的经济/战斗/剧情/钱包等)—— 它们是游戏内容,不是框架。
- 不提供针对某一具体游戏的迁移改造 —— 框架只提供通用能力,接入方式由各游戏仓库自行决定。
- 桌游/棋牌类小游戏引擎不属于 3D RPG 框架范畴。

## 2. 技术栈

React 18 + TypeScript(strict) + three.js + @react-three/fiber 8 + @react-three/drei 9 +
zustand 5(persist 中间件做存档)。构建:pnpm workspace + tsup(ESM + d.ts)+ vitest。
react/three/fiber/drei/zustand 一律作为 **peerDependencies**,避免多实例问题。

## 3. 架构决策:多包 monorepo

1. **单一大包 `@overworld-engine/engine`** —— 上手简单,但边界模糊、按需引入困难,违背"很多通用模块"的要求。
2. **多包 monorepo(选定)** —— 每个系统一个包,职责单一、可独立测试、可按需组合;跨包只依赖
   `@overworld-engine/core` 的契约(事件总线/注册表),扩展性最好。
3. **模板仓库(copy-paste starter)** —— 无升级路径,不是框架。

选定方案 2。这一决策贯穿全部后续版本:每新增一类能力都是**新增一个包**,而非往现有包里塞。

## 4. 包划分(23 个包,分层)

一条铁律:**系统包之间禁止互相 import,只能依赖 `@overworld-engine/core`**,跨系统协作
一律走 core 的事件总线与注册表。

```
overworld/
├── packages/
│   ├── 基础层
│   │   └── core            事件总线、条件/效果注册表、持久化辅助、存档槽位、公共类型
│   ├── 3D 世界层
│   │   ├── scene           数据驱动场景、玩家控制器、碰撞、邻近检测、模型加载、传送门
│   │   ├── environment     昼夜循环 + 天气状态机(无头引擎 + R3F 组件)
│   │   └── minimap         标记注册表 + 等比投影 + canvas 顶视图(不依赖 three)
│   ├── 无头引擎层
│   │   ├── dialogue        对话树引擎(条件/效果声明式解析)
│   │   ├── quest           事件驱动的任务状态机
│   │   ├── inventory       物品/背包引擎(堆叠、容量、使用效果)
│   │   ├── achievements    事件总线驱动的成就引擎
│   │   └── tutorial        教程步骤引擎(手动/事件自动推进)
│   ├── AI 层
│   │   └── ai              A*/HPA* 寻路、NPC 行为、行为树、日程、动态避障
│   ├── 基础设施层
│   │   ├── input           键盘优先级层级 + 移动端虚拟摇杆
│   │   ├── audio           BGM/音效管理(场景→曲目映射、自动播放策略)
│   │   ├── notifications   Toast / Alert / Confirm 无头队列
│   │   ├── loading         资源加载进度、资产清单预加载
│   │   ├── analytics       可插拔埋点 Provider(GA4/Clarity/console)
│   │   ├── net             Transport 无关的多人同步:presence、事件中继、输入预测对账
│   │   └── relay           net 的参考 WebSocket 中继服务器(独立 Node 服务)
│   ├── 多端层
│   │   ├── platform        平台检测、能力桥、app:* 生命周期(壳 SDK 零硬依赖)
│   │   └── adapters-weapp  微信小游戏适配(存储/socket/音频/canvas root/指针拾取/摇杆)
│   └── 工具层
│       ├── devtools        内容/场景校验、JSON Schema、事件总线剖析/日志
│       ├── editor          游戏内场景/多关卡编辑器,导出项目 JSON
│       ├── inspector       开发调试覆盖层:事件总线面板 + store 快照
│       └── content         内容包:校验门控后热更新注入引擎
├── examples/               starter / dungeon / scene-authoring / content-packs +
│                           telegram-mini-app / desktop-tauri / mobile-capacitor /
│                           weapp-game / ws-server / authority-server
└── docs/                   架构说明、指南、设计文档
```

依赖方向(只允许向下):

```
examples/*                              → 按需组合任意系统包
所有系统包                              → core(且仅 core)
adapters-weapp(适配层例外)            → core / input / platform
relay(独立 Node 服务)                 → 实现 net 的线路协议,运行期不 import net
core                                    → 无内部依赖
```

系统包之间的所有协作走 core 的事件总线;所有数据驱动的副作用走效果/条件注册表。
需要共享形状的地方(如 ai 消费碰撞数据、net 消费玩家 transform)用**结构化类型**约定,
而不是 import 对方的包。

## 5. 核心解耦机制

三个机制让"系统包零互相依赖"成为可能,外加一个支撑用的持久化约定。

### 5.1 类型化事件总线(EventBus)

```ts
// @overworld-engine/core
export interface OverworldEventMap {
  'player:moved': { position: [number, number, number]; distance: number }
  'scene:changed': { from: string | null; to: string }
  'proximity:enter': { kind: 'npc' | 'building'; id: string }
  'proximity:leave': { kind: 'npc' | 'building'; id: string }
  'entity:interact': { kind: 'npc' | 'building'; id: string }
  'dialogue:started': { npcId: string; dialogueId: string }
  'dialogue:ended': { npcId: string; dialogueId: string; nodeId: string }
  'quest:started': { questId: string }
  'quest:objective-progress': { questId: string; objectiveId: string; current: number; target: number }
  'quest:objective-completed': { questId: string; objectiveId: string }
  'quest:completed': { questId: string }
  'item:added': { itemId: string; quantity: number }
  'item:removed': { itemId: string; quantity: number }
  'item:used': { itemId: string }
  'achievement:unlocked': { achievementId: string }
  'tutorial:step-changed': { tutorialId: string; stepId: string }
  'tutorial:completed': { tutorialId: string }
  // app:* 生命周期、net:* 联机等由对应包通过 declaration merging 并入
}
export class EventBus<M extends Record<string, unknown>> {
  on<K extends keyof M>(event: K, fn: (payload: M[K]) => void): () => void
  once<K extends keyof M>(event: K, fn: (payload: M[K]) => void): () => void
  emit<K extends keyof M>(event: K, payload: M[K]): void
  off / clear
}
export const gameEvents: EventBus<OverworldEventMap>  // 默认全局单例(测试时自建实例注入)
```

游戏通过 **declaration merging** 扩展事件表(`declare module '@overworld-engine/core' { interface
OverworldEventMap { 'market:trade': {...} } }`),因此玩法事件也走同一根总线、享受同样的类型安全。
典型链路:Player 移动 → `emit('player:moved')` → 任务引擎自动推进"行走距离"目标。玩家控制器
不再直接调用任务 store —— 这个方向被反转成事件订阅。

### 5.2 条件/效果注册表(Registry)

对话、任务、成就的数据里只写**声明式引用**,不写代码:

```ts
export interface EffectRef    { type: string; params?: Record<string, unknown> }
export interface ConditionRef { type: string; params?: Record<string, unknown> }

export class Registry<Fn> {
  register(type: string, fn: Fn): void
  get(type: string): Fn | undefined
  has / unregister / types
}
export type EffectFn<Ctx = unknown>    = (params: Record<string, unknown>, ctx: Ctx) => void
export type ConditionFn<Ctx = unknown> = (params: Record<string, unknown>, ctx: Ctx) => boolean
export function runEffects(reg, refs, ctx): void        // 未注册的 type 打 warning 不抛错
export function evaluateConditions(reg, refs, ctx): boolean  // AND 语义,空数组=true,未注册 fail closed
```

游戏启动时注册自己的效果:`effects.register('wallet.addGold', ...)`。任务奖励数据写
`{ type: 'wallet.addGold', params: { amount: 100 } }`。任务引擎因此永远不知道钱包 store 的存在。

### 5.3 内容注入(configure,不 import)

所有无头引擎都是 **store 工厂**:`createQuestEngine(config)`、`createDialogueEngine(config)`,
内容(任务表、对话树、NPC 表、成就表)通过 config 传入,并可运行期增量注册
(`registerQuests(...)`)。框架包内**零内容**。`@overworld-engine/content` 在此之上提供
内容包(校验门控后按段热更新注入),配合 core 的 `defineMigrations` 做内容/存档演进。

### 5.4 持久化辅助(支撑约定)

`persistOptions(name, options)` 封装 zustand persist:统一 key 前缀(默认 `overworld:`)、
版本号 + migrate、可替换 StorageAdapter(localStorage / 云存档 / Tauri 文件 / Telegram
CloudStorage)、`partialize` 白名单。全框架统一约定:**`persist` 省略或 `false` = 关闭,
`true` = 默认,传对象 = 自定义**。多存档位用 `createSaveSlots`;`FlushableStorage.flush()`
在 `app:paused` 前落盘。

## 6. 各包设计要点

各包只描述**设计契约**;完整 API 见各包 README。

### 基础层

- **core** —— `events`(EventBus + OverworldEventMap)、`registry`(Registry / EffectRef /
  ConditionRef + runEffects / evaluateConditions)、`persist`(persistOptions / createSaveSlots /
  defineMigrations / StorageAdapter)、`types`(Vec3、EntityKind 等)。除 zustand 外零依赖,
  无 React/three。全部单测。

### 3D 世界层

- **scene** —— 数据驱动:场景 = `SceneShell` + `NPCConfig[]` + `BuildingConfig[]` + 主题。
  `Player` 是参数化控制器(`modelUrl?` 无模型时回退胶囊体、`animationMap?`、`speed/runSpeed`、
  `bounds?`、`colliderRadius`、可拆出的 `<FollowCamera/>`);移动经圆形碰撞解算、按累计距离节流
  发 `player:moved`。键盘屏蔽判定通过 `isInputBlocked?` 回调注入,scene 自身不依赖 input 包。
  任务指示器 / 交互提示走 props(`npcIndicators` / `interactHint`),由游戏从任务引擎推导。
  `SceneFromJson` 可直接吃编辑器导出的场景 JSON。
- **environment** —— 昼夜循环(timeOfDay / 相位 / tick 驱动)+ 天气状态机(权重轮换、可注入
  随机源),配套 R3F 灯光 / 雨雪粒子组件;事件表通过 declaration merging 扩展
  `environment:phase-changed` / `environment:weather-changed`。
- **minimap** —— 标记注册表 + 等比投影 + canvas 顶视图组件,玩家位置/朝向经结构化 ref 传入,
  不依赖 three.js。

### 无头引擎层

- **dialogue** —— 对话树(节点、response、condition、effect);`createDialogueEngine` →
  `start / currentNode / availableResponses(条件过滤) / choose(执行效果 + 跳转) / end`。
  NPC 好感度保留为通用字段(`relationships: Record<npcId, number>` + `adjustRelationship` 效果)。
- **quest** —— 纯任务状态机。目标声明 `trigger: { event, filter?, amountFrom? }`,引擎只订阅
  活跃任务实际需要的事件(如 `player:moved` 累计 distance);奖励走 `EffectRef[]`、前置走
  `ConditionRef[]` 或 questId 依赖;支持 `autoStart` / `chainNext` 任务链。不 import 任何玩法系统。
- **inventory** —— `createInventory({ items, capacity?, persist? })`:add/remove/use/has/count,
  堆叠、分类、使用效果走 EffectRef,emit `item:*` 供任务"收集 N 个 X"消费。
- **achievements** —— 定义 = `{ id, trigger: { event, filter?, count } }`,订阅总线计数达标解锁,
  emit `achievement:unlocked`(游戏 UI 自己弹 Toast)。
- **tutorial** —— 线性步骤,`advanceOn?: { event, filter? }` 或手动 `next()`,支持 skip 与进度持久化。

### AI 层

- **ai** —— 网格 A*(圆形障碍栅格化、禁切角、绳拉平滑、不可达回退最近可走格)+ 层级化寻路
  HPA*(簇分区 + 入口图,可达性与普通 A* 严格一致)+ `createAgent` 行为体(巡逻/游荡/跟随/goTo)
  + 行为树(记忆式 sequence/selector、parallel、blackboard、agent 动作节点)+ 昼夜日程 + 动态避障。
  通过结构化类型消费碰撞数据,不 import scene。

### 基础设施层

- **input** —— 键盘优先级层级栈(modal > dialogue > panel > game)+ `useKeyboardLayer` /
  `useHotkey` + 移动端 `<VirtualJoystick>` / `createMovementInput()`;与 scene 靠结构化类型协作。
- **audio** —— `createAudioManager({ tracks, sceneTracks?, volume?, persist? })`:HTMLAudio 单例池、
  自动播放策略解锁、场景切换淡入淡出、mute/volume 持久化,订阅 `scene:changed` 自动换 BGM;
  音频后端可注入(HTMLAudio / 微信)。
- **notifications** —— toast 队列(id/variant/duration/自动过期)+ alert/confirm 队列
  (`await confirm(...)`)。无头,不带 UI,视觉由游戏渲染。
- **loading** —— 加载进度聚合 + `defineAssetManifest` / `mergeManifests` / `preloadManifest`
  (纯预热,真实进度走 `useSceneLoadProgress`)。
- **analytics** —— `configureAnalytics({ providers })`,Provider 接口 `{ init, trackEvent, trackPage }`,
  内置 `ga4Provider` / `clarityProvider` / `consoleProvider`。
- **net** —— `Transport` 接口 + 三种参考实现(内存 hub / BroadcastChannel / WebSocket)+
  presence 复制/快照插值 + 事件中继(重入标志防回声)+ 输入预测与服务器对账。只依赖 core,
  与 scene 靠结构化类型协作;线路协议成文,2.0 前只增不改。
- **relay** —— net WebSocket transport 的参考中继服务器(房间 = URL 路径、verbatim 广播、心跳
  剔除死连接、优雅关闭),纯中继不做权威仲裁。独立 Node 服务,实现 net 的线路协议而不 import net。

### 多端层

- **platform** —— 平台检测(wx→tauri→capacitor→telegram→web→node)、能力查询、PlatformBridge
  (存储/外链/安全区/震动/生命周期)+ 内置桥 + `registerBridge`,`app:paused/resumed/back` 事件;
  桥全部动态探测,壳 SDK 零硬依赖。
- **adapters-weapp** —— 微信小游戏适配:wx 存储(喂 persistOptions)、`WeappWebSocket`(喂 net)、
  wx 音频后端、`createWeappCanvasRoot`(R3F 底层 createRoot,免 react-dom)、`createWeappPointerBridge`
  (wx 触摸驱动的射线拾取)、触摸摇杆。适配层允许依赖 core / input / platform。

### 工具层

- **devtools** —— 内容 / 场景校验(引用完整性、不可达节点、前置循环、效果/条件已注册核对)+
  JSON Schema(draft 2020-12)+ 事件总线剖析(`profileBus`)与日志。校验输入是结构化 duck-type,
  不依赖任何系统包。
- **editor** —— 游戏内场景 / 多关卡编辑器:射线放置 / 选择 / XZ 拖拽、多选对齐、撤销重做、
  多场景管理,导出的 JSON 与 scene 的 NPCConfig/BuildingConfig **结构兼容**(不 import scene)。
- **inspector** —— 开发调试覆盖层:`createEventStream`(确定性环形缓冲)+ `<EventBusInspector>`
  实时事件流 / 计数 + `<StoreInspector>` 任意 zustand store 实时快照。
- **content** —— `defineContentPack` / `validateContentPack` / `applyContentPack`:校验门控
  (有 error 则拒绝、零注册)后按段调用各引擎的 `registerX` 注入,引擎结构化传入而不 import。

## 7. 参考示例

`examples/starter` 是最小可玩验收(同时是框架的集成测试):

1. 加载进入一个场景(程序化地面 + 灯光,无需美术资产;玩家为胶囊体)。
2. WASD 移动、碰撞、跟随相机。
3. 走近 NPC 出现交互提示,按 E 进入对话树,选项带条件与效果。
4. 对话触发任务"行走 20 米 + 与 NPC 再次对话",HUD 订阅 quest 事件显示进度。
5. 拾取物品进背包,完成"收集"目标,经效果注册表发奖励,弹 Toast,解锁成就。

全程只用 `@overworld-engine/*` 公开 API,不允许 deep import。其余示例覆盖更大场景:
`dungeon`(程序地牢 + 行为树敌人 + HPA* + inspector 面板)、`scene-authoring`(编辑→导出→
校验→出图→重导入闭环)、`content-packs`(内容包热更新),以及四个端模板与两个服务器示例。

## 8. 工程规范

- TypeScript strict;所有包 `"type": "module"`,tsup 产出 ESM + d.ts,`exports` 字段规范导出。
- 每包 `src/index.ts` 唯一公开入口;无头引擎在纯 Node 环境 vitest 单测(注入独立 EventBus 与
  memory storage);3D / 联机 / 编辑器 / 多端靠各示例的 Playwright E2E 集成验收。
- 确定性:全家桶可注入 `clock` / `scheduler` / `random` / `events`,同 seed 重放全等
  (防作弊与自动化测试的共同基础)。
- 根:`pnpm build`(拓扑序)、`pnpm test`、`pnpm typecheck`。
- 版本:changesets fixed 版本组,`@overworld-engine/*` 统一版本一起发布。
- peerDependencies:react ^18、three >=0.160、@react-three/fiber ^8、@react-three/drei ^9、
  zustand ^5(仅在需要的包声明)。

## 9. 演进与路线

已落地能力按版本演进,详见 [架构说明](../architecture.md) 的版本记录(v0.1 初始 12 包 →
v1.5 共 23 包:多端、确定性/联机基建、场景授权闭环、实时调试、内容包等)。

后续路线(v1.6+):微信 useGLTF 官方适配器 vendor 化、编辑器可视化关卡跳转 / 门户连线、
内容包签名与 CDN 分发、多语言内容包工作流、性能预算 CI 门禁、录制回放(事件流 → 确定性重放)。
