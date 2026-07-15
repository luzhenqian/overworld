import {
  gameEvents,
  persistOptions,
  type EventBus,
  type OverworldEventMap,
} from '@overworld/core'
import { persist } from 'zustand/middleware'
import { createStore, type StoreApi } from 'zustand/vanilla'
import type {
  TutorialDefinition,
  TutorialPersistConfig,
  TutorialState,
  TutorialStatus,
  TutorialStep,
} from './types'

/** Configuration for {@link createTutorial}. */
export interface TutorialConfig {
  /** Tutorial definitions. More can be added later via `registerTutorials`. */
  tutorials?: TutorialDefinition[]
  /**
   * Event bus for `advanceOn` subscriptions and `tutorial:*` emissions.
   * Defaults to the global `gameEvents`.
   */
  events?: EventBus<OverworldEventMap>
  /** Enable persistence by providing (possibly empty) persist settings. */
  persist?: boolean | TutorialPersistConfig
}

/** The headless tutorial engine returned by {@link createTutorial}. */
export interface Tutorial {
  /** Underlying zustand vanilla store — subscribe directly or via `useStore` in React. */
  store: StoreApi<TutorialState>
  /** Add or replace tutorial definitions at runtime. */
  registerTutorials(tutorials: TutorialDefinition[]): void
  /** Look up a single tutorial definition. */
  getDefinition(id: string): TutorialDefinition | undefined
  /**
   * Start (or restart) a tutorial at its first step. Emits
   * `tutorial:step-changed`; a tutorial without steps completes immediately.
   * Returns false for unknown ids.
   */
  start(tutorialId: string): boolean
  /** The running tutorial's definition, or null. */
  activeTutorial(): TutorialDefinition | null
  /** The active step, or null when no tutorial is running. */
  currentStep(): TutorialStep | null
  /** Index of the active step (0 when idle). */
  stepIndex(): number
  /**
   * Advance to the next step (emits `tutorial:step-changed`), or finish the
   * tutorial from its last step (marks it completed and emits
   * `tutorial:completed`).
   */
  next(): void
  /** Abort the running tutorial and mark it skipped. Does not emit `tutorial:completed`. */
  skip(): void
  /** True when the tutorial finished normally (skipped ones report false). */
  isCompleted(tutorialId: string): boolean
  /** Terminal state of a tutorial, or undefined when never finished. */
  getStatus(tutorialId: string): TutorialStatus | undefined
  /** Release the auto-advance subscription, if any. */
  dispose(): void
}

/** Shallow payload match: every filter key must strictly equal the payload's value. */
function matchesFilter(payload: unknown, filter: Record<string, unknown> | undefined): boolean {
  if (!filter) return true
  if (typeof payload !== 'object' || payload === null) return false
  const record = payload as Record<string, unknown>
  return Object.entries(filter).every(([key, value]) => record[key] === value)
}

/**
 * Create a headless tutorial engine for linear step sequences.
 *
 * Steps advance manually via `next()` or automatically via a declarative
 * `advanceOn` event trigger. The engine subscribes to the bus only while a
 * step with `advanceOn` is active. Terminal states (completed/skipped) are
 * the persisted part of the state.
 */
export function createTutorial(config: TutorialConfig = {}): Tutorial {
  const defs = new Map<string, TutorialDefinition>()
  const events = config.events ?? gameEvents
  // The bus is typed against the framework event map; `advanceOn` may
  // reference any (game-extended) event name, so subscribe through a loose view.
  const anyBus = events as unknown as EventBus<Record<string, unknown>>
  /** Unsubscribe for the active step's `advanceOn` listener, if any. */
  let stepUnsubscribe: (() => void) | null = null

  const initializer = (): TutorialState => ({
    activeTutorialId: null,
    stepIndex: 0,
    statuses: {},
  })
  type PersistedTutorialState = Pick<TutorialState, 'statuses'>
  const persistCfg = config.persist === true ? {} : config.persist
  const store: StoreApi<TutorialState> = persistCfg
    ? createStore<TutorialState>()(
        persist(initializer, {
          ...persistOptions<TutorialState, PersistedTutorialState>({
            name: persistCfg.name ?? 'tutorial',
            partialize: (state) => ({ statuses: state.statuses }),
            ...(persistCfg.version !== undefined && { version: persistCfg.version }),
            ...(persistCfg.prefix !== undefined && { prefix: persistCfg.prefix }),
            ...(persistCfg.storage !== undefined && { storage: persistCfg.storage }),
          }),
        })
      )
    : createStore<TutorialState>()(initializer)

  const unbindStep = (): void => {
    stepUnsubscribe?.()
    stepUnsubscribe = null
  }

  const activeTutorial = (): TutorialDefinition | null => {
    const id = store.getState().activeTutorialId
    return id === null ? null : (defs.get(id) ?? null)
  }

  const currentStep = (): TutorialStep | null =>
    activeTutorial()?.steps[store.getState().stepIndex] ?? null

  /** (Re)subscribe the active step's `advanceOn` trigger, if it has one. */
  const bindStep = (): void => {
    unbindStep()
    const advanceOn = currentStep()?.advanceOn
    if (!advanceOn) return
    stepUnsubscribe = anyBus.on(advanceOn.event, (payload) => {
      if (matchesFilter(payload, advanceOn.filter)) tutorial.next()
    })
  }

  const emitStepChanged = (definition: TutorialDefinition, stepIndex: number): void => {
    const step = definition.steps[stepIndex]
    if (!step) return
    events.emit('tutorial:step-changed', { tutorialId: definition.id, stepId: step.id, stepIndex })
  }

  /** End the running tutorial and record its terminal state. */
  const finish = (tutorialId: string, status: TutorialStatus): void => {
    unbindStep()
    store.setState((state) => ({
      activeTutorialId: null,
      stepIndex: 0,
      statuses: { ...state.statuses, [tutorialId]: status },
    }))
    if (status === 'completed') events.emit('tutorial:completed', { tutorialId })
  }

  const tutorial: Tutorial = {
    store,

    registerTutorials(tutorials) {
      for (const definition of tutorials) defs.set(definition.id, definition)
    },

    getDefinition(id) {
      return defs.get(id)
    },

    start(tutorialId) {
      const definition = defs.get(tutorialId)
      if (!definition) return false
      unbindStep()
      if (definition.steps.length === 0) {
        finish(tutorialId, 'completed')
        return true
      }
      store.setState({ activeTutorialId: tutorialId, stepIndex: 0 })
      emitStepChanged(definition, 0)
      bindStep()
      return true
    },

    activeTutorial,
    currentStep,

    stepIndex() {
      return store.getState().stepIndex
    },

    next() {
      const { activeTutorialId, stepIndex } = store.getState()
      if (activeTutorialId === null) return
      const definition = defs.get(activeTutorialId)
      if (!definition) {
        unbindStep()
        store.setState({ activeTutorialId: null, stepIndex: 0 })
        return
      }
      const nextIndex = stepIndex + 1
      if (nextIndex >= definition.steps.length) {
        finish(activeTutorialId, 'completed')
        return
      }
      store.setState({ stepIndex: nextIndex })
      emitStepChanged(definition, nextIndex)
      bindStep()
    },

    skip() {
      const { activeTutorialId } = store.getState()
      if (activeTutorialId === null) return
      finish(activeTutorialId, 'skipped')
    },

    isCompleted(tutorialId) {
      return store.getState().statuses[tutorialId] === 'completed'
    },

    getStatus(tutorialId) {
      return store.getState().statuses[tutorialId]
    },

    dispose() {
      unbindStep()
    },
  }

  if (config.tutorials) tutorial.registerTutorials(config.tutorials)

  return tutorial
}
