# @overworld-engine/core

## 3.2.0

### Minor Changes

- f498069: **Feature:** crash-safe save-file primitives (`saveFiles`) — a
  business-agnostic "atomic file + rotating backups" layer for game saves:
  temp write → fsync → read-back verify → backup rotation → atomic rename,
  guarded by an integrity envelope (magic + length + SHA-256) that catches
  physical corruption. The layer carries no save-header business fields
  (schema_version, rng_roots, …) — the save format stays with the caller.

  `AtomicFileBackend` is a six-primitive interface
  (`writeFile`/`syncFile`/`renameFile`/`readFile`/`deleteFile`/`exists`)
  that core orchestrates but does not implement: desktop shells use
  `@overworld-engine/adapters-savefile`'s `createTauriSaveFileBackend()`
  (real `fsync`), web uses `@overworld-engine/platform`'s
  `createWebSaveFileBackend()` (`syncFile` is a no-op).
  `commitSlot(backend, path, bytes, { backupCount? })` keeps the
  crash-safety invariant that `path` always names a complete generation —
  `renameFile` is a single atomic operation, so an interrupted commit
  leaves the previous complete generation in place.
  `recoverSlot(backend, path, { isValid? })` walks
  `current → backup1 → backup2 → …` newest-to-oldest and returns the first
  generation that passes validation (optionally layered with a caller-side
  `isValid` check) plus the failure reason
  (`missing`/`envelope-invalid`/`validator-rejected`/`read-error`) for
  every generation it rejected. Low-level `wrapEnvelope`/`unwrapEnvelope`/
  `bytesEqual` helpers are exported for custom integrity schemes. See
  `docs/superpowers/specs/2026-07-24-save-hardening-design.md`.
- bb73ebf: **Feature:** `createSeededRng`/`RngSource` in `@overworld-engine/core` — a
  small, dependency-free deterministic PRNG (mulberry32) any factory function
  can accept as an injectable randomness source, so production code can pass
  `{ next: Math.random }` and tests can pass a fixed seed for byte-identical,
  reproducible results.

  **New package:** `@overworld-engine/test-kit` — app-layer integration-test
  primitives for Overworld games: `createEventRecorder` (deterministic
  event-stream recording for assertions, built on `core`'s `EventBus.onAny`)
  and `renderHook` (mounts a single React hook via `react-test-renderer`, no
  DOM/Canvas/WebGL, to prove hook-to-action wiring is correct). Not a
  rendering/E2E framework — see
  `docs/superpowers/specs/2026-07-25-test-kit-design.md` for the design and
  scope boundaries.

## 3.1.0

### Patch Changes

- No changes in this package — version bumped in lockstep with the
  `@overworld-engine/*` fixed release group (headline: new
  `@overworld-engine/adapters-steam` package).

## 3.0.0

### Patch Changes

- No changes in this package — version bumped in lockstep with the
  `@overworld-engine/*` fixed release group (headline: `@overworld-engine/ui`
  3.0 — breaking `Modal` compound-component rewrite and `Slot` →
  `InventorySlot` rename, new `asChild` primitive).

## 2.4.1

### Patch Changes

- No changes in this package — version bumped in lockstep with the
  `@overworld-engine/*` fixed release group (headline:
  `@overworld-engine/ui` hextech button-shape cleanup).

## 2.4.0

### Patch Changes

- No changes in this package — version bumped in lockstep with the
  `@overworld-engine/*` fixed release group (headline:
  `@overworld-engine/ui` navigation HUD — MinimapFrame/Compass/
  WaypointIndicator — plus the opt-in `/focus` spatial-navigation subpath).

## 2.3.0

### Patch Changes

- No changes in this package — version bumped in lockstep with the
  `@overworld-engine/*` fixed release group (headline:
  `@overworld-engine/ui` combat HUD — CastBar/BuffBar/TargetFrame/
  Nameplate).

## 2.2.0

### Patch Changes

- No changes in this package — version bumped in lockstep with the
  `@overworld-engine/*` fixed release group (headline: new
  `@overworld-engine/ui` headless game-UI package).

## 2.1.0

### Patch Changes

- No changes in this package — version bumped in lockstep with the
  `@overworld-engine/*` fixed release group (headline: world-production
  v2.1 quality pass across `scene`/`environment`/`loading`/`minimap`).

## 2.0.0

### Minor Changes

- c54c045: Add a headless, framework-agnostic `inputLock` (`acquire`/`release`/
  `isLocked`/`activeLocks`/`subscribe`/`releaseAll`) plus `createInputLock()`
  for isolated instances, and the `input:lock-changed` bus event. This is the
  single source of truth that `input` (keyboard layers, joystick) and `scene`
  (`Player`, interaction, `FollowCamera` orbit) now consult so one
  `inputLock.acquire('dialogue')` suspends gameplay input everywhere without
  per-source wiring.

## 1.5.0

### Minor Changes

- v1.5 规模化授权与实时调试:编辑器多场景/关卡管理(命名场景增删改切、`exportProject`/`importProject`、devtools `validateSceneProject`、scene `pickScene`);新包 `@overworld-engine/inspector`(`createEventStream` + `<EventBusInspector>`/`<StoreInspector>` 开发覆盖层);新包 `@overworld-engine/content`(`defineContentPack`/`validateContentPack`/`applyContentPack` 内容包热更新)+ core `defineMigrations` 存档迁移。

## 1.4.0

### Minor Changes

- v1.4 授权闭环与出包硬化:编辑器 ↔SceneShell 场景往返(scene `SceneFromJson` + 纯映射器、devtools `sceneConfigSchema`/`validateScene`、editor `sceneConfigToEditorEntities`),examples/scene-authoring 演示 edit→export→validate→render→re-import;跨端云端命名存档槽位(`FlushableStorage.flush()`、`createSaveSlots` over Telegram CloudStorage、Tauri 文件存储 flush);发布签名与商店上架脚手架 + 指南(build-artifacts.yml 无 secrets 时 skip 不 fail)。

## 1.3.0

### Minor Changes

- v1.3 原生交互与出包:微信小游戏 R3F 指针/raycast 拾取 + useGLTF(wx.request XHR polyfill);Telegram CloudStorage 云存档适配器(透明键编码,冒号键可直接接入);Tauri/Capacitor CI 出包矩阵;pnpm action-setup 与 packageManager 冲突修复。

## 1.2.0

### Minor Changes

- v1.2 确定性与联机基建(响应首个生产消费方需求):全家桶可注入 clock/scheduler(重放全等);@overworld-engine/relay 正式中继包 + 线路协议规范;权威多人接入指南;DOM 组件 data-testid 与官方测试指南;editor 文案覆写;持久化互操作指南。

## 1.1.0

### Minor Changes

- v1.1 多端支持:platform 平台桥与 adapters-weapp 微信适配层(新包);微信小游戏完整 3D;audio 后端注入与 pauseOnHide;scene SpriteLabel 跨端标签;telegram/tauri/capacitor/weapp 四个端模板。

## 1.0.0

### Major Changes

- d704018: 1.0.0 — first public release: 18-package modular web 3D RPG framework (typed event bus, registries, headless engines, 3D scene layer, AI/pathfinding/behavior trees, multiplayer sync, in-game editor, devtools). API frozen after the v0.9 review; 677 tests + 49-step E2E green.
