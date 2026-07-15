import {
  evaluateConditions,
  gameEvents,
  persistOptions,
  runEffects,
  type ConditionRegistry,
  type EffectRegistry,
  type EventBus,
  type OverworldEventMap,
} from '@overworld/core'
import { create, type StateCreator, type StoreApi, type UseBoundStore } from 'zustand'
import { persist, type StateStorage } from 'zustand/middleware'
import type { ActiveQuest, ObjectiveProgress, QuestDefinition } from './types'

/** Persistence settings for the quest engine. */
export interface QuestPersistConfig {
  /** Storage key (namespaced as `overworld:<name>`). Defaults to `quest`. */
  name?: string
  /** Persisted-state version, pair with a custom migrate strategy per game. */
  version?: number
  /** Storage backend factory. Defaults to `localStorage`. */
  storage?: () => StateStorage
}

/** Configuration for {@link createQuestEngine}. */
export interface QuestEngineConfig<Ctx = unknown> {
  /** Initial quest definitions. More can be added later via `registerQuests`. */
  quests: QuestDefinition[]
  /** Registry resolving prerequisite `ConditionRef`s. */
  conditions: ConditionRegistry<Ctx>
  /** Registry resolving reward `EffectRef`s. */
  effects: EffectRegistry<Ctx>
  /**
   * Context passed to every condition/effect handler. Pass a function to
   * resolve it lazily on each evaluation.
   */
  context?: Ctx | (() => Ctx)
  /**
   * Event bus used both to emit `quest:*` events and to subscribe to
   * objective triggers. Defaults to the global `gameEvents`.
   */
  events?: EventBus<OverworldEventMap>
  /**
   * Persistence for active progress and the completed list. Framework
   * convention: omitted or `false` = disabled; `true` = enabled with
   * defaults; object = custom.
   */
  persist?: boolean | QuestPersistConfig
}

/** Zustand state and actions of a quest engine. */
export interface QuestEngineState {
  /** Registered quest definitions by id (content — not persisted). */
  definitions: Record<string, QuestDefinition>
  /** Active quests with per-objective progress, keyed by quest id (persisted). */
  active: Record<string, ActiveQuest>
  /** Ids of completed quests (persisted). */
  completed: string[]

  /**
   * Add or replace quest definitions at runtime. Definitions with `autoStart`
   * are started immediately when their prerequisites pass.
   */
  registerQuests: (...quests: QuestDefinition[]) => void
  /**
   * Start a quest. Checks prerequisites (completed set + condition registry).
   * Emits `quest:started`. Unknown ids warn and return `false`.
   */
  startQuest: (questId: string) => boolean
  /**
   * Manually add progress (default +1) to an objective. Progress on unknown
   * or non-active quests is ignored; progress clamps at the target.
   */
  reportProgress: (questId: string, objectiveId: string, amount?: number) => void
  /**
   * Complete an active quest whose objectives are all done: runs rewards via
   * the effect registry, emits `quest:completed`, then auto-starts eligible
   * `chainNext` quests. Called automatically when the last objective hits its
   * target; calling it with incomplete objectives warns and returns `false`.
   */
  completeQuest: (questId: string) => boolean
  /** Whether the quest exists, is not active/completed, and its prerequisites pass. */
  canStartQuest: (questId: string) => boolean
  /** Definitions that are currently startable (see {@link QuestEngineState.canStartQuest}). */
  getAvailableQuests: () => QuestDefinition[]
  isActive: (questId: string) => boolean
  isCompleted: (questId: string) => boolean
  /**
   * Re-attach bus subscriptions for the triggers of active quests. Called
   * automatically on start/complete/registration and after rehydration; also
   * re-enables a disposed engine.
   */
  resubscribe: () => void
  /** Detach all bus subscriptions. Auto-progress stops until `resubscribe()`. */
  dispose: () => void
}

/**
 * A quest engine: a zustand hook that can also be used outside React via
 * `engine.getState()` / `engine.subscribe()`.
 */
export type QuestEngine = UseBoundStore<StoreApi<QuestEngineState>>

interface QuestPersistedState {
  active: Record<string, ActiveQuest>
  completed: string[]
}

function matchesFilter(payload: unknown, filter: Record<string, unknown>): boolean {
  if (typeof payload !== 'object' || payload === null) return false
  const record = payload as Record<string, unknown>
  return Object.entries(filter).every(([key, value]) => record[key] === value)
}

/** Extract a finite numeric amount from the payload, or null to skip the event. */
function readAmount(payload: unknown, key: string): number | null {
  if (typeof payload !== 'object' || payload === null) return null
  const value = (payload as Record<string, unknown>)[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/**
 * Create a headless, event-driven quest state machine.
 *
 * The engine never imports game systems. Everything the original monolith
 * did through direct store access is inverted:
 * - progress arrives as bus events matched by declarative objective triggers
 *   (or via `reportProgress` for cases without an event),
 * - rewards are `EffectRef`s dispatched through the game's effect registry,
 * - prerequisites are completed-quest ids plus `ConditionRef`s evaluated
 *   through the condition registry.
 *
 * ```ts
 * const useQuests = createQuestEngine({ quests, conditions, effects })
 * useQuests.getState().startQuest('walk-the-city')
 * ```
 */
export function createQuestEngine<Ctx = unknown>(config: QuestEngineConfig<Ctx>): QuestEngine {
  const bus = config.events ?? gameEvents
  const resolveContext = (): Ctx =>
    typeof config.context === 'function' ? (config.context as () => Ctx)() : (config.context as Ctx)
  // Objective triggers are dynamic (game-extended) event names, so the bus is
  // used through an untyped view for subscriptions.
  const dynamicBus = bus as unknown as EventBus<Record<string, unknown>>

  const initializer: StateCreator<QuestEngineState> = (set, get) => {
    const subscriptions = new Map<string, () => void>()
    let disposed = false

    /** Advance one objective, clamping at target, emitting progress events. */
    const advanceObjective = (questId: string, objectiveId: string, amount: number): void => {
      const state = get()
      const activeQuest = state.active[questId]
      const definition = state.definitions[questId]
      if (!activeQuest || !definition) return
      const objective = definition.objectives.find((o) => o.id === objectiveId)
      if (!objective) {
        console.warn(`[overworld] quest "${questId}" has no objective "${objectiveId}"`)
        return
      }
      const progress = activeQuest.objectives[objectiveId]
      if (!progress || progress.completed) return

      const current = Math.min(objective.target, Math.max(0, progress.current + amount))
      if (current === progress.current) return
      const completedNow = current >= objective.target

      set((s) => {
        const quest = s.active[questId]
        if (!quest) return s
        return {
          active: {
            ...s.active,
            [questId]: {
              ...quest,
              objectives: {
                ...quest.objectives,
                [objectiveId]: { current, completed: completedNow },
              },
            },
          },
        }
      })

      bus.emit('quest:objective-progress', {
        questId,
        objectiveId,
        current,
        target: objective.target,
      })
      if (completedNow) {
        bus.emit('quest:objective-completed', { questId, objectiveId })
        const quest = get().active[questId]
        if (quest && definition.objectives.every((o) => quest.objectives[o.id]?.completed)) {
          get().completeQuest(questId)
        } else {
          syncSubscriptions() // the finished objective's trigger may be stale now
        }
      }
    }

    /** Shared bus handler: fan an event out to every matching active objective. */
    const handleEvent = (event: string, payload: unknown): void => {
      const questIds = Object.keys(get().active)
      for (const questId of questIds) {
        const definition = get().definitions[questId]
        if (!definition) continue
        for (const objective of definition.objectives) {
          const trigger = objective.trigger
          if (!trigger || trigger.event !== event) continue
          const progress = get().active[questId]?.objectives[objective.id]
          if (!progress || progress.completed) continue
          if (trigger.filter && !matchesFilter(payload, trigger.filter)) continue
          const amount = trigger.amountFrom ? readAmount(payload, trigger.amountFrom) : 1
          if (amount === null) continue
          advanceObjective(questId, objective.id, amount)
        }
      }
    }

    /** Diff bus subscriptions against the trigger events active quests still need. */
    const syncSubscriptions = (): void => {
      if (disposed) return
      const state = get()
      const needed = new Set<string>()
      for (const activeQuest of Object.values(state.active)) {
        const definition = state.definitions[activeQuest.questId]
        if (!definition) continue
        for (const objective of definition.objectives) {
          if (!objective.trigger) continue
          if (activeQuest.objectives[objective.id]?.completed) continue
          needed.add(objective.trigger.event)
        }
      }
      for (const event of needed) {
        if (!subscriptions.has(event)) {
          subscriptions.set(
            event,
            dynamicBus.on(event, (payload) => handleEvent(event, payload))
          )
        }
      }
      for (const [event, unsubscribe] of [...subscriptions]) {
        if (!needed.has(event)) {
          unsubscribe()
          subscriptions.delete(event)
        }
      }
    }

    return {
      definitions: {},
      active: {},
      completed: [],

      registerQuests: (...quests) => {
        set((state) => {
          const definitions = { ...state.definitions }
          for (const quest of quests) {
            definitions[quest.id] = quest
          }
          return { definitions }
        })
        // Rehydrated active quests may reference newly known triggers.
        syncSubscriptions()
        for (const quest of quests) {
          if (quest.autoStart && get().canStartQuest(quest.id)) {
            get().startQuest(quest.id)
          }
        }
      },

      startQuest: (questId) => {
        const state = get()
        const definition = state.definitions[questId]
        if (!definition) {
          console.warn(`[overworld] unknown quest "${questId}"`)
          return false
        }
        if (state.active[questId] || state.completed.includes(questId)) return false
        if (!state.canStartQuest(questId)) return false

        const objectives: Record<string, ObjectiveProgress> = {}
        for (const objective of definition.objectives) {
          objectives[objective.id] = { current: 0, completed: false }
        }
        set((s) => ({
          active: { ...s.active, [questId]: { questId, startedAt: Date.now(), objectives } },
        }))
        bus.emit('quest:started', { questId })
        syncSubscriptions()
        return true
      },

      reportProgress: (questId, objectiveId, amount = 1) => {
        const state = get()
        if (!state.definitions[questId]) {
          console.warn(`[overworld] unknown quest "${questId}"`)
          return
        }
        if (!state.active[questId]) return // progress on non-active quests is ignored
        advanceObjective(questId, objectiveId, amount)
      },

      completeQuest: (questId) => {
        const state = get()
        const activeQuest = state.active[questId]
        const definition = state.definitions[questId]
        if (!activeQuest || !definition) {
          console.warn(`[overworld] quest "${questId}" is not active`)
          return false
        }
        const allDone = definition.objectives.every(
          (objective) => activeQuest.objectives[objective.id]?.completed
        )
        if (!allDone) {
          console.warn(`[overworld] quest "${questId}" still has incomplete objectives`)
          return false
        }

        set((s) => {
          const { [questId]: _removed, ...active } = s.active
          return {
            active,
            completed: s.completed.includes(questId) ? s.completed : [...s.completed, questId],
          }
        })
        syncSubscriptions()
        runEffects(config.effects, definition.rewards, resolveContext())
        bus.emit('quest:completed', { questId })
        for (const nextId of definition.chainNext ?? []) {
          if (get().canStartQuest(nextId)) {
            get().startQuest(nextId)
          }
        }
        return true
      },

      canStartQuest: (questId) => {
        const state = get()
        const definition = state.definitions[questId]
        if (!definition) return false
        if (state.active[questId] || state.completed.includes(questId)) return false
        const prerequisites = definition.prerequisites
        if (prerequisites?.quests?.some((id) => !state.completed.includes(id))) return false
        return evaluateConditions(config.conditions, prerequisites?.conditions, resolveContext())
      },

      getAvailableQuests: () => {
        const state = get()
        return Object.values(state.definitions).filter((definition) =>
          state.canStartQuest(definition.id)
        )
      },

      isActive: (questId) => questId in get().active,
      isCompleted: (questId) => get().completed.includes(questId),

      resubscribe: () => {
        disposed = false
        syncSubscriptions()
      },

      dispose: () => {
        disposed = true
        for (const unsubscribe of subscriptions.values()) {
          unsubscribe()
        }
        subscriptions.clear()
      },
    }
  }

  let engine: QuestEngine
  if (!config.persist) {
    engine = create<QuestEngineState>()(initializer)
  } else {
    const persistConfig = config.persist === true ? {} : config.persist
    engine = create<QuestEngineState>()(
      persist(
        initializer,
        persistOptions<QuestEngineState, QuestPersistedState>({
          name: persistConfig.name ?? 'quest',
          version: persistConfig.version,
          storage: persistConfig.storage,
          partialize: (state) => ({ active: state.active, completed: state.completed }),
          // Async storages hydrate after init — resubscribe triggers for the
          // restored active quests once hydration lands.
          onRehydrateStorage: () => (state) => {
            state?.resubscribe()
          },
        })
      )
    ) as QuestEngine
  }

  // Register initial content after creation (and after any synchronous
  // rehydration) so persisted active quests immediately regain their trigger
  // subscriptions and autoStart quests respect the restored completed set.
  engine.getState().registerQuests(...config.quests)
  return engine
}
