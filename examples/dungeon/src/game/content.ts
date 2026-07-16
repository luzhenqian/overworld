import type { DialogueTree } from '@overworld/dialogue'
import type { QuestDefinition } from '@overworld/quest'
import type { ItemDefinition } from '@overworld/inventory'

/**
 * 纯内容数据 —— 与 starter 不同,这里直接写中文字面量,不接 i18n,
 * 演示"title/description/text 对引擎是不透明字符串"的另一条路径。
 * 行为全部是声明式 EffectRef / ConditionRef / 事件触发器。
 */

/** NPC id → 交互时打开的对话树。 */
export const NPC_DIALOGUES: Record<string, string> = {
  ghost: 'ghost-intro',
}

export const DIALOGUES: DialogueTree[] = [
  {
    id: 'ghost-intro',
    startNodeId: 'hello',
    nodes: [
      {
        id: 'hello',
        speaker: '幽灵向导',
        text: '活人?好久没见到活人了……这座地牢的宝箱里锁着离开的秘密,可惜我已经用不上了。',
        responses: [
          { id: 'ask', text: '钥匙在哪里?', next: 'hint' },
          { id: 'bye', text: '我这就去找。' },
        ],
      },
      {
        id: 'hint',
        speaker: '幽灵向导',
        text: '钥匙在地牢最深处,跟着地上的微光走就不会迷路。小心巡逻的骷髅守卫——它们不喜欢访客,被抓到三次你就会变成我的同类。',
        endsDialogue: true,
      },
    ],
  },
]

export const QUESTS: QuestDefinition[] = [
  {
    id: 'find-key',
    category: 'main',
    title: '探索地牢',
    description: '在地牢深处找到打开宝箱的钥匙。',
    autoStart: true,
    objectives: [
      {
        id: 'key',
        description: '找到地牢钥匙',
        target: 1,
        trigger: { event: 'item:added', filter: { itemId: 'key' }, amountFrom: 'quantity' },
      },
    ],
    rewards: [{ type: 'gold.add', params: { amount: 100 } }],
    chainNext: ['open-chest'],
  },
  {
    id: 'open-chest',
    category: 'main',
    title: '打开宝箱',
    description: '带着钥匙回到宝箱前,按 E 打开它。',
    prerequisites: {
      quests: ['find-key'],
      conditions: [{ type: 'inventory.has', params: { itemId: 'key' } }],
    },
    objectives: [
      {
        id: 'open',
        description: '打开宝箱',
        target: 1,
        trigger: { event: 'dungeon:chest-opened' },
      },
    ],
    rewards: [{ type: 'gold.add', params: { amount: 300 } }],
  },
]

export const ITEMS: ItemDefinition[] = [
  {
    id: 'key',
    name: '地牢钥匙',
    description: '一把冰冷的黄铜钥匙,能打开地牢深处的宝箱。',
    category: 'quest',
    stackable: false,
  },
  {
    id: 'treasure',
    name: '远古宝藏',
    description: '地牢主人留下的宝藏,离开的秘密就藏在里面。',
    category: 'quest',
    stackable: false,
  },
]
