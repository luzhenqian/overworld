# Overworld · Tauri 2 桌面模板(macOS + Windows)

把 [starter](../starter) 的玩法裁剪版装进 Tauri 2 壳:同一份 web 构建,
产出原生 .app/.dmg(macOS)与 .msi/.exe(Windows),并演示
`createTauriFileStorage()` 的**文件存档**与异步引导模式。

保留玩法:场景 + 玩家移动 + 任务链(含持久化存档)+ 对话 + 背包 + HUD。
相比 starter 裁剪掉:i18n(文案内联中文)、场景编辑器、跨标签页联机、AI 村民、
成就、昼夜循环、小地图。

## 平台接线一览

| 能力 | 用法 |
|---|---|
| 平台检测 | `detectPlatform()` → 壳内为 `'tauri'`(识别 `__TAURI_INTERNALS__`),浏览器直开为 `'web'` |
| 生命周期 | `createBridge().bindLifecycle(gameEvents)`:失焦/关窗 → `app:paused/resumed` |
| 文件存档 | `await createTauriFileStorage()` → 应用数据目录里的 `overworld-save.json`(见下"异步引导") |
| 画质 | `useQualityStore.setPreset(recommendedQualityPreset())`(桌面通常 high) |
| 触控 | `shouldShowTouchControls()` 桌面为 false,摇杆不挂载 |
| 外链 | `bridge.openExternal()` 走 shell 插件(系统默认浏览器) |
| Steam | `createSteamBridge()` + `bridgeSteamAchievements()`(`@overworld-engine/adapters-steam`);非 Steam 环境自动降级为 no-op,见该包 README |

### 异步引导模式(src/main.tsx)

文件存储要先于持久化引擎就绪,所以启动顺序是:

```ts
const storage = platform === 'tauri' ? await createTauriFileStorage() : bridge.storage()
setSaveStorage(storage)                  // 放进 src/game/save-storage.ts 的装配点
const { default: App } = await import('./App')   // 引擎装配在这之后才求值
```

`engines.ts` 里任务引擎用 `persist: { storage: () => getSaveStorage() }` 消费它。
浏览器直开时自动回退 localStorage,同一份代码两种存档介质。

## 前置工具

- Node.js ≥ 20、pnpm ≥ 9(仓库根目录 `pnpm install` 已装好 JS 依赖)
- **Rust 工具链**(必须):`curl https://sh.rustup.rs -sSf | sh`,验证 `cargo --version`
- macOS:Xcode Command Line Tools(`xcode-select --install`)
- Windows:Microsoft C++ Build Tools + WebView2 Runtime(Win11 自带)

## 从零到出包

```bash
# 仓库根目录
pnpm install
pnpm build                 # 构建 workspace 内的 @overworld-engine/* 包

cd examples/desktop-tauri
pnpm dev                   # 纯浏览器调玩法(不起壳、不需要 Rust)
pnpm tauri:dev             # 起原生窗口开发(热重载,首次编译 Rust 较久)
pnpm tauri:build           # 出包(release)
```

产物位置(macOS,Apple Silicon 示例):

- `src-tauri/target/release/bundle/macos/Overworld Desktop.app`
- `src-tauri/target/release/bundle/dmg/Overworld Desktop_1.0.0_aarch64.dmg`

Windows 上执行同一条 `pnpm tauri:build` 产 `.msi`(WiX)与 `.exe`(NSIS),
位于 `src-tauri/target/release/bundle/msi|nsis/`。跨平台出包请在对应系统
(或 CI 矩阵)上构建,Tauri 不支持从 macOS 交叉打 Windows 包。

### 存档位置

`createTauriFileStorage()` 默认写 `$APPDATA/overworld-save.json`:

- macOS:`~/Library/Application Support/com.overworld.desktop/`
- Windows:`%APPDATA%\com.overworld.desktop\`

对应的最小权限在 `src-tauri/capabilities/default.json`
(fs 只授予 appdata 目录的递归读/写/元信息,shell 只授予 `open`)。

### 图标

`src-tauri/icons/` 已提交(由 `apps/docs/app/icon.svg` 生成)。
替换图标:准备一张 1024×1024 PNG 后执行

```bash
pnpm tauri icon path/to/icon-1024.png
```

## 与 web 版的差异点

- **存档**:文件存档(上表),不再依赖 WebView 的 localStorage 生命周期;
  备份/云同步可以直接同步这个 JSON 文件。
- **窗口**:1280×800 起步、最小 960×600(`src-tauri/tauri.conf.json`);
  Cmd+Q/关窗即退出,关窗前会收到 `app:paused`。
- **无浏览器 UI**:没有地址栏/刷新,路由与刷新逻辑不要依赖浏览器行为。
- **外链**:必须走 `bridge.openExternal()`(shell 插件),`window.open` 在壳内
  行为不可靠。

## 上架/分发注意事项

- **macOS 签名与公证**:分发到 Gatekeeper 之外需要 Developer ID 证书:
  `tauri.conf.json > bundle > macOS > signingIdentity` 配证书,构建后用
  `xcrun notarytool submit` 公证 dmg(Apple Developer 账号,99 USD/年)。
  未签名的包用户需右键-打开绕过 Gatekeeper。
- **Windows 签名**:无代码签名证书时 SmartScreen 会拦;EV/OV 证书 +
  `bundle > windows > certificateThumbprint` 配置。
- **自动更新**:用官方 `tauri-plugin-updater`(需要为更新包签名、托管
  latest.json 清单),本模板未内置,接入步骤见 Tauri 官方 updater 指南。
- **Mac App Store**:需要额外的 entitlements 与沙箱配置,和 Developer ID
  分发是两条链路,勿混用同一份配置。
