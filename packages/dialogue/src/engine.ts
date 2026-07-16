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
import { persist, type StateStorage } from 'zustand/middleware'
import { createStore, type StateCreator, type StoreApi } from 'zustand/vanilla'
import type { ActiveDialogue, DialogueNode, DialogueResponse, DialogueTree } from './types'

/** Persistence settings for the dialogue engine. */
export interface DialoguePersistConfig {
  /** Storage key (namespaced as `overworld:<name>`). Defaults to `dialogue`. */
  name?: string
  /** Persisted-state version, pair with a custom migrate strategy per game. */
  version?: number
  /** Storage backend factory. Defaults to `localStorage`. */
  storage?: () => StateStorage
}

/** Configuration for {@link createDialogueEngine}. */
export interface DialogueEngineConfig<Ctx = unknown> {
  /** Initial dialogue trees. More can be added later via `registerDialogues`. */
  dialogues: DialogueTree[]
  /** Registry resolving `ConditionRef`s on responses. */
  conditions: ConditionRegistry<Ctx>
  /** Registry resolving `EffectRef`s on nodes and responses. */
  effects: EffectRegistry<Ctx>
  /**
   * Context passed to every condition/effect handler. Pass a function to
   * resolve it lazily on each evaluation.
   */
  context?: Ctx | (() => Ctx)
  /** Event bus to emit `dialogue:*` events on. Defaults to the global `gameEvents`. */
  events?: EventBus<OverworldEventMap>
  /**
   * Persistence for relationships and seen/completed flags (the active
   * conversation is never persisted). Framework convention: omitted or
   * `false` = disabled; `true` = enabled with defaults; object = custom.
   */
  persist?: boolean | DialoguePersistConfig
}

/** Zustand state and actions of a dialogue engine. */
export interface DialogueEngineState {
  /** Registered dialogue trees by id. */
  dialogues: Record<string, DialogueTree>
  /** The in-flight conversation, or `null` when idle. */
  activeDialogue: ActiveDialogue | null
  /** Node currently displayed, or `null` when idle. */
  currentNode: DialogueNode | null
  /** Responses of the current node whose conditions pass (recomputed on each transition). */
  availableResponses: DialogueResponse[]
  /** Generic NPC affinity values (persisted). Games build their own meaning on top. */
  relationships: Record<string, number>
  /** Ids of dialogues that have been started at least once (persisted). */
  seenDialogues: string[]
  /** Ids of dialogues that reached a terminal node at least once (persisted). */
  completedDialogues: string[]

  /** Add or replace dialogue trees at runtime. */
  registerDialogues: (...dialogues: DialogueTree[]) => void
  /**
   * Begin a conversation. Ends any conversation already in progress. Emits
   * `dialogue:started`. Returns `false` (with a warning) for unknown ids.
   */
  start: (dialogueId: string, npcId?: string) => boolean
  /**
   * Pick one of `availableResponses` by id: runs its effects, then follows
   * `next` or ends the dialogue. Returns `false` if the response is unknown
   * or its conditions filtered it out.
   */
  choose: (responseId: string) => boolean
  /**
   * Advance a linear node (no available responses): follows `next`, or ends
   * the dialogue on terminal nodes. Returns `false` when a choice is pending.
   */
  advance: () => boolean
  /** Close the conversation immediately. Emits `dialogue:ended`. */
  end: () => void
  /** Add `delta` to the relationship value for `npcId` (unclamped). */
  adjustRelationship: (npcId: string, delta: number) => void
  /** Whether the dialogue has ever been started. */
  hasSeen: (dialogueId: string) => boolean
  /** Whether the dialogue has ever reached a terminal node. */
  hasCompleted: (dialogueId: string) => boolean
}

/**
 * The dialogue engine returned by {@link createDialogueEngine}: methods on the
 * object drive the conversation, the underlying zustand vanilla store carries
 * the reactive state — subscribe directly, or via `useStore(engine.store,
 * selector)` in React.
 */
export interface DialogueEngine {
  /** Underlying zustand vanilla store — subscribe directly or via `useStore` in React. */
  store: StoreApi<DialogueEngineState>
  /** Add or replace dialogue trees at runtime. */
  registerDialogues(...dialogues: DialogueTree[]): void
  /**
   * Begin a conversation. Ends any conversation already in progress. Emits
   * `dialogue:started`. Returns `false` (with a warning) for unknown ids.
   */
  start(dialogueId: string, npcId?: string): boolean
  /**
   * Pick one of `availableResponses` by id: runs its effects, then follows
   * `next` or ends the dialogue. Returns `false` if the response is unknown
   * or its conditions filtered it out.
   */
  choose(responseId: string): boolean
  /**
   * Advance a linear node (no available responses): follows `next`, or ends
   * the dialogue on terminal nodes. Returns `false` when a choice is pending.
   */
  advance(): boolean
  /** Close the conversation immediately. Emits `dialogue:ended`. */
  end(): void
  /** Add `delta` to the relationship value for `npcId` (unclamped). */
  adjustRelationship(npcId: string, delta: number): void
  /** Whether the dialogue has ever been started. */
  hasSeen(dialogueId: string): boolean
  /** Whether the dialogue has ever reached a terminal node. */
  hasCompleted(dialogueId: string): boolean
  /** Snapshot of the current state — convenience for `store.getState()`. */
  getState(): DialogueEngineState
}

interface DialoguePersistedState {
  relationships: Record<string, number>
  seenDialogues: string[]
  completedDialogues: string[]
}

/**
 * Create a headless dialogue engine.
 *
 * The engine holds zero content knowledge: trees are injected, and all
 * behavior referenced by content (`conditions`/`effects`) is resolved through
 * the game's registries. Cross-system communication happens exclusively via
 * `dialogue:started` / `dialogue:ended` events on the bus.
 *
 * ```ts
 * const dialogue = createDialogueEngine({ dialogues, conditions, effects })
 * dialogue.start('guide-intro', 'guide')
 * ```
 */
export function createDialogueEngine<Ctx = unknown>(
  config: DialogueEngineConfig<Ctx>
): DialogueEngine {
  const bus = config.events ?? gameEvents
  const resolveContext = (): Ctx =>
    typeof config.context === 'function' ? (config.context as () => Ctx)() : (config.context as Ctx)

  const initialDialogues: Record<string, DialogueTree> = {}
  for (const tree of config.dialogues) {
    initialDialogues[tree.id] = tree
  }

  const initializer: StateCreator<DialogueEngineState> = (set, get) => {
    const findNode = (tree: DialogueTree, nodeId: string): DialogueNode | undefined =>
      tree.nodes.find((node) => node.id === nodeId)

    /** A node ends the dialogue when advanced past / closed on. */
    const isTerminal = (node: DialogueNode | null): boolean =>
      node !== null &&
      (node.endsDialogue === true || (!node.next && (node.responses?.length ?? 0) === 0))

    const filterResponses = (node: DialogueNode): DialogueResponse[] => {
      const ctx = resolveContext()
      return (node.responses ?? []).filter((response) =>
        evaluateConditions(config.conditions, response.conditions, ctx)
      )
    }

    /** Tear down the active conversation and emit `dialogue:ended`. */
    const finish = (completed: boolean): void => {
      const { activeDialogue } = get()
      if (!activeDialogue) return
      set((state) => ({
        activeDialogue: null,
        currentNode: null,
        availableResponses: [],
        completedDialogues:
          completed && !state.completedDialogues.includes(activeDialogue.dialogueId)
            ? [...state.completedDialogues, activeDialogue.dialogueId]
            : state.completedDialogues,
      }))
      bus.emit('dialogue:ended', {
        npcId: activeDialogue.npcId ?? '',
        dialogueId: activeDialogue.dialogueId,
        nodeId: activeDialogue.nodeId,
      })
    }

    /** Move the conversation onto a node, run its effects, filter its responses. */
    const enterNode = (
      tree: DialogueTree,
      nodeId: string,
      npcId: string | undefined,
      history: string[]
    ): boolean => {
      const node = findNode(tree, nodeId)
      if (!node) {
        console.warn(`[overworld] dialogue "${tree.id}" has no node "${nodeId}"`)
        finish(false)
        return false
      }
      set({
        activeDialogue: { dialogueId: tree.id, npcId, nodeId, history },
        currentNode: node,
        availableResponses: filterResponses(node),
      })
      runEffects(config.effects, node.effects, resolveContext())
      return true
    }

    return {
      dialogues: initialDialogues,
      activeDialogue: null,
      currentNode: null,
      availableResponses: [],
      relationships: {},
      seenDialogues: [],
      completedDialogues: [],

      registerDialogues: (...trees) => {
        set((state) => {
          const dialogues = { ...state.dialogues }
          for (const tree of trees) {
            dialogues[tree.id] = tree
          }
          return { dialogues }
        })
      },

      start: (dialogueId, npcId) => {
        const tree = get().dialogues[dialogueId]
        if (!tree) {
          console.warn(`[overworld] unknown dialogue "${dialogueId}"`)
          return false
        }
        if (!findNode(tree, tree.startNodeId)) {
          console.warn(
            `[overworld] dialogue "${dialogueId}" has no start node "${tree.startNodeId}"`
          )
          return false
        }
        if (get().activeDialogue) finish(false)
        set((state) => ({
          seenDialogues: state.seenDialogues.includes(dialogueId)
            ? state.seenDialogues
            : [...state.seenDialogues, dialogueId],
        }))
        bus.emit('dialogue:started', { npcId: npcId ?? '', dialogueId })
        return enterNode(tree, tree.startNodeId, npcId, [])
      },

      choose: (responseId) => {
        const { activeDialogue, availableResponses } = get()
        if (!activeDialogue) return false
        const response = availableResponses.find((r) => r.id === responseId)
        if (!response) {
          console.warn(`[overworld] response "${responseId}" is not available`)
          return false
        }
        runEffects(config.effects, response.effects, resolveContext())
        if (response.next) {
          const tree = get().dialogues[activeDialogue.dialogueId]
          if (!tree) {
            finish(false)
            return false
          }
          return enterNode(tree, response.next, activeDialogue.npcId, [
            ...activeDialogue.history,
            activeDialogue.nodeId,
          ])
        }
        finish(true)
        return true
      },

      advance: () => {
        const { activeDialogue, currentNode, availableResponses } = get()
        if (!activeDialogue || !currentNode) return false
        if (availableResponses.length > 0) return false
        if (currentNode.endsDialogue || !currentNode.next) {
          finish(true)
          return true
        }
        const tree = get().dialogues[activeDialogue.dialogueId]
        if (!tree) {
          finish(false)
          return false
        }
        return enterNode(tree, currentNode.next, activeDialogue.npcId, [
          ...activeDialogue.history,
          activeDialogue.nodeId,
        ])
      },

      end: () => {
        finish(isTerminal(get().currentNode))
      },

      adjustRelationship: (npcId, delta) => {
        set((state) => ({
          relationships: {
            ...state.relationships,
            [npcId]: (state.relationships[npcId] ?? 0) + delta,
          },
        }))
      },

      hasSeen: (dialogueId) => get().seenDialogues.includes(dialogueId),
      hasCompleted: (dialogueId) => get().completedDialogues.includes(dialogueId),
    }
  }

  let store: StoreApi<DialogueEngineState>
  if (!config.persist) {
    store = createStore<DialogueEngineState>()(initializer)
  } else {
    const persistConfig = config.persist === true ? {} : config.persist
    store = createStore<DialogueEngineState>()(
      persist(
        initializer,
        persistOptions<DialogueEngineState, DialoguePersistedState>({
          name: persistConfig.name ?? 'dialogue',
          version: persistConfig.version,
          storage: persistConfig.storage,
          partialize: (state) => ({
            relationships: state.relationships,
            seenDialogues: state.seenDialogues,
            completedDialogues: state.completedDialogues,
          }),
        })
      )
    )
  }

  return {
    store,
    registerDialogues: (...trees) => store.getState().registerDialogues(...trees),
    start: (dialogueId, npcId) => store.getState().start(dialogueId, npcId),
    choose: (responseId) => store.getState().choose(responseId),
    advance: () => store.getState().advance(),
    end: () => store.getState().end(),
    adjustRelationship: (npcId, delta) => store.getState().adjustRelationship(npcId, delta),
    hasSeen: (dialogueId) => store.getState().hasSeen(dialogueId),
    hasCompleted: (dialogueId) => store.getState().hasCompleted(dialogueId),
    getState: () => store.getState(),
  }
}
