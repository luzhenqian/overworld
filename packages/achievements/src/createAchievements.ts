import {
  createEffectRegistry,
  gameEvents,
  persistOptions,
  runEffects,
  type EffectRegistry,
  type EventBus,
  type OverworldEventMap,
} from '@overworld/core'
import { persist } from 'zustand/middleware'
import { createStore, type StoreApi } from 'zustand/vanilla'
import type {
  AchievementDefinition,
  AchievementProgress,
  AchievementsPersistConfig,
  AchievementsState,
} from './types'

/** Configuration for {@link createAchievements}. */
export interface AchievementsConfig<Ctx = unknown> {
  /** Achievement definitions. More can be added later via `registerAchievements`. */
  definitions?: AchievementDefinition[]
  /** Effect registry used to resolve `rewards`. Defaults to an empty registry. */
  effects?: EffectRegistry<Ctx>
  /** Context passed to every reward effect handler. */
  context?: Ctx
  /**
   * Event bus to subscribe triggers on and emit `achievement:unlocked` on.
   * Defaults to the global `gameEvents`.
   */
  events?: EventBus<OverworldEventMap>
  /** Enable persistence by providing (possibly empty) persist settings. */
  persist?: boolean | AchievementsPersistConfig
}

/** The headless achievement engine returned by {@link createAchievements}. */
export interface Achievements {
  /** Underlying zustand vanilla store — subscribe directly or via `useStore` in React. */
  store: StoreApi<AchievementsState>
  /**
   * Add or replace achievement definitions at runtime. Replacing a
   * definition rewires its trigger subscription; accumulated progress is
   * kept.
   */
  registerAchievements(definitions: AchievementDefinition[]): void
  /** Look up a single achievement definition. */
  getDefinition(id: string): AchievementDefinition | undefined
  /** All registered achievement definitions. */
  definitions(): AchievementDefinition[]
  /**
   * Unlock manually (the only way for `trigger: null` achievements). Runs
   * rewards and emits `achievement:unlocked`. Returns false when the id is
   * unknown or already unlocked.
   */
  unlock(id: string): boolean
  /** Progress snapshot for one achievement. */
  progress(id: string): AchievementProgress
  isUnlocked(id: string): boolean
  /** Ids of all unlocked achievements. */
  unlockedIds(): string[]
  /** Unsubscribe every trigger from the event bus. */
  dispose(): void
}

/** Shallow payload match: every filter key must strictly equal the payload's value. */
function matchesFilter(payload: unknown, filter: Record<string, unknown> | undefined): boolean {
  if (!filter) return true
  if (typeof payload !== 'object' || payload === null) return false
  const record = payload as Record<string, unknown>
  return Object.entries(filter).every(([key, value]) => record[key] === value)
}

/** Numeric progress contributed by one event payload. */
function amountOf(payload: unknown, amountFrom: string | undefined): number {
  if (!amountFrom) return 1
  if (typeof payload !== 'object' || payload === null) return 0
  const value = (payload as Record<string, unknown>)[amountFrom]
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

/**
 * Create a headless achievement engine.
 *
 * Triggers are declarative — the engine subscribes to the event bus and
 * accumulates progress; no game code is imported. Rewards go through the
 * effect registry, unlocks are announced as `achievement:unlocked`.
 * Persisted progress keeps counting after rehydration because trigger
 * subscriptions are independent of the persisted state.
 */
export function createAchievements<Ctx = unknown>(
  config: AchievementsConfig<Ctx> = {}
): Achievements {
  const defs = new Map<string, AchievementDefinition>()
  const effects = config.effects ?? createEffectRegistry<Ctx>()
  const events = config.events ?? gameEvents
  const context = config.context as Ctx
  // The bus is typed against the framework event map; triggers may reference
  // any (game-extended) event name, so subscribe through a loose view.
  const anyBus = events as unknown as EventBus<Record<string, unknown>>
  /** Active trigger subscriptions, keyed by achievement id. */
  const subscriptions = new Map<string, () => void>()

  const initializer = (): AchievementsState => ({ progress: {}, unlocked: {} })
  const persistCfg = config.persist === true ? {} : config.persist
  const store: StoreApi<AchievementsState> = persistCfg
    ? createStore<AchievementsState>()(
        persist(initializer, {
          ...persistOptions<AchievementsState>({
            name: persistCfg.name ?? 'achievements',
            ...(persistCfg.version !== undefined && { version: persistCfg.version }),
            ...(persistCfg.prefix !== undefined && { prefix: persistCfg.prefix }),
            ...(persistCfg.storage !== undefined && { storage: persistCfg.storage }),
          }),
        })
      )
    : createStore<AchievementsState>()(initializer)

  const isUnlocked = (id: string): boolean => store.getState().unlocked[id] !== undefined

  const doUnlock = (definition: AchievementDefinition): boolean => {
    if (isUnlocked(definition.id)) return false
    store.setState((state) => ({
      unlocked: { ...state.unlocked, [definition.id]: Date.now() },
    }))
    runEffects(effects, definition.rewards, context)
    events.emit('achievement:unlocked', { achievementId: definition.id })
    return true
  }

  const subscribeTrigger = (definition: AchievementDefinition): void => {
    const trigger = definition.trigger
    if (!trigger) return
    const target = trigger.count ?? 1
    const unsubscribe = anyBus.on(trigger.event, (payload) => {
      if (isUnlocked(definition.id)) return
      if (!matchesFilter(payload, trigger.filter)) return
      const amount = amountOf(payload, trigger.amountFrom)
      if (amount <= 0) return
      const current = (store.getState().progress[definition.id] ?? 0) + amount
      store.setState((state) => ({
        progress: { ...state.progress, [definition.id]: current },
      }))
      if (current >= target) doUnlock(definition)
    })
    subscriptions.set(definition.id, unsubscribe)
  }

  const achievements: Achievements = {
    store,

    registerAchievements(definitions) {
      for (const definition of definitions) {
        subscriptions.get(definition.id)?.()
        subscriptions.delete(definition.id)
        defs.set(definition.id, definition)
        subscribeTrigger(definition)
      }
    },

    getDefinition(id) {
      return defs.get(id)
    },

    definitions() {
      return [...defs.values()]
    },

    unlock(id) {
      const definition = defs.get(id)
      if (!definition) return false
      return doUnlock(definition)
    },

    progress(id) {
      const target = defs.get(id)?.trigger?.count ?? 1
      const unlockedAt = store.getState().unlocked[id]
      const accumulated = store.getState().progress[id] ?? 0
      if (unlockedAt !== undefined) {
        return { current: Math.max(target, accumulated), target, unlocked: true, unlockedAt }
      }
      return { current: accumulated, target, unlocked: false }
    },

    isUnlocked,

    unlockedIds() {
      return Object.keys(store.getState().unlocked)
    },

    dispose() {
      for (const unsubscribe of subscriptions.values()) unsubscribe()
      subscriptions.clear()
    },
  }

  if (config.definitions) achievements.registerAchievements(config.definitions)

  return achievements
}
