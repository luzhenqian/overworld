import type { DialogueTree } from '@overworld-engine/dialogue'
import type { QuestDefinition } from '@overworld-engine/quest'
import type { ItemDefinition } from '@overworld-engine/inventory'
import type { NPCConfig } from '@overworld-engine/scene'
import type { Vec3 } from '@overworld-engine/core'

/**
 * 纯内容数据(starter 裁剪版:去掉 i18n,文案直接内联)。
 * 一切行为都是声明式的 EffectRef / ConditionRef / 事件触发器,由引擎解析。
 */

export const NPCS: NPCConfig[] = [
  {
    id: 'guide',
    name: '向导艾拉',
    // 模型不存在时 BaseNPC 自动回退为主题色胶囊体,示例无需美术资产
    modelPath: '/models/guide.glb',
    position: [6, 0, 6],
    rotation: [0, -Math.PI / 4, 0],
  },
]

/** NPC 交互时打开的对话树 */
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
        speaker: '向导艾拉',
        text: '你好,旅行者!欢迎来到 Overworld 示例村。',
        responses: [
          { id: 'ask', text: '这里是哪里?', next: 'explain' },
          {
            id: 'done',
            text: '水晶都找齐了!',
            conditions: [{ type: 'quest.completed', params: { questId: 'gather-crystals' } }],
            next: 'thanks',
          },
          { id: 'bye', text: '再见。' },
        ],
      },
      {
        id: 'explain',
        speaker: '向导艾拉',
        text: '这是用 @overworld-engine/* 搭的最小示例。村子里散落着 3 颗能量水晶,帮我收集回来吧!',
        responses: [
          {
            id: 'accept',
            text: '没问题,交给我!',
            effects: [{ type: 'quest.start', params: { questId: 'gather-crystals' } }],
          },
          { id: 'later', text: '以后再说。' },
        ],
      },
      {
        id: 'thanks',
        speaker: '向导艾拉',
        text: '太棒了!这些水晶会让村庄重新亮起来。这是给你的报酬!',
        endsDialogue: true,
      },
    ],
  },
]

export const QUESTS: QuestDefinition[] = [
  {
    id: 'welcome',
    category: 'tutorial',
    title: '初来乍到',
    description: '熟悉一下这个世界。',
    autoStart: true,
    objectives: [
      {
        id: 'walk',
        description: '走动 20 米',
        target: 20,
        trigger: { event: 'player:moved', amountFrom: 'distance' },
      },
      {
        id: 'talk',
        description: '与向导艾拉交谈',
        target: 1,
        trigger: { event: 'dialogue:ended', filter: { dialogueId: 'guide-intro' } },
      },
    ],
    rewards: [{ type: 'gold.add', params: { amount: 50 } }],
  },
  {
    id: 'gather-crystals',
    category: 'side',
    title: '收集能量水晶',
    description: '为向导艾拉收集 3 颗能量水晶。',
    objectives: [
      {
        id: 'collect',
        description: '收集能量水晶',
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
    name: '能量水晶',
    description: '蕴含微光的水晶,向导艾拉正在寻找它。',
    category: 'material',
    stackable: true,
    maxStack: 99,
  },
]

/** 可拾取水晶的世界坐标(游戏内容) */
export const CRYSTAL_SPOTS: { id: string; position: Vec3 }[] = [
  { id: 'c1', position: [-8, 0.8, -6] },
  { id: 'c2', position: [10, 0.8, -10] },
  { id: 'c3', position: [-12, 0.8, 10] },
]
