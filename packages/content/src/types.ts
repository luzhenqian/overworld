import type {
  AchievementLike,
  ContentValidationOptions,
  DialogueTreeLike,
  ItemLike,
  QuestLike,
  ValidationReport,
} from '@overworld-engine/devtools'

/**
 * A versioned bundle of pure content — dialogues, quests, items, achievements —
 * that can be validated as a unit and applied into live engines at runtime.
 *
 * The section types are the **structural** `*Like` subsets re-used from
 * `@overworld-engine/devtools`, so the engine packages are never imported here.
 * The real content types (`DialogueTree`, `QuestDefinition`, `ItemDefinition`,
 * `AchievementDefinition`) are directly assignable to these — author a pack with
 * your real content arrays as-is.
 *
 * Every section is optional; a pack may carry any subset. `id` names the pack
 * for tracking/distribution; `version` orders releases of the same `id`.
 */
export interface ContentPack {
  /** Stable identifier for this pack across versions (e.g. `'town'`). */
  id: string
  /** Monotonic release number; compared by {@link ContentPackTracker}. */
  version: number
  dialogues?: DialogueTreeLike[]
  quests?: QuestLike[]
  items?: ItemLike[]
  achievements?: AchievementLike[]
}

/**
 * Live engines a pack is applied into. Each is a **structural** subset of the
 * corresponding engine object returned by `create*` — only the `registerX`
 * entry point is required, so the real engines are assignable as-is and the
 * engine packages stay out of this package's dependency graph.
 *
 * Note the two calling conventions, mirrored from the engines:
 * quest / dialogue take **rest params**, inventory / achievements take an
 * **array** (see `docs/guides/content-hmr.md`).
 */
export interface ContentPackTargets {
  /** A dialogue engine, e.g. from `createDialogueEngine`. */
  dialogue?: { registerDialogues(...dialogues: DialogueTreeLike[]): void }
  /** A quest engine, e.g. from `createQuestEngine`. */
  quest?: { registerQuests(...quests: QuestLike[]): void }
  /** An inventory, e.g. from `createInventory`. */
  inventory?: { registerItems(items: ItemLike[]): void }
  /** An achievements engine, e.g. from `createAchievements`. */
  achievements?: { registerAchievements(definitions: AchievementLike[]): void }
}

/** Options for {@link validateContentPack}; forwarded to devtools' `validateContent`. */
export type ValidateContentPackOptions = ContentValidationOptions

/** Options for {@link applyContentPack}. */
export interface ApplyContentPackOptions extends ContentValidationOptions {
  /**
   * Validate the pack before applying and refuse if it has errors.
   * @default true
   */
  validate?: boolean
}

/**
 * Result of {@link applyContentPack}.
 *
 * `applied` lists the section names actually registered (`'dialogues'`,
 * `'quests'`, `'items'`, `'achievements'`) — empty when the pack was refused or
 * carried no matching target/section. `ok` is false only when validation ran
 * and produced errors (nothing is applied in that case).
 */
export interface ApplyContentPackResult {
  applied: string[]
  report: ValidationReport
  ok: boolean
}

/**
 * Tracks which content packs (by id) have been applied and at what version.
 * Created by {@link createContentPackTracker}.
 */
export interface ContentPackTracker {
  /** Last applied version per pack id. Read-only snapshot; mutate via {@link record}. */
  readonly applied: Readonly<Record<string, number>>
  /**
   * Record a pack application. Warns (via the configured `warn`) when `version`
   * is **lower** than the last version recorded for the same `id` — a likely
   * out-of-order or stale apply.
   */
  record(pack: { id: string; version: number }): void
  /** Last recorded version for a pack id, or `undefined` if never applied. */
  version(id: string): number | undefined
}
