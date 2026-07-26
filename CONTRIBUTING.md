# Contributing to Overworld

感谢你参与 Overworld。修复 bug、补测试、改进文档、验证平台兼容性与提出可复现
的问题都属于有价值的贡献。

完整流程、架构边界、测试要求和 Changesets 规则请阅读：

- [在线贡献指南](https://overworldengine.com/docs/contributing)
- [仓库内文档源](apps/docs/content/docs/contributing.mdx)

## Quick start

```bash
corepack enable
pnpm install
pnpm build
pnpm typecheck
pnpm test
pnpm depcruise
pnpm docs:check
pnpm docs:build
```

涉及 `packages/*/src` 或适配器 Rust 实现的 PR 必须运行 `pnpm changeset`；
明确不发布的内部变化使用 `pnpm changeset --empty`。只改文档、测试、README
或示例通常不需要 changeset。

大型功能或公开 API 变化请先开 issue 讨论使用场景与边界。安全漏洞不要先公开
披露；优先使用 GitHub 仓库提供的私下安全报告渠道。
