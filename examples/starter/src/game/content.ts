import type { DialogueTree } from '@overworld/dialogue'
import type { QuestDefinition } from '@overworld/quest'
import type { ItemDefinition } from '@overworld/inventory'
import type { AchievementDefinition } from '@overworld/achievements'
import type { NPCConfig } from '@overworld/scene'
import type { Vec3 } from '@overworld/core'

/**
 * Pure content data. Everything behavioral is a declarative EffectRef /
 * ConditionRef / event trigger resolved by the engines — no code here.
 */

export const NPCS: NPCConfig[] = [
  {
    id: 'guide',
    name: 'npc.guide.name',
    // 模型不存在时 BaseNPC 自动回退为主题色胶囊体,示例无需美术资产
    modelPath: '/models/guide.glb',
    position: [6, 0, 6],
    rotation: [0, -Math.PI / 4, 0],
  },
]

/** Which dialogue tree an NPC opens when interacted with. */
export const NPC_DIALOGUES: Record<string, string> = {
  guide: 'guide-intro',
}

export const DIALOGUES: DialogueTree[] = [
  {
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
        speaker: 'npc.guide.name',
        text: 'dlg.guideIntro.explain',
        responses: [
          {
            id: 'accept',
            text: 'dlg.guideIntro.r.accept',
            effects: [
              { type: 'quest.start', params: { questId: 'gather-crystals' } },
              { type: 'dialogue.adjustRelationship', params: { npcId: 'guide', delta: 1 } },
            ],
          },
          { id: 'later', text: 'dlg.guideIntro.r.later' },
        ],
      },
      {
        id: 'thanks',
        speaker: 'npc.guide.name',
        text: 'dlg.guideIntro.thanks',
        endsDialogue: true,
      },
    ],
  },
]

export const QUESTS: QuestDefinition[] = [
  {
    id: 'welcome',
    category: 'tutorial',
    title: 'quest.welcome.title',
    description: 'quest.welcome.desc',
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
        description: 'quest.welcome.obj.talk',
        target: 1,
        trigger: { event: 'dialogue:ended', filter: { dialogueId: 'guide-intro' } },
      },
    ],
    rewards: [{ type: 'gold.add', params: { amount: 50 } }],
  },
  {
    id: 'gather-crystals',
    category: 'side',
    title: 'quest.gather.title',
    description: 'quest.gather.desc',
    objectives: [
      {
        id: 'collect',
        description: 'quest.gather.obj.collect',
        target: 3,
        trigger: { event: 'item:added', filter: { itemId: 'crystal' }, amountFrom: 'quantity' },
      },
    ],
    rewards: [{ type: 'gold.add', params: { amount: 200 } }],
  },
]

export const ITEMS: ItemDefinition[] = [
  {
    id: 'crystal',
    name: 'item.crystal.name',
    description: 'item.crystal.desc',
    category: 'material',
    stackable: true,
    maxStack: 99,
  },
]

export const ACHIEVEMENTS: AchievementDefinition[] = [
  {
    id: 'first-steps',
    title: 'ach.firstSteps.title',
    description: 'ach.firstSteps.desc',
    trigger: { event: 'player:moved', amountFrom: 'distance', count: 10 },
  },
  {
    id: 'crystal-collector',
    title: 'ach.collector.title',
    description: 'ach.collector.desc',
    trigger: { event: 'item:added', filter: { itemId: 'crystal' }, amountFrom: 'quantity', count: 3 },
  },
]

/** World placement of collectible crystals (game content). */
export const CRYSTAL_SPOTS: { id: string; position: Vec3 }[] = [
  { id: 'c1', position: [-8, 0.8, -6] },
  { id: 'c2', position: [10, 0.8, -10] },
  { id: 'c3', position: [-12, 0.8, 10] },
]
