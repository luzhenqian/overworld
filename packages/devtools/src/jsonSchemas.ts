/**
 * Hand-written JSON Schemas (draft 2020-12) for Overworld content files.
 *
 * These describe the **real** content schemas — `DialogueTree`
 * (`@overworld/dialogue`), `QuestDefinition` (`@overworld/quest`),
 * `ItemDefinition` (`@overworld/inventory`), `AchievementDefinition`
 * (`@overworld/achievements`) and `EffectRef` / `ConditionRef`
 * (`@overworld/core`) — so games can author content as plain `.json` files
 * and validate/autocomplete them outside TypeScript (ajv, editors via
 * `$schema`, CI).
 *
 * The schemas are **plain data**: devtools deliberately ships no validator
 * dependency (its only runtime dependency stays `@overworld/core`). Feed them
 * to any draft 2020-12 validator, e.g. ajv:
 *
 * ```ts
 * import Ajv from 'ajv/dist/2020'
 * import { questDefinitionsSchema } from '@overworld/devtools'
 *
 * const validate = new Ajv().compile(questDefinitionsSchema)
 * if (!validate(JSON.parse(fs.readFileSync('quests.json', 'utf8')))) {
 *   console.error(validate.errors)
 * }
 * ```
 *
 * ## Fidelity notes
 *
 * - **`additionalProperties: true` everywhere.** TypeScript interfaces are
 *   structurally open — a value with extra fields is still assignable — and
 *   Overworld content types are explicitly meant to be extended by games
 *   (e.g. `ItemDefinition.metadata`, extra display fields read by game UIs).
 *   `true` is also the JSON Schema default; it is spelled out so nobody
 *   "tightens" it by accident and breaks extended content.
 * - **Numbers, not integers.** `objective.target`, `trigger.count` and
 *   `maxStack` are `number` in TS and the devtools validators only enforce
 *   `>= 1`, never integrality — the schemas mirror that (`type: 'number'`).
 * - **`minimum: 1`** on `objective.target` and `achievementTrigger.count`
 *   mirrors the hard *errors* in `validateQuests` / `validateAchievements`.
 *   `maxStack < 1` is only a *warning* there, so it is not constrained here.
 * - **`trigger: AchievementTrigger | null`** is required on achievements
 *   (matching the real `AchievementDefinition`; `null` = manual-only unlock)
 *   and expressed as `oneOf: [trigger, null]`.
 * - Each exported schema is **self-contained**: shared shapes (`EffectRef`,
 *   `ConditionRef`, nodes, objectives…) are embedded per schema under
 *   `$defs` with document-local `$ref`s, so every schema can be handed to a
 *   validator or editor on its own, in any order.
 *
 * Cross-object rules (id uniqueness, dangling `next`, prerequisite cycles…)
 * are beyond JSON Schema — run `validateContent` on the parsed data for
 * those.
 */

/** A JSON Schema document or subschema, represented as plain data. */
export type JsonSchema = { [key: string]: unknown }

const DRAFT = 'https://json-schema.org/draft/2020-12/schema'
const BASE = 'https://overworld.dev/schemas/'

// ---------------------------------------------------------------------------
// Shared $defs building blocks (no $id/$schema — embedded per schema)
// ---------------------------------------------------------------------------

/** `EffectRef` from `@overworld/core`. */
const effectRefDef: JsonSchema = {
  type: 'object',
  description: 'Declarative reference to a registered effect handler.',
  properties: {
    type: { type: 'string', description: 'Registered effect type, e.g. "quest.start".' },
    params: { type: 'object', description: 'Handler parameters (free-form).' },
  },
  required: ['type'],
  additionalProperties: true,
}

/** `ConditionRef` from `@overworld/core`. */
const conditionRefDef: JsonSchema = {
  type: 'object',
  description: 'Declarative reference to a registered condition handler.',
  properties: {
    type: { type: 'string', description: 'Registered condition type.' },
    params: { type: 'object', description: 'Handler parameters (free-form).' },
    negate: { type: 'boolean', description: 'Invert the result of the condition.' },
  },
  required: ['type'],
  additionalProperties: true,
}

/** `DialogueResponse` from `@overworld/dialogue`. */
const dialogueResponseDef: JsonSchema = {
  type: 'object',
  description: 'A player choice offered on a dialogue node.',
  properties: {
    id: { type: 'string' },
    text: { type: 'string', description: 'Display text — literal copy or an i18n key.' },
    conditions: {
      type: 'array',
      items: { $ref: '#/$defs/conditionRef' },
      description: 'AND-semantics visibility conditions.',
    },
    effects: {
      type: 'array',
      items: { $ref: '#/$defs/effectRef' },
      description: 'Effects run when the response is chosen.',
    },
    next: { type: 'string', description: 'Node id to jump to; omit to end the dialogue.' },
  },
  required: ['id', 'text'],
  additionalProperties: true,
}

/** `DialogueNode` from `@overworld/dialogue`. */
const dialogueNodeDef: JsonSchema = {
  type: 'object',
  description: 'A single line of dialogue plus how the conversation continues.',
  properties: {
    id: { type: 'string' },
    speaker: { type: 'string', description: 'Optional speaker id/name; opaque to the engine.' },
    text: { type: 'string', description: 'Display text — literal copy or an i18n key.' },
    responses: { type: 'array', items: { $ref: '#/$defs/dialogueResponse' } },
    next: { type: 'string', description: 'Node advanced to from a linear node via advance().' },
    effects: {
      type: 'array',
      items: { $ref: '#/$defs/effectRef' },
      description: 'Effects run when this node is entered.',
    },
    endsDialogue: { type: 'boolean', description: 'Terminal node: advance() ends the dialogue here.' },
  },
  required: ['id', 'text'],
  additionalProperties: true,
}

/** `DialogueTree` from `@overworld/dialogue`. */
const dialogueTreeDef: JsonSchema = {
  type: 'object',
  description: 'A complete dialogue tree. Content only — no code.',
  properties: {
    id: { type: 'string' },
    startNodeId: { type: 'string', description: 'Node the conversation starts on.' },
    nodes: { type: 'array', items: { $ref: '#/$defs/dialogueNode' } },
  },
  required: ['id', 'startNodeId', 'nodes'],
  additionalProperties: true,
}

/** `ObjectiveTrigger` from `@overworld/quest`. */
const objectiveTriggerDef: JsonSchema = {
  type: 'object',
  description: 'Declarative event-bus trigger that auto-advances an objective.',
  properties: {
    event: { type: 'string', description: 'Event name on the (possibly game-extended) event map.' },
    filter: {
      type: 'object',
      description: 'Shallow-equality match on payload fields; all keys must match.',
    },
    amountFrom: {
      type: 'string',
      description: 'Payload key whose numeric value is added to progress; omit for +1 per event.',
    },
  },
  required: ['event'],
  additionalProperties: true,
}

/** `ObjectiveDefinition` from `@overworld/quest`. */
const objectiveDef: JsonSchema = {
  type: 'object',
  description: 'One requirement of a quest.',
  properties: {
    id: { type: 'string' },
    description: { type: 'string', description: 'Display text — literal copy or an i18n key.' },
    target: {
      type: 'number',
      minimum: 1,
      description: 'Progress value at which the objective completes (>= 1).',
    },
    trigger: { $ref: '#/$defs/objectiveTrigger' },
    hidden: { type: 'boolean', description: 'Hint for UIs to hide the objective until revealed.' },
  },
  required: ['id', 'target'],
  additionalProperties: true,
}

/** `QuestPrerequisites` from `@overworld/quest`. */
const questPrerequisitesDef: JsonSchema = {
  type: 'object',
  description: 'Requirements that gate starting a quest.',
  properties: {
    quests: {
      type: 'array',
      items: { type: 'string' },
      description: 'Quest ids that must all be completed first.',
    },
    conditions: {
      type: 'array',
      items: { $ref: '#/$defs/conditionRef' },
      description: 'AND-semantics conditions evaluated against the engine context.',
    },
  },
  additionalProperties: true,
}

/** `QuestDefinition` from `@overworld/quest`. */
const questDef: JsonSchema = {
  type: 'object',
  description: 'A quest. Content only — rewards/prerequisites are declarative refs.',
  properties: {
    id: { type: 'string' },
    category: { type: 'string', description: "Free-form grouping tag (e.g. 'tutorial', 'side')." },
    title: { type: 'string', description: 'Display title — literal copy or an i18n key.' },
    description: { type: 'string' },
    prerequisites: { $ref: '#/$defs/questPrerequisites' },
    objectives: { type: 'array', items: { $ref: '#/$defs/objective' } },
    rewards: {
      type: 'array',
      items: { $ref: '#/$defs/effectRef' },
      description: 'Effects run when the quest completes.',
    },
    autoStart: { type: 'boolean', description: 'Start automatically on engine init/registration.' },
    chainNext: {
      type: 'array',
      items: { type: 'string' },
      description: 'Quest ids auto-started after completion.',
    },
  },
  required: ['id', 'objectives'],
  additionalProperties: true,
}

/** `ItemDefinition` from `@overworld/inventory`. */
const itemDef: JsonSchema = {
  type: 'object',
  description: 'Static definition of an item.',
  properties: {
    id: { type: 'string' },
    name: { type: 'string', description: 'Display name — literal copy or an i18n key.' },
    description: { type: 'string' },
    icon: { type: 'string', description: 'Icon hint for the UI (emoji, sprite id, URL).' },
    category: { type: 'string', description: "Free-form grouping key (e.g. 'consumable')." },
    stackable: { type: 'boolean', description: 'Whether multiple copies share a slot. Default true.' },
    maxStack: {
      type: 'number',
      description: 'Maximum quantity per slot; should be >= 1 (validateItems warns otherwise).',
    },
    useEffects: {
      type: 'array',
      items: { $ref: '#/$defs/effectRef' },
      description: 'Effects executed by use() through the effect registry.',
    },
    consumable: { type: 'boolean', description: 'Whether use() removes one copy. Default false.' },
    metadata: { type: 'object', description: 'Arbitrary game-specific data.' },
  },
  required: ['id', 'name'],
  additionalProperties: true,
}

/** `AchievementTrigger` from `@overworld/achievements`. */
const achievementTriggerDef: JsonSchema = {
  type: 'object',
  description: 'Declarative unlock trigger fed by bus events.',
  properties: {
    event: { type: 'string', description: 'Event name on the (possibly game-extended) event map.' },
    filter: {
      type: 'object',
      description: 'Shallow-equality match on payload fields; all keys must match.',
    },
    count: {
      type: 'number',
      minimum: 1,
      description: 'Progress required to unlock (>= 1). Default 1.',
    },
    amountFrom: {
      type: 'string',
      description: 'Payload key whose numeric value contributes to progress; omit for +1 per event.',
    },
  },
  required: ['event'],
  additionalProperties: true,
}

/** `AchievementDefinition` from `@overworld/achievements`. */
const achievementDef: JsonSchema = {
  type: 'object',
  description: 'Static definition of an achievement.',
  properties: {
    id: { type: 'string' },
    title: { type: 'string', description: 'Display title — literal copy or an i18n key.' },
    description: { type: 'string' },
    icon: { type: 'string', description: 'Icon hint for the UI (emoji, sprite id, URL).' },
    hidden: { type: 'boolean', description: 'Hint for UIs to hide the achievement until unlocked.' },
    trigger: {
      oneOf: [{ $ref: '#/$defs/achievementTrigger' }, { type: 'null' }],
      description: 'Event-driven unlock trigger, or null for manual-only unlocking.',
    },
    rewards: {
      type: 'array',
      items: { $ref: '#/$defs/effectRef' },
      description: 'Effects executed through the effect registry when unlocked.',
    },
  },
  required: ['id', 'trigger'],
  additionalProperties: true,
}

// $defs subsets each schema needs to be self-contained.
const refDefs = { effectRef: effectRefDef, conditionRef: conditionRefDef }
const dialogueDefs = {
  ...refDefs,
  dialogueResponse: dialogueResponseDef,
  dialogueNode: dialogueNodeDef,
}
const questDefs = {
  ...refDefs,
  objectiveTrigger: objectiveTriggerDef,
  objective: objectiveDef,
  questPrerequisites: questPrerequisitesDef,
}
const itemDefs = { effectRef: effectRefDef }
const achievementDefs = { effectRef: effectRefDef, achievementTrigger: achievementTriggerDef }

// ---------------------------------------------------------------------------
// Single-object schemas
// ---------------------------------------------------------------------------

/** JSON Schema for a single `EffectRef` (`@overworld/core`). */
export const effectRefSchema: JsonSchema = {
  $id: `${BASE}effect-ref.json`,
  $schema: DRAFT,
  title: 'Overworld EffectRef',
  ...effectRefDef,
}

/** JSON Schema for a single `ConditionRef` (`@overworld/core`). */
export const conditionRefSchema: JsonSchema = {
  $id: `${BASE}condition-ref.json`,
  $schema: DRAFT,
  title: 'Overworld ConditionRef',
  ...conditionRefDef,
}

/** JSON Schema for a single `DialogueTree` (`@overworld/dialogue`). */
export const dialogueTreeSchema: JsonSchema = {
  $id: `${BASE}dialogue-tree.json`,
  $schema: DRAFT,
  title: 'Overworld DialogueTree',
  ...dialogueTreeDef,
  $defs: dialogueDefs,
}

/** JSON Schema for a single `QuestDefinition` (`@overworld/quest`). */
export const questDefinitionSchema: JsonSchema = {
  $id: `${BASE}quest-definition.json`,
  $schema: DRAFT,
  title: 'Overworld QuestDefinition',
  ...questDef,
  $defs: questDefs,
}

/** JSON Schema for a single `ItemDefinition` (`@overworld/inventory`). */
export const itemDefinitionSchema: JsonSchema = {
  $id: `${BASE}item-definition.json`,
  $schema: DRAFT,
  title: 'Overworld ItemDefinition',
  ...itemDef,
  $defs: itemDefs,
}

/** JSON Schema for a single `AchievementDefinition` (`@overworld/achievements`). */
export const achievementDefinitionSchema: JsonSchema = {
  $id: `${BASE}achievement-definition.json`,
  $schema: DRAFT,
  title: 'Overworld AchievementDefinition',
  ...achievementDef,
  $defs: achievementDefs,
}

// ---------------------------------------------------------------------------
// Array-wrapper schemas — the shape of a whole content .json file
// ---------------------------------------------------------------------------

/** JSON Schema for a `DialogueTree[]` content file. */
export const dialogueTreesSchema: JsonSchema = {
  $id: `${BASE}dialogue-tree-list.json`,
  $schema: DRAFT,
  title: 'Overworld DialogueTree list',
  type: 'array',
  items: { $ref: '#/$defs/dialogueTree' },
  $defs: { ...dialogueDefs, dialogueTree: dialogueTreeDef },
}

/** JSON Schema for a `QuestDefinition[]` content file. */
export const questDefinitionsSchema: JsonSchema = {
  $id: `${BASE}quest-definition-list.json`,
  $schema: DRAFT,
  title: 'Overworld QuestDefinition list',
  type: 'array',
  items: { $ref: '#/$defs/questDefinition' },
  $defs: { ...questDefs, questDefinition: questDef },
}

/** JSON Schema for an `ItemDefinition[]` content file. */
export const itemDefinitionsSchema: JsonSchema = {
  $id: `${BASE}item-definition-list.json`,
  $schema: DRAFT,
  title: 'Overworld ItemDefinition list',
  type: 'array',
  items: { $ref: '#/$defs/itemDefinition' },
  $defs: { ...itemDefs, itemDefinition: itemDef },
}

/** JSON Schema for an `AchievementDefinition[]` content file. */
export const achievementDefinitionsSchema: JsonSchema = {
  $id: `${BASE}achievement-definition-list.json`,
  $schema: DRAFT,
  title: 'Overworld AchievementDefinition list',
  type: 'array',
  items: { $ref: '#/$defs/achievementDefinition' },
  $defs: { ...achievementDefs, achievementDefinition: achievementDef },
}

// ---------------------------------------------------------------------------
// Content bundle — mirrors devtools' ContentBundle
// ---------------------------------------------------------------------------

/**
 * JSON Schema for a whole content bundle
 * `{ dialogues?, quests?, items?, achievements? }` — the same shape
 * `validateContent` takes. Every section is optional.
 */
export const contentBundleSchema: JsonSchema = {
  $id: `${BASE}content-bundle.json`,
  $schema: DRAFT,
  title: 'Overworld content bundle',
  type: 'object',
  properties: {
    dialogues: { type: 'array', items: { $ref: '#/$defs/dialogueTree' } },
    quests: { type: 'array', items: { $ref: '#/$defs/questDefinition' } },
    items: { type: 'array', items: { $ref: '#/$defs/itemDefinition' } },
    achievements: { type: 'array', items: { $ref: '#/$defs/achievementDefinition' } },
  },
  additionalProperties: true,
  $defs: {
    ...dialogueDefs,
    ...questDefs,
    ...achievementDefs,
    dialogueTree: dialogueTreeDef,
    questDefinition: questDef,
    itemDefinition: itemDef,
    achievementDefinition: achievementDef,
  },
}

// ---------------------------------------------------------------------------
// Convenience exports
// ---------------------------------------------------------------------------

/** Every exported schema keyed by name, for iteration (e.g. writing them to disk). */
export const allContentSchemas: Record<string, JsonSchema> = {
  effectRef: effectRefSchema,
  conditionRef: conditionRefSchema,
  dialogueTree: dialogueTreeSchema,
  dialogueTrees: dialogueTreesSchema,
  questDefinition: questDefinitionSchema,
  questDefinitions: questDefinitionsSchema,
  itemDefinition: itemDefinitionSchema,
  itemDefinitions: itemDefinitionsSchema,
  achievementDefinition: achievementDefinitionSchema,
  achievementDefinitions: achievementDefinitionsSchema,
  contentBundle: contentBundleSchema,
}

/** Content-file kinds, matching the `ContentBundle` section names. */
export type ContentKind = 'dialogues' | 'quests' | 'items' | 'achievements'

const schemasByKind: Record<ContentKind, JsonSchema> = {
  dialogues: dialogueTreesSchema,
  quests: questDefinitionsSchema,
  items: itemDefinitionsSchema,
  achievements: achievementDefinitionsSchema,
}

/**
 * The array-wrapper schema for one content-file kind — handy when validating
 * a directory of `dialogues.json` / `quests.json` / … files in a loop.
 */
export function schemaFor(kind: ContentKind): JsonSchema {
  return schemasByKind[kind]
}
