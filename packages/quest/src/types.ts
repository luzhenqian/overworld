import type { ConditionRef, EffectRef } from '@overworld-engine/core'

/**
 * Declarative event-bus trigger that auto-advances an objective. Replaces
 * imperative per-system progress hooks: systems emit events, the quest
 * engine subscribes and counts.
 */
export interface ObjectiveTrigger {
  /** Event name on the (possibly game-extended) framework event map. */
  event: string
  /**
   * Shallow-equality match on payload fields; every listed key must strictly
   * equal the payload's value for the event to count.
   */
  filter?: Record<string, unknown>
  /**
   * Payload key whose numeric value is added to progress (e.g. `'distance'`
   * for `player:moved`). Omit to add +1 per matching event.
   */
  amountFrom?: string
}

/** One requirement of a quest. */
export interface ObjectiveDefinition {
  id: string
  /** Display text. Opaque to the engine — literal copy or an i18n key. */
  description?: string
  /** Progress value at which the objective completes. */
  target: number
  /** Auto-progress from bus events. Omit for `reportProgress`-only objectives. */
  trigger?: ObjectiveTrigger
  /** Hint for UIs to hide the objective until revealed. */
  hidden?: boolean
}

/** Requirements that gate starting a quest. */
export interface QuestPrerequisites {
  /** Quest ids that must all be completed first. */
  quests?: string[]
  /** Conditions (AND semantics) evaluated against the engine context. */
  conditions?: ConditionRef[]
}

/**
 * A quest. Content only — no code. Rewards and prerequisites are declarative
 * references resolved through the game's effect/condition registries.
 */
export interface QuestDefinition {
  id: string
  /** Free-form grouping tag (e.g. 'tutorial', 'side'). */
  category?: string
  /** Display title. Opaque to the engine — literal copy or an i18n key. */
  title?: string
  /** Display description. Opaque to the engine. */
  description?: string
  prerequisites?: QuestPrerequisites
  objectives: ObjectiveDefinition[]
  /** Effects run when the quest completes. */
  rewards?: EffectRef[]
  /** Start automatically on engine init / registration (if prerequisites pass). */
  autoStart?: boolean
  /** Quest ids auto-started after completion (each checked against its prerequisites). */
  chainNext?: string[]
}

/** Progress of a single objective on an active quest. */
export interface ObjectiveProgress {
  current: number
  completed: boolean
}

/** Runtime state of a started quest (persisted). */
export interface ActiveQuest {
  questId: string
  /** Epoch ms when the quest was started. */
  startedAt: number
  /** Per-objective progress keyed by objective id. */
  objectives: Record<string, ObjectiveProgress>
}
