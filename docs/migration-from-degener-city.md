# 从 degener-city 迁移到 Overworld

本文给出 degener-city(框架的提取来源)如果要改造为基于 `@overworld-engine/*`,各模块的映射关系
与改造要点。迁移是独立项目,可以按包渐进进行,不要求一次完成。

## 模块映射表

| degener-city(apps/web/src) | Overworld 对应物 | 改造要点 |
|---|---|---|
| `store/collisionStore.ts` | `@overworld-engine/scene` collisionStore | 直接替换 import |
| `store/keyboardStore.ts`、`hooks/useKeyboardShortcuts.ts` | `@overworld-engine/input` | 直接替换;`useKeyboardLayer` 已修正为真 hook |
| `types/scene.ts` | `@overworld-engine/scene` types | `SCENE_THEMES` 配色属于游戏内容,用 `createSceneTheme` 在游戏内定义 |
| `components/city/shared/*`(SceneShell/BaseNPC/BaseBuilding/SelectionRing/CollisionRegistration) | `@overworld-engine/scene` 同名组件 | 任务指示器/E 气泡改为 `npcIndicators`/`interactHint` props,由游戏从任务引擎推导 |
| `components/city/Player.tsx` | `@overworld-engine/scene` `<Player />` | 模型路径/边界/速度改 props;`questStore.onMoved()` 已被 `player:moved` 事件替代 |
| `hooks/useModelLoader.ts`、`useProximityDetection.ts` | `@overworld-engine/scene` | 邻近检测结果写 sceneStore 并发事件,不再写 gameStore |
| `store/gameStore.ts`(场景路由/邻近实体半边) | `@overworld-engine/scene` sceneStore | 玩家职业/五维属性等玩法属性留在游戏内新建 store |
| `store/npcStore.ts` + `data/dialogues/*` | `@overworld-engine/dialogue` + 游戏数据文件 | 对话树 schema 基本同构;`questTriggers`/effect 字符串改为 `EffectRef`;NPC 元数据(名字/头像/位置)留游戏 |
| `store/questStore.ts` + `data/quests/*` | `@overworld-engine/quest` + 游戏数据文件 | 原来 import 的 8 个玩法 store 全部改为:目标→事件触发器,奖励→效果注册表 |
| `store/inventoryStore.ts` | `@overworld-engine/inventory` | 物品表作为 `ItemDefinition[]` 注入 |
| `store/achievementStore.ts` | `@overworld-engine/achievements` | 1083 行硬编码检查改为声明式 trigger(event/filter/count) |
| `store/tutorialStore.ts` | `@overworld-engine/tutorial` | 步骤推进条件改 `advanceOn` 事件 |
| `store/audioStore.ts` | `@overworld-engine/audio` | `ZONE_BGM` 硬编码表改为 `sceneTracks` 配置注入 |
| `store/toastStore.ts`、`alertStore.ts` | `@overworld-engine/notifications` | `showQuestComplete` 等游戏味便捷方法在游戏内包一层 |
| `store/loadingStore.ts`、`ui/ScenePreloader.tsx` | `@overworld-engine/loading` | 直接替换 |
| `utils/analytics.ts`、`hooks/useAnalytics.ts` | `@overworld-engine/analytics` | GA4/Clarity 改 provider 注入 |

## 留在游戏里的(不迁移)

- 全部玩法系统:market/order/portfolio/leverage/pump/lp/wallstreet/meme/dao/hacker/
  skill/agent/residential/event/infoTier/dailyReward/narrative、钱包(Solana)集成。
- 全部内容数据:`data/npcs`、`data/dialogues`、`data/quests`、`data/buildings`、i18n 文案。
- 全部 UI 皮肤:HUD、各面板、Toast/对话框的视觉呈现。
- `game/` 下的棋牌小游戏引擎(自成体系,可未来单独抽包)。

> 天气/昼夜与俯视小地图当初还是框架待建功能,现已作为 `@overworld-engine/environment`
> 与 `@overworld-engine/minimap` 发布 —— 迁移时可直接替换 degener-city 的自研实现,
> 不必再留在游戏里。

## 建议迁移顺序

1. **无风险直换**:collision、keyboard/input、loading、toast/alert、analytics。
2. **事件接线**:引入 `gameEvents`,用 declaration merging 注册玩法事件
   (`market:trade`、`pump:launched` 等),让玩法 store 在关键动作处 emit。
3. **任务引擎**:把 `data/quests/*` 的目标定义改写为 `trigger: { event, filter, amountFrom }`
   形式,奖励改 `EffectRef`;注册 `market.addBalance` 等效果处理器;删除 questStore
   对 8 个 store 的 import。这是收益最大的一步。
4. **对话引擎**:对话树数据几乎不动,把 effect/condition 字符串换成 Ref 形式。
5. **场景层**:逐场景把 SceneShell/Player 换成框架版,传入 `npcIndicators`(从任务引擎
   状态推导)与 `isInputBlocked`(接 input 优先级)。
6. **成就/教程/背包/音频**:内容表改声明式定义后注入。

每步之后游戏都应可运行——事件总线与旧的直接调用可以短期并存(双写),验证后删旧路径。
