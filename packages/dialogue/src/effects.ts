import type { EffectFn } from '@overworld/core'
import type { DialogueEngine } from './engine'

/**
 * Built-in effect handlers for the relationship slice. The framework
 * registers nothing by itself — opt in by registering these on your game's
 * effect registry:
 *
 * ```ts
 * const engine = createDialogueEngine({ dialogues, conditions, effects })
 * effects.registerAll(relationshipEffects(engine))
 * ```
 *
 * Content can then reference the handler declaratively:
 *
 * ```ts
 * { type: 'dialogue.adjustRelationship', params: { npcId: 'guide', delta: 5 } }
 * ```
 */
export function relationshipEffects(
  engine: DialogueEngine
): Record<'dialogue.adjustRelationship', EffectFn> {
  return {
    'dialogue.adjustRelationship': (params) => {
      const { npcId, delta } = params
      if (typeof npcId !== 'string' || typeof delta !== 'number') {
        console.warn(
          '[overworld] dialogue.adjustRelationship requires params { npcId: string, delta: number }'
        )
        return
      }
      engine.adjustRelationship(npcId, delta)
    },
  }
}
