import type { StateStorage } from 'zustand/middleware'

/**
 * Declarative auto-advance trigger: while the step is active, the engine
 * subscribes to `event` on the bus and calls `next()` on the first matching
 * emission. Steps without `advanceOn` advance manually.
 */
export interface TutorialAdvanceTrigger {
  /** Event name on the (possibly game-extended) event map. */
  event: string
  /** Shallow payload match: every key must strictly equal the payload's value. */
  filter?: Record<string, unknown>
}

/**
 * One step of a tutorial. `content` and `target` are opaque to the
 * framework — the game's tutorial UI interprets them.
 */
export interface TutorialStep {
  id: string
  /** Step copy (opaque: plain text, i18n key, rich-text id, …). */
  content?: string
  /** UI anchor hint (DOM selector, element id, 3D entity id — opaque). */
  target?: string
  /** Auto-advance trigger. Omit for manual `next()` advancement. */
  advanceOn?: TutorialAdvanceTrigger
}

/** Static definition of a linear tutorial. */
export interface TutorialDefinition {
  id: string
  steps: TutorialStep[]
}

/** Terminal state of a tutorial run. */
export type TutorialStatus = 'completed' | 'skipped'

/** The state held by the tutorial store (only `statuses` is persisted). */
export interface TutorialState {
  /** Id of the running tutorial, or null. */
  activeTutorialId: string | null
  /** Index of the active step within the running tutorial. */
  stepIndex: number
  /** Terminal states per tutorial id. */
  statuses: Record<string, TutorialStatus>
}

/**
 * Persistence settings. Passing this object enables persistence through
 * zustand's `persist` middleware via `@overworld/core`'s `persistOptions`.
 */
export interface TutorialPersistConfig {
  /** Storage key (namespaced by `prefix`). @default 'tutorial' */
  name?: string
  /** Persisted-shape version, for migrations. @default 0 */
  version?: number
  /** Key prefix. @default 'overworld' */
  prefix?: string
  /** Storage backend factory. @default localStorage */
  storage?: () => StateStorage
}
