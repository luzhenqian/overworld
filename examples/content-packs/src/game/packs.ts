import { defineContentPack, type ContentPack } from '@overworld-engine/content'
import type { DialogueTree } from '@overworld-engine/dialogue'
import type { QuestDefinition } from '@overworld-engine/quest'
import type { ItemDefinition } from '@overworld-engine/inventory'
import type { AchievementDefinition } from '@overworld-engine/achievements'

/**
 * 内容包(纯数据)。所有行为都是声明式 EffectRef / 事件触发器,由引擎解析——
 * 这里没有任何代码。基础包在启动时应用;v2 从 /packs/v2.json 拉取后热更;
 * 非法包用于演示校验门禁拦截坏数据。
 *
 * 内容用引擎的真实类型(DialogueTree / QuestDefinition …)编写 —— 它们结构上
 * 可直接赋给 ContentPack 的 `*Like` 段类型,不必额外转换。content 包本身不 import
 * 引擎类型(改用 devtools 的结构化子集),此处是「游戏侧」故可自由引用。
 */

const BASE_DIALOGUES: DialogueTree[] = [
  {
    id: 'elder-intro',
    startNodeId: 'hello',
    nodes: [
      {
        id: 'hello',
        speaker: '村长',
        text: '欢迎来到小镇。先跟我聊两句吧。',
        responses: [
          { id: 'ok', text: '你好!', next: 'bye' },
          { id: 'leave', text: '先走了。' },
        ],
      },
      { id: 'bye', speaker: '村长', text: '有事随时来找我。', endsDialogue: true },
    ],
  },
]

const BASE_QUESTS: QuestDefinition[] = [
  {
    id: 'welcome',
    category: 'tutorial',
    title: '初来乍到',
    description: '和村长打个招呼。',
    autoStart: true,
    objectives: [
      {
        id: 'talk',
        description: '与村长对话',
        target: 1,
        trigger: { event: 'dialogue:ended', filter: { dialogueId: 'elder-intro' } },
      },
    ],
  },
]

const BASE_ITEMS: ItemDefinition[] = [
  { id: 'coin', name: '金币', description: '通用货币', stackable: true, maxStack: 999 },
]

const BASE_ACHIEVEMENTS: AchievementDefinition[] = [
  {
    id: 'first-talk',
    title: '第一次对话',
    description: '与任意 NPC 交谈一次',
    trigger: { event: 'dialogue:ended', count: 1 },
  },
]

/** 启动时应用的基础内容包(town@1)。 */
export const BASE_PACK = defineContentPack({
  id: 'town',
  version: 1,
  dialogues: BASE_DIALOGUES,
  quests: BASE_QUESTS,
  items: BASE_ITEMS,
  achievements: BASE_ACHIEVEMENTS,
})

/**
 * 非法内容包:用于「应用非法内容」按钮,演示 applyContentPack 的校验门禁。
 * - broken-quest 的 objective target 为 0(devtools 报 error)
 * - broken-dlg 的节点 next 指向不存在的节点 ghost(devtools 报 error)
 * 校验失败 → applyContentPack 拒绝应用,引擎保持不变。
 */
const INVALID_DIALOGUES: DialogueTree[] = [
  { id: 'broken-dlg', startNodeId: 'a', nodes: [{ id: 'a', text: '坏掉的对话', next: 'ghost' }] },
]
const INVALID_QUESTS: QuestDefinition[] = [
  { id: 'broken-quest', title: '坏任务', objectives: [{ id: 'x', target: 0 }] },
]

export const INVALID_PACK: ContentPack = {
  id: 'town',
  version: 99,
  dialogues: INVALID_DIALOGUES,
  quests: INVALID_QUESTS,
}

/** v2 包内新增、e2e 断言其应被注册的任务/对话 id。 */
export const V2_NEW_QUEST_ID = 'harvest-festival'
export const V2_NEW_DIALOGUE_ID = 'merchant-intro'
