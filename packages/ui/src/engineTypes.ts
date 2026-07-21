/**
 * Structural (duck-typed) views of the Overworld headless engines.
 *
 * The zero-cross-package-import rule forbids importing engine packages here;
 * instead these interfaces mirror the subset of each engine's shape that the
 * UI needs. Real engine instances satisfy them structurally (proven at
 * compile time by examples/ui-gallery, which passes real engines in).
 */

/** Read-only view of a zustand store — matches zustand's ReadonlyStoreApi. */
export interface ReadableStore<T> {
  getState(): T
  getInitialState(): T
  subscribe(listener: (state: T, prevState: T) => void): () => void
}

// ---------------------------------------------------------------- dialogue

export interface DialogueNodeLike {
  id: string
  speaker?: string
  text: string
}

export interface DialogueResponseLike {
  id: string
  text: string
}

export interface DialogueUiState {
  activeDialogue: { dialogueId: string; npcId?: string } | null
  currentNode: DialogueNodeLike | null
  availableResponses: readonly DialogueResponseLike[]
}

/** Mirrors @overworld-engine/dialogue's DialogueEngine. */
export interface DialogueEngineLike {
  store: ReadableStore<DialogueUiState>
  advance(): boolean
  choose(responseId: string): boolean
  end(): void
}

// ------------------------------------------------------------------- quest

export interface ObjectiveLike {
  id: string
  description?: string
  target: number
  hidden?: boolean
}

export interface QuestDefinitionLike {
  id: string
  title?: string
  description?: string
  category?: string
  objectives: readonly ObjectiveLike[]
}

export interface ActiveQuestLike {
  questId: string
  startedAt: number
  objectives: Record<string, { current: number; completed: boolean }>
}

export interface QuestUiState {
  definitions: Record<string, QuestDefinitionLike>
  active: Record<string, ActiveQuestLike>
  completed: readonly string[]
}

/** Mirrors @overworld-engine/quest's QuestEngine (read side). */
export interface QuestEngineLike {
  store: ReadableStore<QuestUiState>
}

// --------------------------------------------------------------- inventory

export interface ItemLike {
  id: string
  name: string
  description?: string
  icon?: string
  category?: string
}

export interface InventoryUiState {
  slots: readonly { itemId: string; quantity: number }[]
}

/** Mirrors @overworld-engine/inventory's Inventory. */
export interface InventoryEngineLike {
  store: ReadableStore<InventoryUiState>
  getDefinition(itemId: string): ItemLike | undefined
  use(itemId: string): { success: boolean }
  remove(itemId: string, quantity?: number): boolean
}

// ---------------------------------------------------------------- tutorial

export interface TutorialStepLike {
  id: string
  content?: string
  target?: string
}

export interface TutorialUiState {
  activeTutorialId: string | null
  stepIndex: number
}

/** Mirrors @overworld-engine/tutorial's Tutorial. */
export interface TutorialEngineLike {
  store: ReadableStore<TutorialUiState>
  currentStep(): TutorialStepLike | null
  next(): void
  skip(): void
}

// ------------------------------------------------------------ achievements

export interface AchievementLike {
  id: string
  title?: string
  description?: string
  icon?: string
}

export interface AchievementsUiState {
  unlocked: Record<string, number>
}

/** Mirrors @overworld-engine/achievements' Achievements. */
export interface AchievementsEngineLike {
  store: ReadableStore<AchievementsUiState>
  getDefinition(id: string): AchievementLike | undefined
}

// ----------------------------------------------------------- notifications

export type ToastVariantLike = 'info' | 'success' | 'warning' | 'error'

export interface ToastLike {
  id: string
  message: unknown
  variant: ToastVariantLike
  icon?: string
}

/** Mirrors the state of @overworld-engine/notifications' useToastStore. */
export interface ToastStateLike {
  toasts: readonly ToastLike[]
  dismiss(id: string): void
}

export interface AlertLike {
  id: string
  kind: 'alert' | 'confirm'
  title?: unknown
  message: unknown
  confirmLabel?: string
  cancelLabel?: string
}

/** Mirrors the state of @overworld-engine/notifications' useAlertStore. */
export interface AlertStateLike {
  current: AlertLike | null
  resolveCurrent(result?: boolean): void
}
