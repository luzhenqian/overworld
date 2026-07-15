import type { EffectRef } from '@overworld/core'
import type { StateStorage } from 'zustand/middleware'

/**
 * Declarative unlock trigger: the engine subscribes to `event` on the bus
 * and accumulates progress from matching emissions. This replaces hardcoded
 * per-achievement checks — content describes *when*, registered effects
 * describe *what happens*.
 */
export interface AchievementTrigger {
  /** Event name on the (possibly game-extended) event map. */
  event: string
  /** Shallow payload match: every key must strictly equal the payload's value. */
  filter?: Record<string, unknown>
  /**
   * Progress required to unlock.
   * @default 1
   */
  count?: number
  /**
   * Payload key whose numeric value contributes to progress (e.g. `distance`
   * on `player:moved`). When omitted, each matching event contributes 1.
   */
  amountFrom?: string
}

/**
 * Static definition of an achievement. `title`/`description` are opaque
 * strings — plain text or i18n keys, the framework never interprets them.
 */
export interface AchievementDefinition {
  id: string
  /** Display title (opaque: plain text or i18n key). */
  title?: string
  /** Description (opaque: plain text or i18n key). */
  description?: string
  /** Icon hint for the UI (emoji, sprite id, URL — opaque). */
  icon?: string
  /** Hint for UIs to hide the achievement until unlocked. */
  hidden?: boolean
  /** Event-driven unlock trigger, or `null` for manual-only unlocking. */
  trigger: AchievementTrigger | null
  /** Effects executed through the effect registry when unlocked. */
  rewards?: EffectRef[]
}

/** Progress snapshot returned by `progress(id)`. */
export interface AchievementProgress {
  /** Accumulated progress (clamped to `target` once unlocked). */
  current: number
  /** Progress required to unlock (`trigger.count`, default 1). */
  target: number
  unlocked: boolean
  /** Unlock timestamp (`Date.now()`), present once unlocked. */
  unlockedAt?: number
}

/** The state held (and optionally persisted) by the achievements store. */
export interface AchievementsState {
  /** Accumulated trigger progress per achievement id. */
  progress: Record<string, number>
  /** Unlock timestamps per unlocked achievement id. */
  unlocked: Record<string, number>
}

/**
 * Persistence settings. Passing this object enables persistence through
 * zustand's `persist` middleware via `@overworld/core`'s `persistOptions`.
 */
export interface AchievementsPersistConfig {
  /** Storage key (namespaced by `prefix`). @default 'achievements' */
  name?: string
  /** Persisted-shape version, for migrations. @default 0 */
  version?: number
  /** Key prefix. @default 'overworld' */
  prefix?: string
  /** Storage backend factory. @default localStorage */
  storage?: () => StateStorage
}
