# Overworld

一个模块化的 **Web 3D RPG 游戏开发框架**,基于 React 18 + three.js(@react-three/fiber)+ zustand。

Overworld 从生产环境的 3D RPG 实践中提取通用能力沉淀而成:可探索 3D 世界、
玩家控制、NPC 对话、任务、物品、成就、教程、寻路 AI、昼夜天气、小地图、音频、通知、加载、
埋点、联机 presence、场景编辑器、多端交付——全部拆成独立的包,按需组合。开发一款新的同类
游戏时,你只需要编写**游戏内容数据**(NPC/对话树/任务表/成就表)和**玩法专属系统**,
其余交给框架。

## 包一览

| 包 | 职责 |
|---|---|
| `@overworld-engine/core` | 类型化事件总线、条件/效果注册表、存档(持久化)辅助、存档槽位管理、公共类型 |
| `@overworld-engine/scene` | 3D 世界层:SceneShell 数据驱动场景、玩家控制器、跟随相机、碰撞、邻近检测、GLTF 加载、主题 |
| `@overworld-engine/input` | 键盘输入优先级层级(模态框 > 对话 > 面板 > 游戏控制)、移动端虚拟摇杆 |
| `@overworld-engine/environment` | 昼夜循环 + 天气状态机,配套 R3F 灯光/雨雪粒子组件 |
| `@overworld-engine/minimap` | 通用小地图(标记注册表 + canvas 顶视图组件) |
| `@overworld-engine/ai` | 网格 A* + 层级化寻路(HPA*)、NPC 行为(巡逻/游荡/跟随/goTo)、行为树、昼夜日程、动态避障 |
| `@overworld-engine/devtools` | 开发期内容校验(对话/任务/场景引用完整性)、内容/场景 JSON Schema、事件总线剖析与日志 |
| `@overworld-engine/editor` | 游戏内场景/多关卡编辑器:放置/拖拽实体、撤销重做、属性面板、多场景管理、导出项目 JSON |
| `@overworld-engine/inspector` | 开发调试覆盖层:实时事件总线面板 + zustand store 快照 |
| `@overworld-engine/content` | 内容包:校验门控后把对话/任务/物品/成就热更新注入引擎 |
| `@overworld-engine/net` | 多人同步抽象:Transport 接口(内存/BroadcastChannel/WebSocket)、presence 复制/插值、事件中继、输入预测对账 |
| `@overworld-engine/relay` | net 的参考 WebSocket 中继服务器(房间广播、心跳剔除、优雅关闭) |
| `@overworld-engine/platform` | 平台检测与能力桥(web/telegram/tauri/capacitor/weapp),app:* 生命周期事件 |
| `@overworld-engine/adapters-weapp` | 微信适配层:存储/socket/音频/R3F canvas root/指针拾取/触摸摇杆 |
| `@overworld-engine/dialogue` | 无头对话树引擎(条件门控选项、效果、好感度) |
| `@overworld-engine/quest` | 无头任务状态机(声明式目标触发器、前置条件、奖励、任务链) |
| `@overworld-engine/inventory` | 无头背包/物品引擎(堆叠、容量、使用效果) |
| `@overworld-engine/achievements` | 无头成就引擎(订阅事件总线自动解锁) |
| `@overworld-engine/tutorial` | 无头教程步骤引擎(事件自动推进) |
| `@overworld-engine/audio` | BGM/音效管理(场景→曲目映射、自动播放策略、淡入淡出) |
| `@overworld-engine/notifications` | Toast / Alert / Confirm 无头通知队列 |
| `@overworld-engine/loading` | 资源加载进度聚合、场景预加载、资产清单(manifest)约定 |
| `@overworld-engine/analytics` | 可插拔埋点(GA4 / Clarity / console) |

“无头”(headless)= 只提供状态与逻辑,不带 UI;游戏用自己的视觉风格渲染。

## 设计哲学

1. **系统之间零依赖** —— 所有系统包只依赖 `@overworld-engine/core`。跨系统通信一律走类型化
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

**多端**:一套代码覆盖 Web / Telegram 小程序 / macOS / Windows / iOS / Android / 微信小游戏
(完整 3D)—— 见[多端支持指南](docs/guides/platforms.md)与 examples/ 下的
telegram-mini-app、desktop-tauri、mobile-capacitor、weapp-game 四个端模板。

官方示例(均只用 `@overworld-engine/*` 公开 API):

- [`examples/starter`](examples/starter) —— 村庄演示:移动/对话/任务/物品/成就/联机/编辑器/中英切换
- [`examples/dungeon`](examples/dungeon) —— 地牢探索:种子化程序地牢、行为树敌人、钥匙宝箱任务链、HPA* 引路(`?seed=N` 换地图)、调试面板(inspector)
- [`examples/scene-authoring`](examples/scene-authoring) —— 编辑→导出→校验→从 JSON 出图→重新导入的授权闭环
- [`examples/content-packs`](examples/content-packs) —— 内容包热更新(v2 对话/任务运行期注入)

配套服务器示例:[`examples/ws-server`](examples/ws-server)(联机中继)、
[`examples/authority-server`](examples/authority-server)(权威服务器 + 输入预测对账)。

## 文档

**文档站**(Fumadocs):`pnpm docs:dev` 本地启动 —— 快速开始、架构(含 Mermaid 依赖图)、
指南、23 个包的参考页、中文全文搜索、`llms.txt`。源码在 [`apps/docs`](apps/docs)。

仓库内 Markdown 原文:

- [架构说明](docs/architecture.md)
- [设计文档](docs/specs/2026-07-16-overworld-framework-design.md)
- 指南:[多端支持](docs/guides/platforms.md) · [i18n 内容组织](docs/guides/i18n.md) · [资产组织与预加载](docs/guides/assets.md) · [测试指南](docs/guides/testing.md) · [持久化互操作](docs/guides/persistence-interop.md) · [内容热重载](docs/guides/content-hmr.md) · [内容包](docs/guides/content-packs.md) · [权威多人](docs/guides/authoritative-multiplayer.md) · [发布流程](docs/guides/releasing.md) · [签名与上架](docs/guides/signing-and-store.md)
- 各包 `README.md`

## 技术栈与要求

React ^18、three >=0.160、@react-three/fiber ^8、@react-three/drei ^9、zustand ^5
(均为 peerDependencies,由游戏应用提供)。TypeScript strict,ESM only。

### 包管理器兼容性(npm / yarn / pnpm)

本仓库开发与 CI 使用 pnpm,但**发布产物是标准 npm 包**(ESM + `.d.ts`,
无 pnpm 特有字段或安装钩子),在 npm workspaces / yarn monorepo 中开箱即用:

- peer 依赖只有一层(react / three / @react-three/fiber / @react-three/drei /
  zustand),包与包之间通过 `dependencies` 正常声明,无深层 peer 链;
- npm v7+ 会自动安装 peer deps(v9+ 的解析更稳),在应用里显式声明上述
  五个 peer 即可,无需 `overrides` / `resolutions` 等特殊配置;
- 唯一通用要求:整个 monorepo 内 react / three / zustand 各自只有一份实例
  (npm workspaces 默认提升到根即可满足)。
