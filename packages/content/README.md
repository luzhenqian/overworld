# @overworld-engine/content

Content packs for Overworld: **validate-then-apply** versioned bundles of
dialogues, quests, items and achievements into live engines — plus a small
tracker for version discipline. Builds directly on the hot-reload convention in
[`docs/guides/content-hmr.md`](../../docs/guides/content-hmr.md): the engines
already upsert content by id, this package packages, validates and ships those
updates as a unit.

Only depends on `@overworld-engine/core` and `@overworld-engine/devtools`. The
engine packages are **not** imported — targets are passed in as structural
arguments, so this package stays out of your engine dependency graph and is
testable with plain fakes.

## ContentPack

A `ContentPack` is pure data: an `id`, a numeric `version`, and any subset of the
four content sections. The section types are the structural `*Like` subsets from
devtools, so your real `DialogueTree` / `QuestDefinition` / `ItemDefinition` /
`AchievementDefinition` arrays are assignable as-is.

```ts
import { defineContentPack } from '@overworld-engine/content'

export const townPack = defineContentPack({
  id: 'town',
  version: 1,
  dialogues: [{ id: 'elder-intro', startNodeId: 'hello', nodes: [/* … */] }],
  quests: [{ id: 'welcome', objectives: [{ id: 'talk', target: 1 }] }],
  items: [{ id: 'coin', name: 'Coin' }],
  achievements: [{ id: 'first', trigger: null }],
})
```

`defineContentPack(pack)` is an identity function — it returns the exact object,
only anchoring type inference for editor autocomplete.

## validateContentPack

```ts
import { validateContentPack } from '@overworld-engine/content'

const report = validateContentPack(townPack, {
  effectTypes: effects.types(),      // optional: flag unknown effect refs (warnings)
  conditionTypes: conditions.types(),
})
report.ok // false only when there are errors; warnings never fail
```

Checks pack metadata (`id` non-empty string, `version` finite number) and
delegates every section to devtools' `validateContent`, inheriting all its
per-section and cross-section rules (e.g. dialogue `quest.start` effects must
reference a quest in the same pack). Pure and non-throwing.

## applyContentPack

```ts
import { applyContentPack } from '@overworld-engine/content'

const result = applyContentPack(townPack, {
  dialogue,      // from createDialogueEngine
  quest: quests, // from createQuestEngine
  inventory,     // from createInventory
  achievements,  // from createAchievements
}, { effectTypes: effects.types(), conditionTypes: conditions.types() })

result.ok      // false when validation failed (nothing applied)
result.applied // e.g. ['dialogues', 'quests', 'items', 'achievements']
result.report  // the validation report (surface warnings)
```

Validates first (unless `{ validate: false }`) and **refuses** — registering
nothing — when the report has errors. Otherwise it registers each present
section on its matching target, respecting the engines' two calling conventions:

| section | target | call |
| --- | --- | --- |
| `dialogues` | `dialogue` | `registerDialogues(...trees)` — rest params |
| `quests` | `quest` | `registerQuests(...quests)` — rest params |
| `items` | `inventory` | `registerItems(items)` — array |
| `achievements` | `achievements` | `registerAchievements(defs)` — array |

A section is applied only when the pack carries it **and** a target is provided.
Registration is additive/upsert-by-id and never removes, so applying an updated
pack hot-swaps definitions without discarding in-progress runtime state.

### Hot-update flow

`applyContentPack` is the packaged form of the manual `registerX` gate in
[content-hmr](../../docs/guides/content-hmr.md): fetch an updated pack (bundled
JSON, remote endpoint, `import.meta.hot`), hand it to `applyContentPack`, and a
new quest + dialogue appear live — invalid content is rejected before it reaches
an engine. See `examples/content-packs` for a runnable "热更新 v2" demo.

## createContentPackTracker (MVP)

```ts
import { createContentPackTracker } from '@overworld-engine/content'

const tracker = createContentPackTracker()
tracker.record(townPack)               // records town@1
tracker.record({ id: 'town', version: 2 })  // upgrade → silent
tracker.record({ id: 'town', version: 1 })  // warns: downgrade 2 → 1
tracker.applied                        // { town: 1 }
```

Minimal in-memory bookkeeping: last applied version per id, with a warning when
a pack is re-applied at a **lower** version (a stale/out-of-order push). It does
not persist or gate applies — pair it with `applyContentPack` at your update
site if you want to act on the warning.

## Save migrations

Content packs evolve definitions; **saves** persist progress. When a pack change
alters the meaning of persisted state (renamed ids, reshaped fields), migrate old
saves with `defineMigrations` + `persistOptions` from `@overworld-engine/core` —
see the core package docs.
