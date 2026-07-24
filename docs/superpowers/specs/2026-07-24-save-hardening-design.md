# 存档硬化底层原语（REQ-003 第1条）— 设计

日期：2026-07-24
状态：范围、包结构、TS/Rust API 形状、崩溃安全协议、测试策略均已与需求方（Noah）确认

## 背景

《灵妖西行》REQ-003（`/Users/noah/Work/idea/灵妖西行/client/requirements/REQ-003-save-hardening.md`）
最初要求 `core` 提供完整存档文件原语（原子写 + 备份轮换 + 校验和头部 + 恢复 API）。文档末尾
「状态更新（2026-07-23，M6 后）」澄清：对方已在 `client/src/kernel/save/` 自建完整 manager
层（槽位/轮换/恢复/迁移/自动调度，对应需求第 2、3 条的游戏侧语义），平台后端走他们自己的
`SaveBackend` 原语接口（web localStorage + Tauri plugin-fs 双实现）。**仍需 Overworld 交付的
只有第 1 条：底层存储原语硬化**（fsync/原子重命名的跨平台保证、写盘压测证据），经他们的
`SaveBackend` 接口接入，manager 层不动。

因此本设计的范围明确收窄为：一个与业务语义无关的、通用的「原子文件 + 轮换备份」原语。
**不做**：存档头部业务字段（schema_version/save_generation/rng_roots 等）、自动存档链语义、
存档 UI——这些已由对方实现。

现状核实：
- `core` 的 `persistOptions`/`createSaveSlots`（`packages/core/src/persist.ts`、`saveSlots.ts`）
  是纯 KV 层实时持久化 + JSON 快照拷贝，`checksum|fsync|atomic|rename|backup` 在 `core` 里
  零真实命中。
- `platform` 的 `createTauriFileStorage()`（`packages/platform/src/bridge.ts:660-730`）对整个
  文件做直接 `writeTextFile` 覆写，无临时文件、无 fsync、无读回校验、无原子替换、无备份。
- `@tauri-apps/plugin-fs@2.5.1` 的 JS API 有 `rename`（可原子替换已存在的目标文件），但**不
  暴露任何 fsync/flush 原语**——要做到真正的落盘保证，只能新增 Rust 端 Tauri 命令。

## 1. 范围与非目标

**范围**：`core` 内的通用原子文件原语（`AtomicFileBackend` 接口 + 编排逻辑）+ 两个后端实现
（Tauri、Web/localStorage）。

**非目标**：
- 存档头部业务 schema（schema_version/save_generation/rng_roots/payload_checksum 等字段）——
  已由 `client/src/kernel/save/` 实现，我们的原语只处理不透明字节。
- 自动存档链、多槽位管理、存档迁移——已由对方 manager 层实现。
- 真实进程级 `kill -9` 压测脚本——本轮用故障注入单测等价覆盖（见「测试策略」），真实压测
  脚本作为后续按需交付的独立验收演示，不在本轮范围。

## 2. 包结构

```
packages/core/src/saveFiles/
  types.ts        # AtomicFileBackend 接口
  envelope.ts      # 内部信封：length + SHA-256 + payload
  commitSlot.ts     # 写入协议编排
  recoverSlot.ts    # 恢复协议编排
  __tests__/
    faultInjection.ts   # 可配置中断点的假 AtomicFileBackend
    commitSlot.test.ts
    recoverSlot.test.ts

packages/adapters-savefile/     # 新增独立包，镜像 adapters-steam 的结构
  src/
    index.ts
    tauriBackend.ts   # createTauriSaveFileBackend(): AtomicFileBackend
    __tests__/
  src-tauri/            # Rust crate，独立发布（crate 名待核实，暂定 overworld-savefile）
    Cargo.toml
    src/lib.rs
  README.md
  package.json           # @overworld-engine/adapters-savefile

packages/platform/src/webSaveFileBackend.ts   # createWebSaveFileBackend(): AtomicFileBackend
```

**与 REQ-003 建议落点的一处偏离，及理由**：文档建议桌面后端放进「`platform` 的 tauri
桥」。但 `platform` 包目前完全不含 Rust 代码——`createTauriFileStorage()` 只是动态 import
官方 `@tauri-apps/plugin-fs` 的 JS API，没有自定义 Tauri 插件。而 fsync 必须走新的 Rust
命令，这意味着必然要新增一个 Rust crate。仓库里已有的先例是 `adapters-steam`：凡是需要
自定义 Rust 插件的能力，都独立成 `packages/adapters-*` 包，`platform` 保持 Rust-free、
零跨包依赖。为了与既有架构保持一致，Tauri 后端落在新的 `packages/adapters-savefile`，
而不是 `platform` 内部。Web/localStorage 后端不涉及 Rust，符合 `platform` 现有定位，
放在 `platform` 里。

`core/saveFiles` 不依赖 `platform` 或 `adapters-savefile`——只依赖注入进来的
`AtomicFileBackend` 接口，符合仓库零跨包导入的约定。

## 3. `AtomicFileBackend` 接口（`core/src/saveFiles/types.ts`）

```ts
export interface AtomicFileBackend {
  /** 创建或整体覆写一个文件。不保证落盘，需配合 syncFile。 */
  writeFile(path: string, bytes: Uint8Array): Promise<void>
  /** 确保 path 已写入的内容落盘（fsync）。 */
  syncFile(path: string): Promise<void>
  /** 原子替换：若 to 已存在则整体替换，不产生半份文件。 */
  renameFile(from: string, to: string): Promise<void>
  /** 不存在返回 null，不抛错。 */
  readFile(path: string): Promise<Uint8Array | null>
  /** 不存在时是 no-op。 */
  deleteFile(path: string): Promise<void>
  exists(path: string): Promise<boolean>
}
```

五个方法都是无业务语义的通用文件原语，可复用于任何需要硬化写入的场景，不局限于存档。

## 4. 信封格式（`envelope.ts`）

我们自己的物理完整性校验，与对方 manager 层的业务级 `payload_checksum` 是两个独立层次
（我们答不了「这份存档业务上是否合法」，只答「这份文件磁盘上是否完整未截断」）：

```
[4B magic "OWSF"][1B format version][4B payload length (LE u32)][32B SHA-256(payload)][payload bytes]
```

`wrapEnvelope(bytes): Uint8Array` / `unwrapEnvelope(raw): Uint8Array | null`（magic 不匹配、
长度不符、SHA-256 不一致，任一失败返回 `null`，不抛错——调用方视为「这一代不可用」，走
下一代恢复）。

## 5. 写入协议：`commitSlot(backend, slotId, bytes, opts)`

路径命名（`opts.dir` 前缀 + `slotId`）：`<slotId>`（当前）、`<slotId>.bak1`、`<slotId>.bak2`
（`opts.backupCount` 默认 2，对应 REQ 的「当前文件+2 份轮换备份」）、`<slotId>.tmp`（写入
过程中的临时文件）。

```
1. envelope = wrapEnvelope(bytes)
2. backend.writeFile(tmp, envelope)
3. backend.syncFile(tmp)                          # fsync
4. readBack = backend.readFile(tmp)
   readBack 与 envelope 逐字节不相等 → 抛错，不触碰 current/backup（本次提交中止，
   旧数据完好，tmp 留作下次覆写或清理）
5. 按「从旧到新」轮换（顺序是崩溃安全的关键）：
   a. if exists(backup1): renameFile(backup1, backup2)   # 覆盖最老一代
   b. if exists(current): renameFile(current, backup1)
   c. renameFile(tmp, current)
```

**崩溃安全不变式**：`renameFile` 在文件系统层是单一原子操作（要么完全发生要么完全没
发生，不存在半份文件的中间态）。因此上述 5 步中的任意一步被强杀中断后，`current` 永远
指向「上一个完整代」或「新的完整代」之一；`backup1`/`backup2` 永远是某个曾经完整写入
过的历史代（因为只有已经通过步骤 2-4 验证的文件才会被 rename 进 backup 位，backup 位
自身从不被直接写入）。POSIX 下额外对父目录做一次 fsync（rename 的目录项更新也需要落盘
才能扛住真正的断电，而不只是进程被杀）；Windows 跳过（NTFS 的元数据落盘机制不同，
`rename` 尚未 flush 时进程崩溃不会产生半份文件，但断电场景的行为由 NTFS 日志保证，无需
应用层介入）。

## 6. 恢复协议：`recoverSlot(backend, slotId, opts)`

```ts
export interface RecoverResult {
  bytes: Uint8Array
  source: 'current' | 'backup1' | 'backup2'
}

export interface RecoverFailure {
  path: string
  reason: 'missing' | 'envelope-invalid' | 'validator-rejected'
}

export async function recoverSlot(
  backend: AtomicFileBackend,
  slotId: string,
  opts?: { dir?: string; backupCount?: number; isValid?: (bytes: Uint8Array) => boolean }
): Promise<{ result: RecoverResult; failures: RecoverFailure[] } | { result: null; failures: RecoverFailure[] }>
```

按 `current → backup1 → backup2` 顺序尝试：不存在记 `missing`；存在则 `unwrapEnvelope`，
失败记 `envelope-invalid`；成功后若调用方传了 `isValid`（对方 manager 层会传自己的业务
checksum 校验），未通过记 `validator-rejected`；第一个全部通过的即返回，连同此前所有失败
记录（供对方按文档要求在主菜单展示恢复来源）。全部失败则 `result: null`，`failures` 包含
三代的完整失败原因。

## 7. Tauri 后端（`packages/adapters-savefile`）

TS 侧 `createTauriSaveFileBackend(options?: { dir?: string }): AtomicFileBackend`，直接
`invoke` 五个 Rust 命令，路径都相对 `BaseDirectory::AppData`。

Rust 侧命令：`savefile_write`、`savefile_sync`、`savefile_rename`、`savefile_read`、
`savefile_delete`、`savefile_exists`——都是 `std::fs` 的薄封装（`File::sync_all()` 对应
`syncFile`；`fs::rename` 对应 `renameFile`，Tauri/Rust 标准库在 Windows 上用
`MoveFileExW(MOVEFILE_REPLACE_EXISTING)` 语义，同卷内替换已是操作系统级原子操作）。
`renameFile` 命令额外负责 POSIX 下的父目录 fsync。插件结构（`Builder::new().invoke_handler(...)`)
镜像 `adapters-steam` 的 `src-tauri/src/lib.rs` 写法，同样独立发 crates.io，走 REQ-002 已
搭好的 `publish-steam-crate.yml` 模式复制一份。

## 8. Web 后端（`packages/platform/src/webSaveFileBackend.ts`）

`createWebSaveFileBackend(options?: { prefix?: string }): AtomicFileBackend`，基于
`localStorage`：`writeFile`/`readFile`/`deleteFile`/`exists` 直接映射
`setItem`/`getItem`/`removeItem`/`in`；`syncFile` 是 no-op。`renameFile` 用
`getItem(from) → setItem(to, value) → removeItem(from)` 模拟（非跨调用原子，但 JS 单
线程下同步语句序列不会被同页面的卸载中断打断，且我们的轮换顺序永远是「先把内容复制到
新位置，再清理旧位置」，中途中断的最坏情况是遗留一份无害的重复副本，不会破坏
「current 永远指向完整一代」的不变式）。README 明确标注 `syncFile` 为 best-effort、
无真实 fsync 语义，因为浏览器场景没有与「进程被强杀」对等的风险模型。

## 9. 测试策略

`core/src/saveFiles/__tests__/faultInjection.ts` 提供一个可配置中断点的假
`AtomicFileBackend`：每个方法可配置「第 N 次调用时抛错」。测试遍历 `commitSlot` 内部
每一个中断点（`writeFile` 前/中断、`syncFile` 中断、读回不一致、每一次 `renameFile`
中断），断言中断后 `recoverSlot` 总能拿到一份 `source` 为 `current`/`backup1`/`backup2`
之一的有效数据——这在语义上等价于文档验收标准要求的「连续强制终止写盘 1000 次」，但
确定性、进 CI、跑得快（1000 次强杀在统计上覆盖的中断点集合是有限的，遍历所有中断点 ×
若干轮随机顺序即等价覆盖）。

真实进程级 `kill -9` 压测脚本（更贴合文档「演示」字面要求）不在本轮范围，记为后续
交付项——需要时另起一个独立的 Node/Tauri 小工具，子进程循环写盘 + 随机时机强杀，
产出可以直接甩给对方的「1000 次幸存」证据。

Rust 侧命令层是 `std::fs` 薄封装，逻辑简单到不需要额外测试；`renameFile` 的父目录
fsync 分支（POSIX vs Windows）用 `#[cfg(unix)]` 条件编译，人工在两个平台各跑一次
`commitSlot` 集成用例即可，不假装能在 CI 里自动跑通「真断电」场景。

## 已知风险 / 后续开放问题

- `overworld-savefile` crate 名在 crates.io 上是否可用未核实，实现阶段需先检查，
  被占用则改名（如 `overworld-engine-savefile`）。
- 真实 kill -9 压测脚本、以及父目录 fsync 在各平台文件系统（尤其网络盘/云同步目录，如
  用户把 AppData 放在 OneDrive 同步路径下）上的实际行为，都是已知的测试盲区，靠手动
  验证，不在本轮自动化范围内。
- `backupCount` 目前设计为 `commitSlot`/`recoverSlot` 的调用参数（默认 2），不是写死
  常量，如果对方后续想要 3 手动槽之外的检查点槽用不同的备份数量，不需要改接口。
