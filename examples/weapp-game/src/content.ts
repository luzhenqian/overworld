/**
 * 纯内容数据 —— 移植自 examples/starter 的水晶收集流程,裁剪为小游戏用:
 * 文案直接内联简体中文(不引 i18n),NPC 不带模型(BaseNPC 自动回退为主题
 * 色胶囊体,小游戏包内无需美术资产)。
 */
import type { Vec3 } from '@overworld-engine/core'
import type { DialogueTree } from '@overworld-engine/dialogue'
import type { ItemDefinition } from '@overworld-engine/inventory'
import type { QuestDefinition } from '@overworld-engine/quest'

/**
 * 本模板的 NPC 描述。`modelPath` 存在时走 useGLTF 加载包内 GLB(向导艾拉演示
 * 真机 GLB 加载 —— 依赖 vendor 里 wx.request 支撑的 XHR/fetch polyfill);省略
 * 时 BaseNPC 回退为主题色胶囊体(长者松)。
 */
export interface WeappNPC {
  id: string
  name: string
  position: Vec3
  rotation?: Vec3
  modelPath?: string
}

export const NPCS: WeappNPC[] = [
  {
    id: 'guide',
    name: '向导艾拉',
    position: [6, 0, 6],
    rotation: [0, -Math.PI / 4, 0],
    modelPath: '/models/ghost.glb',
  },
  { id: 'elder', name: '长者松', position: [-6, 0, 3] },
]

/** 交互时各 NPC 打开的对话树。 */
export const NPC_DIALOGUES: Record<string, string> = {
  guide: 'guide-intro',
  elder: 'elder-chat',
}

export const DIALOGUES: DialogueTree[] = [
  {
    id: 'guide-intro',
    startNodeId: 'hello',
    nodes: [
      {
        id: 'hello',
        speaker: '向导艾拉',
        text: '旅行者你好!这片废墟里散落着能量水晶。',
        responses: [
          { id: 'ask', text: '水晶?说来听听。', next: 'explain' },
          {
            id: 'done',
            text: '水晶都找齐了!',
            conditions: [{ type: 'quest.completed', params: { questId: 'gather-crystals' } }],
            next: 'thanks',
          },
          { id: 'bye', text: '回头再聊。' },
        ],
      },
      {
        id: 'explain',
        speaker: '向导艾拉',
        text: '帮我收集 3 颗水晶,报酬丰厚。',
        responses: [
          {
            id: 'accept',
            text: '包在我身上!',
            effects: [
              { type: 'quest.start', params: { questId: 'gather-crystals' } },
              { type: 'dialogue.adjustRelationship', params: { npcId: 'guide', delta: 1 } },
            ],
          },
          { id: 'later', text: '容我想想。' },
        ],
      },
      {
        id: 'thanks',
        speaker: '向导艾拉',
        text: '太感谢了!这是你应得的报酬。',
        endsDialogue: true,
      },
    ],
  },
  {
    id: 'elder-chat',
    startNodeId: 'mumble',
    nodes: [
      {
        id: 'mumble',
        speaker: '长者松',
        text: '年轻人,夜里的水晶最亮……',
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
    description: '四处走走,再找向导艾拉聊聊。',
    autoStart: true,
    objectives: [
      {
        id: 'walk',
        description: '步行 20 米',
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
    title: '收集水晶',
    description: '为艾拉收集 3 颗能量水晶。',
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
    description: '散发微光的水晶碎片。',
    category: 'material',
    stackable: true,
    maxStack: 99,
  },
]

/** 可拾取水晶的世界坐标(与 starter 相同)。 */
export const CRYSTAL_SPOTS: { id: string; position: Vec3 }[] = [
  { id: 'c1', position: [-8, 0.8, -6] },
  { id: 'c2', position: [10, 0.8, -10] },
  { id: 'c3', position: [-12, 0.8, 10] },
]

export const WORLD_BOUNDS = { minX: -18, maxX: 18, minZ: -18, maxZ: 18 }
