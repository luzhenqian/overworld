# Overworld — Web 3D RPG 游戏开发框架设计文档

日期:2026-07-16
状态:已定稿
来源:从 degener-city(3D 加密主题 RPG)中提取通用能力

## 1. 目标

把 degener-city 中与"具体玩法无关"的系统提取为一个独立、可复用、可扩展的游戏开发框架,
放在 `/Users/noah/Work/idea/overworld`。后续开发同类游戏(3D 可探索世界 + NPC 对话 +
任务 + 物品 + 成就)时,直接依赖 `@overworld-engine/*` 包,只需编写**游戏内容数据**和**玩法专属系统**。

非目标:
- 不迁移 degener-city 本身(单独提供迁移指南,迁移与否由游戏仓库自行决定)。
- 不提取纯玩法系统(交易/市场/meme/DAO/黑客/钱包等)——它们是游戏内容。
- 小游戏引擎(象棋/扑克/围棋等)不属于 RPG 框架,暂不纳入。
- 小地图(MiniMap3D)与区域数据耦合过深,列为后续版本目标。

## 2. 技术栈(与来源游戏一致)

React 18 + TypeScript(strict) + three.js + @react-three/fiber 8 + @react-three/drei 9 +
zustand 5(persist 中间件做存档)。构建:pnpm workspace + tsup(ESM + d.ts)+ vitest。
react/three/fiber/drei/zustand 一律作为 **peerDependencies**,避免多实例问题。

## 3. 备选方案与决策

1. **单一大包 `@overworld-engine/engine`** — 上手简单,但边界模糊、按需引入困难,违背"很多通用模块"的要求。
2. **多包 monorepo(选定)** — 每个系统一个包,职责单一、可独立测试、可按需组合;跨包只依赖
   `@overworld-engine/core` 的契约(事件总线/注册表),扩展性最好。
3. **模板仓库(copy-paste starter)** — 无升级路径,不是框架。

选定方案 2。

## 4. 包划分

```
overworld/
├── packages/
│   ├── core            @overworld-engine/core            类型化事件总线、条件/效果注册表、持久化辅助、公共类型
│   ├── input           @overworld-engine/input           键盘优先级层级栈(modal > dialogue > panel > game)
│   ├── scene           @overworld-engine/scene           3D 世界层:SceneShell、BaseNPC/BaseBuilding、Player、
│   │                                              跟随相机、圆形碰撞、邻近检测、GLTF 加载、主题、传送门
│   ├── dialogue        @overworld-engine/dialogue        无头对话引擎(对话树 + 条件/效果解释器)
│   ├── quest           @overworld-engine/quest           无头任务状态机(目标/触发/奖励,事件驱动)
│   ├── inventory       @overworld-engine/inventory       无头物品/背包引擎
│   ├── achievements    @overworld-engine/achievements    无头成就引擎(订阅事件总线自动解锁)
│   ├── tutorial        @overworld-engine/tutorial        无头教程步骤引擎
│   ├── audio           @overworld-engine/audio           BGM/音效管理(场景→曲目映射、自动播放策略处理)
│   ├── notifications   @overworld-engine/notifications   Toast / Alert 无头通知队列
│   ├── loading         @overworld-engine/loading         资源加载进度、场景预加载
│   └── analytics       @overworld-engine/analytics       埋点抽象(provider 可插拔,内置 GA4/Clarity)
├── examples/
│   └── starter                                    最小可玩示例:场景+移动+对话+任务+拾取+Toast
└── docs/                                          架构文档、迁移指南、本设计文档
```

依赖方向(只允许向下):

```
examples/starter → 所有包
scene / dialogue / quest / inventory / achievements / tutorial / audio / notifications / loading / analytics → core
core → (无内部依赖)
```

**系统包之间互不依赖**。所有跨系统通信走 `@overworld-engine/core` 的事件总线;所有数据驱动的
副作用走效果/条件注册表。这是框架最核心的解耦规则。

## 5. 核心解耦模式(修复 degener-city 的耦合点)

degener-city 的问题:questStore 直接 import 7+ 个玩法 store;npcStore 模块级 import 全部
对话数据;Player.tsx 直接调用 questStore.onMoved()。框架用四个模式替代:

### 5.1 类型化事件总线(EventBus)

```ts
// @overworld-engine/core
export interface OverworldEventMap {
  'player:moved': { position: [number, number, number]; distance: number }
  'scene:changed': { from: string | null; to: string }
  'proximity:enter': { kind: 'npc' | 'building'; id: string }
  'proximity:leave': { kind: 'npc' | 'building'; id: string }
  'interact': { kind: 'npc' | 'building'; id: string }
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
}
export class EventBus<M extends Record<string, unknown>> {
  on<K extends keyof M>(event: K, fn: (payload: M[K]) => void): () => void
  once<K extends keyof M>(event: K, fn: (payload: M[K]) => void): () => void
  emit<K extends keyof M>(event: K, payload: M[K]): void
  off / clear
}
export const gameEvents: EventBus<OverworldEventMap>  // 默认全局单例
```

游戏通过 **declaration merging** 扩展事件表(`declare module '@overworld-engine/core' { interface
OverworldEventMap { 'market:trade': {...} } }`),因此玩法事件也能走同一根总线。
Player 移动 → `emit('player:moved')` → 任务引擎自动推进"行走距离"目标。原来的
`Player → questStore.onMoved()` 硬耦合被反转。

### 5.2 条件/效果注册表(Registry)

对话、任务、成就的数据里只写**声明式引用**,不写代码:

```ts
export interface EffectRef   { type: string; params?: Record<string, unknown> }
export interface ConditionRef { type: string; params?: Record<string, unknown> }

export class Registry<Fn> {
  register(type: string, fn: Fn): void
  get(type: string): Fn | undefined
  has / unregister / types
}
export type EffectFn<Ctx = unknown>    = (params: Record<string, unknown>, ctx: Ctx) => void
export type ConditionFn<Ctx = unknown> = (params: Record<string, unknown>, ctx: Ctx) => boolean
export function runEffects(reg, refs, ctx): void        // 未注册的 type 打 warning 不抛错
export function evaluateConditions(reg, refs, ctx): boolean  // AND 语义,空数组=true
```

游戏启动时注册自己的效果:`effects.register('market.addBalance', ...)`。任务奖励数据写
`{ type: 'market.addBalance', params: { amount: 100 } }`。任务引擎不再知道 marketStore 的存在。

### 5.3 内容注入(configure,不 import)

所有无头引擎都是 **store 工厂**:`createQuestEngine(config)`、`createDialogueEngine(config)`,
内容(任务表、对话树、NPC 表、成就表)通过 config 传入,并可运行期增量注册
(`registerQuests(...)`)。框架包内**零内容**。同时每个包导出基于默认配置的便捷单例创建方式。

### 5.4 存档(持久化)辅助

`createPersist(name, options)` 封装 zustand persist:统一 key 前缀(默认 `overworld:`)、
版本号 + migrate、可替换 StorageAdapter(默认 localStorage,可换 IndexedDB/云存档)、
`partialize` 白名单。各引擎默认开启持久化,可关闭。

## 6. 各包设计要点

### @overworld-engine/core
events.ts(EventBus + OverworldEventMap)、registry.ts(Registry/EffectRef/ConditionRef +
run/evaluate)、persist.ts(createPersist、StorageAdapter)、types.ts(Vec3、EntityKind 等)。
无 React/three 依赖,除 zustand(persist 辅助)外零依赖。全部单测。

### @overworld-engine/input
移植 keyboardStore(优先级层级栈,已经完全通用)+ `useKeyboardLayer`(修正为真正的
useEffect 版本)+ `useHotkey(key, handler, priority)` 钩子。`KEYBOARD_PRIORITY` 常量保留
为默认值,允许游戏自定义数值。来源:`store/keyboardStore.ts`、`hooks/useKeyboardShortcuts.ts`。

### @overworld-engine/scene(最大的包)
- `types.ts`:NPCConfig/BuildingConfig/DecorationInstance/NPCTheme/BuildingTheme/SceneTheme
  (移植 types/scene.ts;SCENE_THEMES 预设改为 `defaultTheme` + `createTheme(partial)`,
  预设配色属于游戏内容,只保留 1-2 个中性示例主题)。
- `collision.ts`:移植 collisionStore(圆形碰撞注册表 + 推出解算,已通用)。
- `playerStore.ts`:玩家位置/朝向的引擎级 store(从 gameStore 拆出通用那一半);
  `sceneStore.ts`:currentScene / nearbyNpcId / nearbyBuildingId(泛型场景 id,字符串)。
- `Player.tsx`:参数化——`modelUrl?`(无模型时回退胶囊体)、`animationMap?({idle,walk,run})`、
  `speed/runSpeed`、`bounds?`、`colliderRadius`、`cameraFollow?`(内含原 Player 的跟随相机,
  拆成 `<FollowCamera/>` 可独立使用);移动时 `gameEvents.emit('player:moved')`,
  **移除 questStore.onMoved 调用**。键盘输入读 @overworld-engine/input?否——保持零内部依赖,
  监听原生 keydown 但暴露 `isInputBlocked?: () => boolean` 回调,由游戏接 input 包。
- `useProximityDetection.ts`:参数化半径与实体列表,结果写 sceneStore 并 emit
  `proximity:enter/leave`,**不再写 gameStore 专属 setter**。
- `useModelLoader.ts`、`preloadSceneModels`、`SceneShell`、`BaseNPC`、`BaseBuilding`、
  `SelectionRing`、`CollisionRegistration`、`Portal`:按原样移植,但把对
  questStore/npcStore 的读取(任务指示器、E 气泡)改成 props:
  `npcIndicators?: Record<string, 'quest-available' | 'quest-in-progress' | 'quest-complete'>`、
  `interactHint?: (id) => ReactNode`。
- 来源文件:components/city/shared/*、components/city/Player.tsx、hooks/useModelLoader.ts、
  hooks/useProximityDetection.ts、store/collisionStore.ts、types/scene.ts、
  components/city/Portal.tsx(若存在)。天气/昼夜系统列为 v0.2(weatherStore 移植成本低但
  视觉效果组件与游戏美术耦合,先不进 v0.1)。

### @overworld-engine/dialogue
移植 data/dialogues/types.ts 的对话树 schema(节点、response、condition、effect、
questTriggers → 改为通用 EffectRef)+ npcStore 中的对话推进逻辑:
`createDialogueEngine({ dialogues, conditions, effects, context, persist? })` →
`useDialogue` hook:`start(dialogueId)`、`currentNode`、`availableResponses`(条件过滤)、
`choose(responseId)`(执行效果 + 跳转)、`end()`。NPC 好感度/关系值保留为通用字段
(`relationships: Record<npcId, number>` + `adjustRelationship` 效果)。全程 emit 事件。

### @overworld-engine/quest
从 982 行 questStore 提取纯状态机:
- 数据 schema:`QuestDefinition { id, category?, prerequisites?: ConditionRef[] | questIds,
  objectives: ObjectiveDefinition[], rewards?: EffectRef[], autoStart?, chainNext? }`;
  `ObjectiveDefinition { id, target: number, trigger?: { event: keyof EventMap,
  filter?: Record<string,unknown>, amount?: 'payload.distance' | number } }`。
- 引擎:`createQuestEngine(config)` → active/completed 状态、`startQuest/reportProgress/
  completeQuest`、声明式 trigger 自动订阅事件总线(如 player:moved 累计 distance)、
  奖励通过效果注册表发放、前置条件通过条件注册表判断。
- **不 import 任何玩法 store**(原来的 8 个 import 全部换成事件订阅 + 效果注册)。

### @overworld-engine/inventory
`createInventory({ items: ItemDefinition[], capacity?, persist? })`:add/remove/use/has/count,
堆叠、分类、使用效果走 EffectRef。emit item:* 事件(供任务"收集 N 个 X"目标消费)。

### @overworld-engine/achievements
`createAchievements({ definitions })`:定义 = `{ id, trigger: { event, filter?, count } }`,
订阅总线计数,达标解锁,emit achievement:unlocked(游戏 UI 自己弹 Toast)。

### @overworld-engine/tutorial
`createTutorial({ tutorials })`:线性步骤,`advanceOn?: { event, filter? }` 或手动 next(),
支持 skip/进度持久化。

### @overworld-engine/audio
`createAudioManager({ tracks, sceneTracks?, volume?, persist? })`:HTMLAudio 单例池、
浏览器自动播放策略解锁(首次交互后重试)、场景切换淡入淡出、mute/volume 持久化。
订阅 scene:changed 自动换 BGM。来源:store/audioStore.ts(去掉硬编码 ZONE_BGM)。

### @overworld-engine/notifications
toast 队列(id/variant/duration/自动过期)+ alert/confirm 队列(promise 风格
`await confirm(...)`)。无头,不带 UI;示例 app 演示如何渲染。移除游戏味便捷方法
(showQuestComplete 之类留给游戏自己包一层)。来源:toastStore、alertStore。

### @overworld-engine/loading
`loadingStore`(总进度/分资源进度/阶段文案)+ `useAssetPreload(urls)`(封装 drei
useProgress/useGLTF.preload)。来源:loadingStore、ScenePreloader。

### @overworld-engine/analytics
`configureAnalytics({ providers })`,Provider 接口 `{ init, trackEvent, trackPage }`,
内置 `ga4Provider(id)`、`clarityProvider(id)`、`consoleProvider()`。hooks:`useAnalytics()`。
来源:utils/analytics.ts、hooks/useAnalytics.ts(去 React 强依赖,core 部分纯 TS)。

## 7. 示例游戏(examples/starter)

最小可玩验收标准(同时是框架的集成测试):
1. 加载进入一个场景(程序化地面 + 灯光,无需美术资产;玩家为胶囊体)。
2. WASD 移动、碰撞、跟随相机。
3. 走近 NPC(彩色胶囊)出现交互提示,按 E 进入对话树,选项带条件与效果。
4. 对话触发任务"行走 20 米 + 与 NPC 再次对话",HUD 显示任务进度(订阅 quest 事件)。
5. 场景里放一个可拾取物品,拾取进背包,完成"收集"目标,发奖励(效果注册表加金币),
   弹 Toast,解锁一个成就。
全程只使用 `@overworld-engine/*` 公开 API,不允许 deep import。

## 8. 工程规范

- TypeScript strict;所有包 `"type": "module"`,tsup 产出 ESM + d.ts,`exports` 字段规范导出。
- 每包:`src/index.ts` 唯一公开入口;vitest 单测(无头引擎必须有:core/quest/dialogue/
  inventory/achievements/tutorial/input/notifications 的核心逻辑);README。
- 根:`pnpm build`(拓扑序 `pnpm -r build`)、`pnpm test`、`pnpm typecheck`。
- 版本:独立版本号,初始 0.1.0;命名统一 `@overworld-engine/<name>`。
- peerDependencies:react ^18、three ^0.170、@react-three/fiber ^8、@react-three/drei ^9、
  zustand ^5(仅在需要的包声明)。

## 9. 风险与后续版本

- v0.1 不含:天气/昼夜、小地图、存档云同步、i18n 辅助(直接用 i18next 即可)、
  移动端虚拟摇杆。列入 docs/roadmap。
- degener-city 迁移:单独文档 docs/migration-from-degener-city.md 给出 store→包映射表;
  实际迁移是独立项目,不在本次范围。
