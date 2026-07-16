# Overworld

一个模块化的 **Web 3D RPG 游戏开发框架**,基于 React 18 + three.js(@react-three/fiber)+ zustand。

Overworld 从实际上线的 3D RPG 项目(degener-city)中提取通用能力沉淀而成:可探索 3D 世界、
玩家控制、NPC 对话、任务、物品、成就、教程、音频、通知、加载、埋点——全部拆成独立的包,
按需组合。开发一款新的同类游戏时,你只需要编写**游戏内容数据**(NPC/对话树/任务表/成就表)
和**玩法专属系统**,其余交给框架。

## 包一览

| 包 | 职责 |
|---|---|
| `@overworld/core` | 类型化事件总线、条件/效果注册表、存档(持久化)辅助、存档槽位管理、公共类型 |
| `@overworld/scene` | 3D 世界层:SceneShell 数据驱动场景、玩家控制器、跟随相机、碰撞、邻近检测、GLTF 加载、主题 |
| `@overworld/input` | 键盘输入优先级层级(模态框 > 对话 > 面板 > 游戏控制)、移动端虚拟摇杆 |
| `@overworld/environment` | 昼夜循环 + 天气状态机,配套 R3F 灯光/雨雪粒子组件 |
| `@overworld/minimap` | 通用小地图(标记注册表 + canvas 顶视图组件) |
| `@overworld/ai` | 网格 A* + 层级化寻路(HPA*)、NPC 行为(巡逻/游荡/跟随/goTo)、行为树、昼夜日程、动态避障 |
| `@overworld/devtools` | 开发期内容校验(对话/任务引用完整性)、内容 JSON Schema、事件总线日志 |
| `@overworld/editor` | 游戏内场景编辑器:放置/拖拽实体、撤销重做、属性面板、导出场景 JSON |
| `@overworld/net` | 多人同步抽象:Transport 接口(内存/BroadcastChannel/WebSocket)、presence 复制、事件中继 |
| `@overworld/dialogue` | 无头对话树引擎(条件门控选项、效果、好感度) |
| `@overworld/quest` | 无头任务状态机(声明式目标触发器、前置条件、奖励、任务链) |
| `@overworld/inventory` | 无头背包/物品引擎(堆叠、容量、使用效果) |
| `@overworld/achievements` | 无头成就引擎(订阅事件总线自动解锁) |
| `@overworld/tutorial` | 无头教程步骤引擎(事件自动推进) |
| `@overworld/audio` | BGM/音效管理(场景→曲目映射、自动播放策略、淡入淡出) |
| `@overworld/notifications` | Toast / Alert / Confirm 无头通知队列 |
| `@overworld/loading` | 资源加载进度聚合、场景预加载、资产清单(manifest)约定 |
| `@overworld/analytics` | 可插拔埋点(GA4 / Clarity / console) |

“无头”(headless)= 只提供状态与逻辑,不带 UI;游戏用自己的视觉风格渲染。

## 设计哲学

1. **系统之间零依赖** —— 所有系统包只依赖 `@overworld/core`。跨系统通信一律走类型化
   事件总线(`gameEvents`),例如玩家移动 → `player:moved` → 任务引擎自动推进"行走"目标。
2. **数据驱动 + 注册表** —— 对话/任务/成就的内容里只写声明式引用
   (`{ type: 'wallet.addGold', params: { amount: 100 } }`),游戏启动时注册对应处理函数。
   框架引擎永远不 import 游戏代码。
3. **内容注入,而非内容内置** —— 引擎都是工厂函数(`createQuestEngine({ quests, ... })`),
   框架包内零游戏内容。
4. **事件表可扩展** —— 游戏通过 declaration merging 把自己的玩法事件并入
   `OverworldEventMap`,享受同样的类型安全。

## 快速开始

```bash
pnpm install
pnpm build        # 拓扑序构建全部包
pnpm test         # 全部单测
pnpm --filter starter dev   # 运行示例游戏
```

最小示例见 [`examples/starter`](examples/starter):一个场景 + WASD 移动 + NPC 对话 +
任务 + 物品拾取 + 成就 + Toast,全部通过 `@overworld/*` 公开 API 实现。

## 文档

**文档站**(Fumadocs):`pnpm docs:dev` 本地启动 —— 快速开始、架构、指南、18 个包的
参考页、中文全文搜索、`llms.txt`。源码在 [`apps/docs`](apps/docs)。

仓库内 Markdown 原文:

- [架构说明](docs/architecture.md)
- [设计文档](docs/specs/2026-07-16-overworld-framework-design.md)
- [从 degener-city 迁移](docs/migration-from-degener-city.md)
- 指南:[i18n 内容组织](docs/guides/i18n.md) · [资产组织与预加载](docs/guides/assets.md)
- 各包 `README.md`

## 技术栈与要求

React ^18、three >=0.160、@react-three/fiber ^8、@react-three/drei ^9、zustand ^5
(均为 peerDependencies,由游戏应用提供)。TypeScript strict,ESM only。
