# Overworld documentation

The public documentation site for Overworld, built with Next.js and Fumadocs.
Its content is derived from the published package entry points, executable
examples, tests, and package manifests in this repository.

## Local development

From the repository root:

```bash
corepack enable
pnpm install
pnpm docs:dev
```

Use the exact local URL printed by Next.js.

## Required checks

```bash
pnpm docs:check
pnpm docs:build
```

`docs:check` validates TypeScript/MDX and runs the content consistency guard.
The guard verifies that:

- every package under `packages/*` has a reference page;
- every public runtime export from `packages/*/src/index.ts` is discoverable on
  its package page; and
- internal `/docs/*` links resolve to a content route.

The documentation CI job is required, not advisory.

## Content map

| Path | Purpose |
| --- | --- |
| `content/docs/index.mdx` | Quick start |
| `content/docs/architecture.mdx` | Package boundaries and runtime model |
| `content/docs/packages/*.mdx` | Public package references |
| `content/docs/guides/*.mdx` | Task-oriented production guides |
| `content/docs/compatibility.mdx` | Peer and platform support matrix |
| `content/docs/migration.mdx` | Major-version migration notes |
| `content/docs/troubleshooting.mdx` | Symptom-driven diagnostics |
| `content/docs/contributing.mdx` | Contributor workflow |

When a public API changes, update its package README, its site reference page,
the relevant guide or migration page, and the changeset where applicable.
Examples must import only from public package entry points.
