# 发布流程

Overworld 使用 [Changesets](https://github.com/changesets/changesets) 管理版本与 npm 发布。
所有 `@overworld-engine/*` 包配置为 **fixed 版本组**,始终以同一版本号一起发布(锁步版本)。

## 日常流程

### 1. 提交改动时添加 changeset

在包含面向用户改动的 PR 中,运行:

```bash
pnpm changeset
```

按提示选择受影响的包和 bump 级别(patch / minor / major),并写一句变更摘要。
命令会在 `.changeset/` 下生成一个 markdown 文件,随 PR 一起提交。
由于所有包在同一个 fixed 组里,选任意一个包即可 —— 发版时全部包会一起 bump 到同一版本。

内部改动(重构、测试、文档)不需要 changeset。

### 2. Version PR(自动)

PR 合入 `main` 后,`.github/workflows/release.yml` 中的 `changesets/action` 会自动创建
(或更新)一个名为 "chore: release packages" 的 **Version PR**,内容包括:

- 消费 `.changeset/*.md`,按最高 bump 级别更新所有 `@overworld-engine/*` 包的版本号
- 生成 / 更新各包的 `CHANGELOG.md`

多个 changeset 会在该 PR 中累积,直到你决定发版。

### 3. 发布到 npm(合并 Version PR)

合并 Version PR 后,同一 workflow 会执行:

```bash
pnpm release   # = pnpm -r --filter './packages/*' build && changeset publish
```

构建全部包并将新版本发布到 npm(`access: public`),同时打上 git tag。

## 前置条件:NPM_TOKEN

在 GitHub 仓库 **Settings → Secrets and variables → Actions** 中添加名为 `NPM_TOKEN`
的 secret,值为 npm 的 **Automation** 类型 access token(需要对 `@overworld` 组织有
publish 权限)。首次发布前需在 npmjs.com 上创建 `overworld` organization。

## 本地手动操作

```bash
pnpm changeset          # 添加 changeset
pnpm changeset status   # 查看待发布的 bump
pnpm version-packages   # 本地消费 changeset、更新版本号(一般交给 CI)
pnpm release            # 构建并发布(一般交给 CI)
```

## fixed 版本组说明

`.changeset/config.json` 中 `"fixed": [["@overworld-engine/*"]]` 使全部框架包版本永远一致,
用户可以放心地把所有 `@overworld-engine/*` 依赖固定在同一版本。私有应用与示例
(`starter`、`dungeon`、`ws-server`、`authority-server`、`docs`、`benchmarks`)在
`ignore` 列表中,永不发布。
