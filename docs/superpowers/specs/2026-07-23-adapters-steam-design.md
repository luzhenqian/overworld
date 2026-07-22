# @overworld-engine/adapters-steam — 设计

日期：2026-07-23
状态：范围、架构定位、TS/Rust API 形状、降级策略、发布流程均已与需求方确认

## 背景

调研（见对话内 deep-research 报告，21 个信源、25 条结论经对抗式验证）确认：Steamworks
SDK 的各语言封装（`steamworks-rs`、`Facepunch.Steamworks`、`steamworks.js`/`Greenworks`）
和 CI depot 上传工具（`game-ci/steam-deploy`）都已经成熟，但**专门给 Tauri 用的 Steam 桥
基本是空白**——唯一的现成尝试 `tauri-plugin-hal-steamworks` 范围极窄（只有 Workshop+文件
系统）、0 star、2024-07 后停更。Godot（GodotSteam 作为 GDExtension 插件装到未改动引擎上）
和 Unreal（`OnlineSubsystemSteam` 作为可选动态加载模块）都是把 Steam 当**可插拔的外挂能力
层**而非引擎内置默认项，这与 Overworld `platform` + `adapters-weapp` 的既有架构哲学一致。

决定采用方案 A：不重新发明 Steamworks 封装，而是组合成熟积木（Rust 侧 `steamworks-rs`，
CI 侧文档化 `game-ci/steam-deploy`），在其上包一层薄的、Overworld 风格的适配器包。

## 1. 架构定位：不是新的 PlatformKind

`@overworld-engine/platform` 的 `PlatformBridge` 按 `PlatformKind`
（`web`/`telegram`/`tauri`/`capacitor`/`weapp`）分发，`weapp` 单独成一个 kind 是因为它是
完全不同的**运行时**（无浏览器，`wx` 全局、独立 canvas root）。Steam 不是运行时——一个
Steam 版本本质上仍是 Tauri 应用，`detectPlatform()` 依然返回 `'tauri'`。Steam 是叠加在
`tauri` kind 之上的**可选服务层**，与 `createTauriFileStorage()`（tauri kind 下的可选
存储升级）是同一种关系，而不是 `registerBridge('weapp', ...)` 那种整体换桥。

因此 `adapters-steam` **不注册新的 `PlatformKind`**，也不修改 `platform` 包；它提供的是
独立的、游戏代码显式调用的工厂函数。

## 2. 包结构与依赖边界

```
packages/adapters-steam/
  src/
    index.ts
    bridge.ts         # createSteamBridge()
    achievements.ts   # bridgeSteamAchievements() 胶水函数
    types.ts          # SteamBridge / SteamFlushableStorage 等类型
    __tests__/
  src-tauri/           # Rust crate，独立发 crates.io（暂定 crate 名 overworld-steam）
    Cargo.toml
    src/lib.rs
  README.md
  package.json          # @overworld-engine/adapters-steam
  tsup.config.ts
```

依赖边界：TS 侧 `dependencies` 只有 `@overworld-engine/core`（用其 `EventBus` /
`OverworldEventMap` 类型和 `EnumerableStorage` 形状），**不依赖 `platform`，不依赖
`achievements`**——`.dependency-cruiser.cjs` 的零跨包规则只对 `core` 开例外，`adapters-weapp`
对 `platform`/`input` 的依赖是历史遗留、已被明确记为"不推荐效仿"的例外。云存档返回对象
结构上兼容 `platform` 的 `FlushableStorage`（同样的 `getItem/setItem/removeItem/keys/flush`），
但类型在本包内自行声明，靠 TS 结构类型系统互相赋值，不产生真实的包依赖。

## 3. TS API 形状

```ts
// types.ts
export interface SteamFlushableStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
  keys(): string[]
  flush(): Promise<void>
}

// bridge.ts
export interface SteamBridgeOptions {
  /** 覆盖 App ID；省略时读 Rust 侧同目录的 steam_appid.txt（Steam 官方约定）。 */
  appId?: number
}

export interface SteamBridge {
  /** 同步标志位：SteamAPI_Init 是否成功。非 Steam 环境恒为 false。 */
  isAvailable(): boolean
  /** 发起一次初始化尝试（Tauri invoke 往返），resolve 为 isAvailable() 的结果。 */
  ready(): Promise<boolean>
  unlockAchievement(id: string): void
  clearAchievement(id: string): void
  setStat(name: string, value: number): void
  /** 不可用时返回 undefined，调用方自己决定 fallback（?? bridge.storage()）。 */
  cloudStorage(): SteamFlushableStorage | undefined
  setRichPresence(key: string, value: string): void
  clearRichPresence(): void
}

export function createSteamBridge(options?: SteamBridgeOptions): SteamBridge
```

```ts
// achievements.ts — 可选胶水，不强制引入 achievements 包
import { gameEvents, type EventBus, type OverworldEventMap } from '@overworld-engine/core'

export function bridgeSteamAchievements(
  steam: SteamBridge,
  bus: EventBus<OverworldEventMap> = gameEvents
): () => void {
  return bus.on('achievement:unlocked', ({ achievementId }) => {
    steam.unlockAchievement(achievementId)
  })
}
```

用法：

```ts
const steam = createSteamBridge()
await steam.ready()
bridgeSteamAchievements(steam)               // achievements 包解锁时自动转发给 Steam
const storage = steam.cloudStorage() ?? bridge.storage()   // 手动回退本地存档
persistOptions({ name: 'inventory', storage: () => storage })
```

`bridgeSteamAchievements` 只依赖 `core` 的 `EventBus` 类型和默认 `gameEvents` 单例，不
import `achievements` 包——游戏代码自己把两者接起来，`adapters-steam` 保持零耦合。

## 4. Rust 侧（`overworld-steam` crate）

```rust
// src-tauri/src/lib.rs
use tauri::plugin::{Builder, TauriPlugin};
use tauri::Runtime;

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("steam")
        .setup(|app, _api| {
            // SteamAPI_Init 在这里跑；失败只落到内部状态，
            // 不作为 setup 错误——没有 Steam 也必须能正常启动 Tauri app。
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            steam_is_available,
            steam_unlock_achievement,
            steam_clear_achievement,
            steam_set_stat,
            steam_store_stats,
            steam_cloud_read,
            steam_cloud_write,
            steam_cloud_delete,
            steam_cloud_list,
            steam_set_rich_presence,
            steam_clear_rich_presence,
        ])
        .build()
}
```

要点：

- **初始化失败不是错误**：`SteamAPI_Init` 失败（未从 Steam 客户端启动、`steam_appid.txt`
  缺失）时插件正常完成 `setup`，只标记内部状态不可用，对应 TS 侧 `isAvailable()` 恒 false
  的静默降级设计。
- **回调轮询**：`steamworks-rs` 要求定期调用 `SteamAPI_RunCallbacks`；插件内部起一个
  后台异步循环（复用 Tauri 的 async runtime），游戏代码不需要关心。
- **动态库分发**：`steamworks-rs` 的 redistributable（`steam_api64.dll` /
  `libsteam_api.so` / `libsteam_api.dylib`）必须与可执行文件同目录分发，不能静态链接。
  README 提供对应平台的 `tauri.conf.json` `bundle.resources` 配置片段。
- **命令返回值语义**：所有 `steam_*` 命令在"不可用"场景下返回 `Ok(false)` / `Ok(None)`
  而非 `Err`，TS 侧 `invoke()` 不会因为"没在 Steam 里跑"而抛异常，只在真正的 IPC/序列化
  错误时才 reject。

## 5. v1 能力范围

覆盖：初始化/可用性检测、成就（`unlockAchievement`/`clearAchievement`/`setStat`）、
云存档（`cloudStorage()`）、Rich Presence。

明确不做：Steam Overlay / 好友悬浮层（Tauri 依赖 WebView2，其跨进程渲染架构下 Overlay
的 D3D hook 机制失效，是已知的架构性限制，非工作量问题）、创意工坊、排行榜、匹配/大厅、
库存——这些留待后续按需评估。

## 6. 错误处理

- `unlockAchievement` / `clearAchievement` / `setStat` / `setRichPresence` /
  `clearRichPresence`：不可用时直接 return，不 `console.warn`（这些是高频调用，"没在
  Steam 里跑"是日常状态而非配置错误，warn 会刷屏）。
- `cloudStorage()`：不可用时同步返回 `undefined`，调用方用 `??` 自己接本地存储，不做
  隐式自动回退，保持行为可预测。
- `ready()`：唯一返回有意义状态的入口，供游戏代码做一次性 UX 判断（如提示"通过 Steam
  启动可解锁云存档"），适配器本身不替游戏做这个判断。

## 7. 测试策略

- TS 侧沿用仓库既有的纯逻辑测试风格（不用 testing-library）：mock `@tauri-apps/api` 的
  `invoke`（类似 `adapters-weapp` mock 全局 `wx` 的做法），断言不可用时各方法是 no-op、
  可用时参数透传正确；`bridgeSteamAchievements` 用 fake bus 断言 `emit` 后
  `unlockAchievement` 被正确调用。
- Rust 侧命令层是薄封装，真正的 SteamAPI 调用无法在 CI 里跑（需要真实 Steam 客户端 +
  已审核的 App ID）——记为已知测试盲区，靠手动 QA（用 Steam 官方测试 App ID `480`
  即 Spacewar，配真实 Steam 客户端跑 `desktop-tauri` 验证），不假装能自动化覆盖。

## 8. `examples/desktop-tauri` 接线

- `src-tauri/Cargo.toml` 加一条 path 依赖指向 `packages/adapters-steam/src-tauri`
  （monorepo 内联调试；crates.io 发布后是否切换到版本号依赖由 desktop-tauri 自行决定，
  本次不强制）。
- `src-tauri/src/lib.rs` 加 `.plugin(overworld_steam::init())`，无需开关——
  `isAvailable()` 在非 Steam 环境天然为 false，零配置成本。
- TS 侧在 `engines.ts`/`main.tsx` 里加
  `const steam = createSteamBridge(); await steam.ready(); bridgeSteamAchievements(steam)`，
  README 的"平台接线一览"表加一行 Steam。
- 验证目标是"接入路径通不通"（初始化、成就上报、云存档读写、Rich Presence），不追求
  真实过审上架——本地用测试 App ID 跑通即可。

## 9. 发布流程（两条独立流水线）

1. **npm 侧**：`@overworld-engine/adapters-steam` 走现有 changesets fixed version group
   （`@overworld-engine/*`），跟随 `release.yml`，无新增流程。
2. **crates.io 侧**：全新基础设施——新增 GitHub Actions workflow（如
   `publish-steam-crate.yml`），在 `packages/adapters-steam/src-tauri` 变更时
   `cargo publish`，需新申请 `CARGO_REGISTRY_TOKEN` secret。版本号**不**并入 changesets
   fixed group（Cargo 与 npm 是两套独立版本体系），手动在 `Cargo.toml` bump，按 crate
   自身语义版本走。这部分在实现计划里单列一个阶段，不阻塞 TS 侧包先落地。

## 已知风险 / 后续开放问题

- `overworld-steam` 这个 crate 名在 crates.io 上是否可用未核实，实现阶段需要先检查，
  被占用则需改名（如 `overworld-engine-steam`）。
- Steam Overlay 在 Tauri 下不可用是本设计的既定前提，不在 v1 范围内寻求变通方案；如果
  后续 Tauri 或 WebView2 上游修复了这个限制，可作为独立的后续评估。
- crates.io 发布流水线（第 9 节第 2 条）是本仓库第一条 Rust 发布链路，CI 密钥申请和
  流程搭建的具体操作细节留给实现计划阶段展开。
