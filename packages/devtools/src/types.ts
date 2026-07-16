/**
 * Shared types for `@overworld/devtools`.
 *
 * ## Structural input types
 *
 * The `*Like` content types below are **duck-typed structural subsets** of the
 * real schemas in `@overworld/dialogue`, `@overworld/quest`,
 * `@overworld/inventory` and `@overworld/achievements`. They are defined
 * locally so devtools keeps the framework's zero-cross-dependency rule: the
 * only runtime dependency is `@overworld/core`.
 *
 * Because TypeScript typing is structural, the real content types
 * (`DialogueTree`, `QuestDefinition`, `ItemDefinition`,
 * `AchievementDefinition`) are directly assignable to these — pass your
 * content arrays as-is.
 */

/**
 * Structural shape of `EffectRef` / `ConditionRef` from `@overworld/core`.
 * Both are assignable to this type.
 */
export interface RefLike {
  type: string
  params?: Record<string, unknown>
  /** Only meaningful on condition refs. */
  negate?: boolean
}

/** One validation finding. `error` = broken content, `warning` = suspicious. */
export interface ValidationIssue {
  severity: 'error' | 'warning'
  /** What is being validated, e.g. `"dialogue:guide-intro"` or `"quest:welcome"`. */
  source: string
  /** Dotted location inside the source, e.g. `"nodes.hello.responses.ask.next"`. */
  path: string
  /** Human-readable explanation. */
  message: string
}

/** Aggregate result of a validation run. */
export interface ValidationReport {
  /** All issues in discovery order. */
  issues: ValidationIssue[]
  /** Issues with severity `error`. */
  errors: ValidationIssue[]
  /** Issues with severity `warning`. */
  warnings: ValidationIssue[]
  /** True when there are no errors (warnings do not fail a report). */
  ok: boolean
}

/**
 * Known registry types, used to flag effect/condition refs whose `type` was
 * never registered. Each check only runs when its list is provided —
 * typically from `registry.types()` after all handlers are registered.
 */
export interface KnownTypeOptions {
  /** Known condition types (e.g. `conditions.types()`). */
  conditionTypes?: string[]
  /** Known effect types (e.g. `effects.types()`). */
  effectTypes?: string[]
}

// ---------------------------------------------------------------------------
// Dialogue (structural subset of @overworld/dialogue types)
// ---------------------------------------------------------------------------

/** Structural subset of `DialogueResponse`. */
export interface DialogueResponseLike {
  id: string
  conditions?: RefLike[]
  effects?: RefLike[]
  /** Node id to jump to. Omit to end the dialogue after choosing. */
  next?: string
}

/** Structural subset of `DialogueNode`. */
export interface DialogueNodeLike {
  id: string
  responses?: DialogueResponseLike[]
  next?: string
  effects?: RefLike[]
  endsDialogue?: boolean
}

/** Structural subset of `DialogueTree`. */
export interface DialogueTreeLike {
  id: string
  startNodeId: string
  nodes: DialogueNodeLike[]
}

// ---------------------------------------------------------------------------
// Quest (structural subset of @overworld/quest types)
// ---------------------------------------------------------------------------

/** Structural subset of `ObjectiveTrigger`. */
export interface ObjectiveTriggerLike {
  event: string
  filter?: Record<string, unknown>
  amountFrom?: string
}

/** Structural subset of `ObjectiveDefinition`. */
export interface ObjectiveLike {
  id: string
  target: number
  trigger?: ObjectiveTriggerLike
}

/** Structural subset of `QuestDefinition`. */
export interface QuestLike {
  id: string
  prerequisites?: {
    quests?: string[]
    conditions?: RefLike[]
  }
  objectives: ObjectiveLike[]
  rewards?: RefLike[]
  autoStart?: boolean
  chainNext?: string[]
}

// ---------------------------------------------------------------------------
// Inventory (structural subset of @overworld/inventory types)
// ---------------------------------------------------------------------------

/** Structural subset of `ItemDefinition`. */
export interface ItemLike {
  id: string
  stackable?: boolean
  maxStack?: number
  useEffects?: RefLike[]
}

// ---------------------------------------------------------------------------
// Achievements (structural subset of @overworld/achievements types)
// ---------------------------------------------------------------------------

/** Structural subset of `AchievementTrigger`. */
export interface AchievementTriggerLike {
  event: string
  filter?: Record<string, unknown>
  count?: number
  amountFrom?: string
}

/**
 * Structural subset of `AchievementDefinition`.
 *
 * The real schema requires `trigger: AchievementTrigger | null` — `null`
 * explicitly marks a manual-only achievement. `trigger` is optional here so
 * the validator can flag definitions that omit the field entirely.
 */
export interface AchievementLike {
  id: string
  trigger?: AchievementTriggerLike | null
  rewards?: RefLike[]
}
