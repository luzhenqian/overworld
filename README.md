# Overworld Engine

[![CI](https://github.com/luzhenqian/overworld/actions/workflows/ci.yml/badge.svg)](https://github.com/luzhenqian/overworld/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@overworld-engine/core?label=%40overworld-engine%2Fcore)](https://www.npmjs.com/package/@overworld-engine/core)
[![License: MIT](https://img.shields.io/badge/license-MIT-116b4d.svg)](LICENSE)
[![Documentation](https://img.shields.io/badge/docs-overworldengine.com-116b4d.svg)](https://overworldengine.com)

**A modular, cross-platform 3D RPG systems framework for TypeScript.** Build the
gameplay once, then ship it to the Web, desktop, mobile, WeChat Mini Games,
Telegram Mini Apps, and Node.js services.

Overworld works alongside React Three Fiber and Three.js: rendering stays in
your scene while quests, dialogue, inventory, AI, multiplayer, persistence, and
platform capabilities remain portable and testable.

**English guides:** [Framework overview](https://overworldengine.com/en) ·
[R3F RPG architecture](https://overworldengine.com/en/react-three-fiber-rpg-framework) ·
[Runnable R3F RPG starter](https://overworldengine.com/en/react-three-fiber-rpg-starter) ·
[TypeScript RPG framework comparison](https://overworldengine.com/en/typescript-rpg-framework-comparison) ·
[Cross-platform architecture](https://overworldengine.com/en/cross-platform-typescript-game-architecture) ·
[Game AI and NPC navigation](https://overworldengine.com/en/typescript-game-ai-navigation-system) ·
[Game save architecture](https://overworldengine.com/en/typescript-game-save-system) ·
[R3F game state management](https://overworldengine.com/en/react-three-fiber-game-state-management) ·
[R3F game performance](https://overworldengine.com/en/react-three-fiber-game-performance) ·
[R3F NPC interaction](https://overworldengine.com/en/react-three-fiber-npc-interaction) ·
[Type-safe game event bus](https://overworldengine.com/en/type-safe-event-bus-games-typescript)

Overworld Engine 是一个面向 TypeScript 的**模块化、跨平台 3D RPG 系统框架**，
基于 React 18、three.js（@react-three/fiber）与 zustand。同一套领域系统可交付到
Web、桌面、移动端、微信小游戏、Telegram Mini App 与 Node.js 服务端。

框架提供机制，不内置世界观和玩法内容。任务、对话、物品与成就保存为可校验数据；
游戏专属行为在应用层注册；跨系统事实通过类型化事件传播。

## 先判断它是否适合你

适合：

- 使用 TypeScript / React Three Fiber 构建内容驱动的 3D RPG。
- 希望任务、对话、背包、AI 和 UI 可以独立替换、测试与复用。
- 需要把同一套领域系统交付到 Web、桌面、移动端或小游戏。
- 接受在应用层显式装配系统，而不是依赖一个接管全局的引擎单例。

可能不适合：

- 需要开箱即用的关卡、美术资源、战斗数值或完整游戏模板。
- 项目不使用 TypeScript，或已有深度绑定 Unity / Unreal 的运行时。
- 只需要简单静态 3D 展示，不需要 RPG 状态机与跨平台系统。

## 三分钟体验

```bash
git clone https://github.com/luzhenqian/overworld.git
cd overworld
corepack enable
pnpm install
pnpm build
pnpm --filter starter dev
```

打开终端输出的地址。Starter 可以验收移动、对话、任务、背包、AI、小地图、
多标签页联机与场景编辑器；详细操作见
[Starter 指南](https://overworldengine.com/docs/starter)。

接入已有应用时，从[快速开始](https://overworldengine.com/docs)完成
“玩家移动 → 任务累计 → 奖励 → UI 事件”的最小闭环。

## 能力地图

| 领域 | 包与能力 |
| --- | --- |
| 基础 | `core`：EventBus、条件/效果注册表、持久化、存档、输入锁、种子 RNG |
| 世界 | `scene`、`environment`、`loading`、`minimap`：玩家、相机、碰撞、昼夜天气、资源与导航 |
| 玩法 | `dialogue`、`quest`、`inventory`、`achievements`、`tutorial` |
| AI 与联机 | `ai`、`net`、`relay`：寻路、行为树、presence、插值与预测对账 |
| 体验 | `input`、`audio`、`notifications`、`analytics`、`ui` |
| 平台 | `platform`、`adapters-weapp`、`adapters-steam`、`adapters-savefile` |
| 工具 | `devtools`、`editor`、`inspector`、`content`、`test-kit` |

完整定位、安装组合和公开 API 分别见[包选择指南](https://overworldengine.com/docs/package-selection)
与[包参考](https://overworldengine.com/docs/packages)。

## 设计哲学

1. **系统之间零依赖** —— 所有系统包只依赖 `@overworld-engine/core`。跨系统通信一律走类型化
   事件总线（`gameEvents`），例如玩家移动 → `player:moved` → 任务引擎自动推进“行走”目标。
2. **数据驱动 + 注册表** —— 对话/任务/成就的内容里只写声明式引用
   （`{ type: 'wallet.addGold', params: { amount: 100 } }`），游戏启动时注册对应处理函数。
   框架引擎永远不 import 游戏代码。
3. **内容注入，而非内容内置** —— 引擎都是工厂函数（`createQuestEngine({ quests, ... })`），
   框架包内零游戏内容。
4. **事件表可扩展** —— 游戏通过 declaration merging 把自己的玩法事件并入
   `OverworldEventMap`，享受同样的类型安全。

更完整的概念解释和机制选择表见[核心概念](https://overworldengine.com/docs/concepts)。

## 示例与交付模板

官方示例（均只用 `@overworld-engine/*` 公开 API）：

- [`examples/starter`](examples/starter) —— 村庄演示：移动/对话/任务/物品/成就/联机/编辑器/中英切换
- [`examples/dungeon`](examples/dungeon) —— 地牢探索：种子化程序地牢、行为树敌人、钥匙宝箱任务链、HPA* 引路（`?seed=N` 换地图）、调试面板（inspector）
- [`examples/scene-authoring`](examples/scene-authoring) —— 编辑→导出→校验→从 JSON 出图→重新导入的授权闭环
- [`examples/content-packs`](examples/content-packs) —— 内容包热更新（v2 对话/任务运行期注入）

配套服务器示例：[`examples/ws-server`](examples/ws-server)（联机中继）、
[`examples/authority-server`](examples/authority-server)（权威服务器 + 输入预测对账）。

多端模板位于 `examples/telegram-mini-app`、`examples/desktop-tauri`、
`examples/mobile-capacitor` 与 `examples/weapp-game`；交付边界见
[多端支持指南](docs/guides/platforms.md)。

## 文档

**文档站**（Fumadocs）：`pnpm docs:dev` 本地启动 —— 快速开始、架构（含 Mermaid 依赖图）、
指南、27 个包的参考页、中文全文搜索、`llms.txt`。源码在 [`apps/docs`](apps/docs)。

建议从文档站的[快速开始](https://overworldengine.com/docs)进入，再按目标查看
[核心概念](https://overworldengine.com/docs/concepts)、
[包选择指南](https://overworldengine.com/docs/package-selection)、
[兼容性矩阵](https://overworldengine.com/docs/compatibility)与
[排障手册](https://overworldengine.com/docs/troubleshooting)。

仓库内 Markdown 原文：

- [架构说明](docs/architecture.md)
- [设计文档](docs/specs/2026-07-16-overworld-framework-design.md)
- 指南:[多端支持](docs/guides/platforms.md) · [i18n 内容组织](docs/guides/i18n.md) · [资产组织与预加载](docs/guides/assets.md) · [测试指南](docs/guides/testing.md) · [持久化互操作](docs/guides/persistence-interop.md) · [内容热重载](docs/guides/content-hmr.md) · [内容包](docs/guides/content-packs.md) · [权威多人](docs/guides/authoritative-multiplayer.md) · [发布流程](docs/guides/releasing.md) · [签名与上架](docs/guides/signing-and-store.md) · [密集世界](docs/guides/dense-world.md)
- 各包 `README.md`

贡献前请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 技术栈与要求

React ^18、three >=0.160、@react-three/fiber ^8、@react-three/drei ^9、zustand ^5
（按各包的 `peerDependencies` 由游戏应用提供）。TypeScript strict，ESM only。

### 包管理器兼容性（npm / yarn / pnpm）

本仓库开发与 CI 使用 pnpm，但**发布产物是标准 npm 包**（ESM + `.d.ts`，
无 pnpm 特有字段或安装钩子），在 npm workspaces / yarn monorepo 中开箱即用：

- peer 依赖只有一层(react / three / @react-three/fiber / @react-three/drei /
  zustand），包与包之间通过 `dependencies` 正常声明，无深层 peer 链；
- npm v7+ 会自动安装 peer deps（v9+ 的解析更稳），在应用里显式声明上述
  五个 peer 即可，无需 `overrides` / `resolutions` 等特殊配置；
- 唯一通用要求：整个 monorepo 内 react / three / zustand 各自只有一份实例
  （npm workspaces 默认提升到根即可满足）。
