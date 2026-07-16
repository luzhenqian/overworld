import { describe, expect, it } from 'vitest'
import {
  achievementDefinitionSchema,
  achievementDefinitionsSchema,
  allContentSchemas,
  conditionRefSchema,
  contentBundleSchema,
  dialogueTreeSchema,
  dialogueTreesSchema,
  effectRefSchema,
  itemDefinitionSchema,
  itemDefinitionsSchema,
  questDefinitionSchema,
  questDefinitionsSchema,
  sceneConfigSchema,
  sceneProjectSchema,
  schemaFor,
} from '../jsonSchemas'
import type { JsonSchema } from '../jsonSchemas'

/**
 * Minimal structural JSON Schema checker — devtools deliberately has no ajv
 * dependency, so the tests exercise the schemas with just enough of draft
 * 2020-12: type / required / properties / items / enum / oneOf / minimum and
 * document-local `#/$defs/...` refs. Returns human-readable error strings.
 */
function check(schema: JsonSchema, data: unknown, root: JsonSchema = schema): string[] {
  if (typeof schema.$ref === 'string') {
    const defs = (root.$defs ?? {}) as Record<string, JsonSchema>
    const target = defs[schema.$ref.replace('#/$defs/', '')]
    return target ? check(target, data, root) : [`unresolvable $ref "${schema.$ref}"`]
  }
  if (Array.isArray(schema.oneOf)) {
    const branches = schema.oneOf as JsonSchema[]
    return branches.some((branch) => check(branch, data, root).length === 0)
      ? []
      : ['oneOf: no branch matched']
  }
  if (Array.isArray(schema.enum) && !schema.enum.includes(data)) {
    return [`enum: ${JSON.stringify(data)} not allowed`]
  }
  const actualType = data === null ? 'null' : Array.isArray(data) ? 'array' : typeof data
  if (typeof schema.type === 'string' && schema.type !== actualType) {
    return [`expected type ${schema.type}, got ${actualType}`]
  }
  const errors: string[] = []
  if (actualType === 'object') {
    const obj = data as Record<string, unknown>
    for (const key of (schema.required as string[] | undefined) ?? []) {
      if (!(key in obj)) errors.push(`missing required "${key}"`)
    }
    const properties = (schema.properties ?? {}) as Record<string, JsonSchema>
    for (const [key, sub] of Object.entries(properties)) {
      if (key in obj) errors.push(...check(sub, obj[key], root).map((e) => `${key}: ${e}`))
    }
  }
  if (actualType === 'array' && schema.items !== undefined) {
    ;(data as unknown[]).forEach((entry, index) => {
      errors.push(...check(schema.items as JsonSchema, entry, root).map((e) => `[${index}] ${e}`))
    })
  }
  if (typeof data === 'number' && typeof schema.minimum === 'number' && data < schema.minimum) {
    errors.push(`minimum: ${data} < ${schema.minimum}`)
  }
  return errors
}

// --- Starter-shaped content (ported from examples/starter content.ts) -------

const guideIntroDialogue = {
  id: 'guide-intro',
  startNodeId: 'hello',
  nodes: [
    {
      id: 'hello',
      speaker: 'npc.guide.name',
      text: 'dlg.guideIntro.hello',
      responses: [
        { id: 'ask', text: 'dlg.guideIntro.r.ask', next: 'explain' },
        {
          id: 'done',
          text: 'dlg.guideIntro.r.done',
          conditions: [{ type: 'quest.completed', params: { questId: 'gather-crystals' } }],
          next: 'thanks',
        },
        { id: 'bye', text: 'dlg.guideIntro.r.bye' },
      ],
    },
    {
      id: 'explain',
      text: 'dlg.guideIntro.explain',
      responses: [
        {
          id: 'accept',
          text: 'dlg.guideIntro.r.accept',
          effects: [{ type: 'quest.start', params: { questId: 'gather-crystals' } }],
        },
      ],
    },
    { id: 'thanks', text: 'dlg.guideIntro.thanks', endsDialogue: true },
  ],
}

const welcomeQuest = {
  id: 'welcome',
  category: 'tutorial',
  title: 'quest.welcome.title',
  autoStart: true,
  objectives: [
    {
      id: 'walk',
      description: 'quest.welcome.obj.walk',
      target: 20,
      trigger: { event: 'player:moved', amountFrom: 'distance' },
    },
    {
      id: 'talk',
      target: 1,
      trigger: { event: 'dialogue:ended', filter: { dialogueId: 'guide-intro' } },
    },
  ],
  rewards: [{ type: 'gold.add', params: { amount: 50 } }],
  chainNext: ['gather-crystals'],
}

const gatedQuest = {
  id: 'gather-crystals',
  prerequisites: { quests: ['welcome'], conditions: [{ type: 'flag.set', negate: true }] },
  objectives: [
    {
      id: 'collect',
      target: 3,
      trigger: { event: 'item:added', filter: { itemId: 'crystal' }, amountFrom: 'quantity' },
    },
  ],
}

const potionItem = {
  id: 'potion',
  name: 'item.potion.name',
  description: 'item.potion.desc',
  category: 'consumable',
  stackable: true,
  maxStack: 99,
  useEffects: [{ type: 'hp.restore', params: { amount: 10 } }],
  consumable: true,
  metadata: { rarity: 'common' },
}

const countedAchievement = {
  id: 'crystal-collector',
  title: 'ach.collector.title',
  trigger: { event: 'item:added', filter: { itemId: 'crystal' }, amountFrom: 'quantity', count: 3 },
  rewards: [{ type: 'gold.add', params: { amount: 25 } }],
}

const manualAchievement = { id: 'secret', title: 'ach.secret.title', hidden: true, trigger: null }

const starterScene = {
  npcs: [
    {
      id: 'guide',
      modelPath: '/models/guide.glb',
      position: [4, 0, 2],
      rotation: [0, Math.PI, 0],
      scale: 1.2,
      name: '向导',
    },
    { id: 'merchant', modelPath: '', position: [-4, 0, 3], rotation: [0, 0, 0] },
  ],
  buildings: [
    {
      id: 'bank',
      name: '银行',
      modelPath: '/models/bank.glb',
      position: [0, 0, -8],
      rotation: [0, 0, 0],
      scale: 2,
      collisionRadius: 5,
    },
  ],
  decorations: {
    tree: { radius: 0.8, instances: [{ position: [1, 0, 1] }, { position: [2, 0, 2], scale: 1.5 }] },
  },
}

// ----------------------------------------------------------------------------

describe('jsonSchemas: valid starter-shaped content passes', () => {
  it('accepts a dialogue tree with conditions/effects/endsDialogue', () => {
    expect(check(dialogueTreeSchema, guideIntroDialogue)).toEqual([])
    expect(check(dialogueTreesSchema, [guideIntroDialogue])).toEqual([])
  })

  it('accepts quests with trigger/filter/amountFrom and prerequisites', () => {
    expect(check(questDefinitionSchema, welcomeQuest)).toEqual([])
    expect(check(questDefinitionsSchema, [welcomeQuest, gatedQuest])).toEqual([])
  })

  it('accepts an item with useEffects/consumable/metadata', () => {
    expect(check(itemDefinitionSchema, potionItem)).toEqual([])
    expect(check(itemDefinitionsSchema, [potionItem])).toEqual([])
  })

  it('accepts achievements with a counted trigger and with trigger: null', () => {
    expect(check(achievementDefinitionSchema, countedAchievement)).toEqual([])
    expect(check(achievementDefinitionSchema, manualAchievement)).toEqual([])
    expect(check(achievementDefinitionsSchema, [countedAchievement, manualAchievement])).toEqual([])
  })

  it('accepts extra game-specific fields (additionalProperties: true)', () => {
    expect(check(itemDefinitionSchema, { ...potionItem, sellPrice: 12 })).toEqual([])
    expect(check(questDefinitionSchema, { ...welcomeQuest, giver: 'guide' })).toEqual([])
  })

  it('accepts a whole content bundle (all sections optional)', () => {
    const bundle = {
      dialogues: [guideIntroDialogue],
      quests: [welcomeQuest, gatedQuest],
      items: [potionItem],
      achievements: [countedAchievement, manualAchievement],
    }
    expect(check(contentBundleSchema, bundle)).toEqual([])
    expect(check(contentBundleSchema, { quests: [gatedQuest] })).toEqual([])
    expect(check(contentBundleSchema, {})).toEqual([])
  })

  it('accepts bare effect/condition refs', () => {
    expect(check(effectRefSchema, { type: 'gold.add', params: { amount: 5 } })).toEqual([])
    expect(check(conditionRefSchema, { type: 'quest.completed', negate: true })).toEqual([])
  })

  it('accepts a starter-shaped scene (npcs + building + decorations)', () => {
    expect(check(sceneConfigSchema, starterScene)).toEqual([])
    expect(check(sceneConfigSchema, { npcs: [] })).toEqual([])
  })

  it('accepts a multi-scene project embedding starter-shaped scenes', () => {
    const project = {
      version: 1,
      activeSceneId: 'level-1',
      scenes: [
        { id: 'level-1', name: '起始关', scene: starterScene },
        { id: 'level-2', name: 'Boss 关', scene: { npcs: [] } },
      ],
    }
    expect(check(sceneProjectSchema, project)).toEqual([])
    expect(check(sceneProjectSchema, { scenes: [] })).toEqual([])
  })
})

describe('jsonSchemas: invalid content fails', () => {
  it('rejects a quest missing objectives', () => {
    const { objectives: _omitted, ...questWithout } = welcomeQuest
    expect(check(questDefinitionSchema, questWithout)).toEqual(['missing required "objectives"'])
  })

  it('rejects objective target 0 (minimum: 1, mirroring validateQuests)', () => {
    const quest = { id: 'q', objectives: [{ id: 'o', target: 0 }] }
    const errors = check(questDefinitionSchema, quest)
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('target')
    expect(errors[0]).toContain('minimum')
  })

  it('rejects a dialogue node missing id', () => {
    const tree = {
      id: 't',
      startNodeId: 'a',
      nodes: [{ text: 'dlg.hello' }],
    }
    expect(check(dialogueTreeSchema, tree)).toEqual(['nodes: [0] missing required "id"'])
  })

  it('rejects achievement trigger.count 0 and a missing trigger field', () => {
    const zeroCount = { id: 'a', trigger: { event: 'player:moved', count: 0 } }
    // count 0 fails the trigger branch and null fails the other -> oneOf error
    expect(check(achievementDefinitionSchema, zeroCount)).toEqual([
      'trigger: oneOf: no branch matched',
    ])
    expect(check(achievementDefinitionSchema, { id: 'a' })).toEqual([
      'missing required "trigger"',
    ])
  })

  it('rejects an effect ref missing type', () => {
    expect(check(effectRefSchema, { params: { amount: 5 } })).toEqual(['missing required "type"'])
    const item = { id: 'p', name: 'n', useEffects: [{ params: {} }] }
    expect(check(itemDefinitionSchema, item)).toEqual([
      'useEffects: [0] missing required "type"',
    ])
  })

  it('rejects wrong top-level types', () => {
    expect(check(dialogueTreesSchema, guideIntroDialogue)).toEqual([
      'expected type array, got object',
    ])
    expect(check(questDefinitionSchema, [welcomeQuest])).toEqual([
      'expected type object, got array',
    ])
  })

  it('rejects a scene missing npcs, and an npc missing modelPath', () => {
    expect(check(sceneConfigSchema, { buildings: [] })).toEqual(['missing required "npcs"'])
    const scene = { npcs: [{ id: 'a', position: [0, 0, 0], rotation: [0, 0, 0] }] }
    expect(check(sceneConfigSchema, scene)).toEqual(['npcs: [0] missing required "modelPath"'])
  })

  it('rejects a project missing scenes, and a scene entry missing id/name/scene', () => {
    expect(check(sceneProjectSchema, { version: 1 })).toEqual(['missing required "scenes"'])
    expect(check(sceneProjectSchema, { scenes: [{ name: 'x', scene: { npcs: [] } }] })).toEqual([
      'scenes: [0] missing required "id"',
    ])
    expect(check(sceneProjectSchema, { scenes: [{ id: 'a', name: 'x' }] })).toEqual([
      'scenes: [0] missing required "scene"',
    ])
  })
})

describe('jsonSchemas: registry and metadata', () => {
  it('allContentSchemas contains every schema by name', () => {
    expect(Object.keys(allContentSchemas).sort()).toEqual([
      'achievementDefinition',
      'achievementDefinitions',
      'conditionRef',
      'contentBundle',
      'dialogueTree',
      'dialogueTrees',
      'effectRef',
      'itemDefinition',
      'itemDefinitions',
      'questDefinition',
      'questDefinitions',
      'sceneConfig',
      'sceneProject',
    ])
  })

  it('every schema declares draft 2020-12 and a unique $id', () => {
    const ids = Object.values(allContentSchemas).map((schema) => {
      expect(schema.$schema).toBe('https://json-schema.org/draft/2020-12/schema')
      expect(schema.$id).toMatch(/^https:\/\/overworld\.dev\/schemas\/[a-z-]+\.json$/)
      return schema.$id
    })
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('array wrappers use the -list $id suffix', () => {
    expect(dialogueTreesSchema.$id).toBe('https://overworld.dev/schemas/dialogue-tree-list.json')
    expect(questDefinitionsSchema.$id).toBe(
      'https://overworld.dev/schemas/quest-definition-list.json'
    )
  })

  it('schemaFor maps content kinds to the array-wrapper schemas', () => {
    expect(schemaFor('dialogues')).toBe(dialogueTreesSchema)
    expect(schemaFor('quests')).toBe(questDefinitionsSchema)
    expect(schemaFor('items')).toBe(itemDefinitionsSchema)
    expect(schemaFor('achievements')).toBe(achievementDefinitionsSchema)
    expect(schemaFor('scene')).toBe(sceneConfigSchema)
    expect(schemaFor('scene-project')).toBe(sceneProjectSchema)
  })
})
