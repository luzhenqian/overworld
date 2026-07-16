import type { ConditionRef, EffectRef } from '@overworld-engine/core'

/**
 * A player choice offered on a dialogue node.
 */
export interface DialogueResponse {
  id: string
  /** Display text. Opaque to the engine — store literal copy or i18n keys. */
  text: string
  /**
   * Conditions (AND semantics) that must pass for the response to appear in
   * `availableResponses`. Evaluated against the engine's context via the
   * condition registry.
   */
  conditions?: ConditionRef[]
  /** Effects run (via the effect registry) when the response is chosen. */
  effects?: EffectRef[]
  /** Node id to jump to. Omit to end the dialogue after choosing. */
  next?: string
}

/**
 * A single line of dialogue plus how the conversation continues from it.
 */
export interface DialogueNode {
  id: string
  /** Optional speaker id/name; opaque to the engine. */
  speaker?: string
  /** Display text. Opaque to the engine — store literal copy or i18n keys. */
  text: string
  /** Player choices. Omit (or leave empty) for linear nodes advanced with `advance()`. */
  responses?: DialogueResponse[]
  /** Node to advance to from a linear node (no responses) via `advance()`. */
  next?: string
  /** Effects run when this node is entered. */
  effects?: EffectRef[]
  /**
   * Mark the node as terminal: `advance()` ends the dialogue here even if
   * `next` is set, and closing via `end()` still counts as completing it.
   */
  endsDialogue?: boolean
}

/**
 * A complete dialogue tree. Content only — no code. Conditions and effects
 * are declarative references resolved through the game's registries.
 */
export interface DialogueTree {
  id: string
  /** Node the conversation starts on. */
  startNodeId: string
  nodes: DialogueNode[]
}

/** The in-flight conversation. Never persisted. */
export interface ActiveDialogue {
  dialogueId: string
  /** NPC the conversation was started with, if any. */
  npcId?: string
  /** Id of the node currently displayed. */
  nodeId: string
  /** Node ids visited before the current one, in order. */
  history: string[]
}
