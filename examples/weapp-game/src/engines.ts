/**
 * 引擎接线 —— 内容、注册表与无头引擎唯一的交汇处。
 *
 * 与 starter 的差异:
 * - 任务引擎用 createWeappStorage 持久化(wx 存储 → `overworld:quest`),
 *   重进游戏自动恢复任务进度;
 * - 无 DOM HUD:通知不走 toast store,由场景内 SpriteLabel 呈现(见 World.tsx);
 * - 交互无键盘:射线拾取点中 NPC → handleNpcTap()(摇杆仍独占左半屏移动)。
 */
import {
  createConditionRegistry,
  createEffectRegistry,
} from '@overworld-engine/core'
import { createDialogueEngine, relationshipEffects } from '@overworld-engine/dialogue'
import { createInventory } from '@overworld-engine/inventory'
import { createMovementInput } from '@overworld-engine/input'
import { createQuestEngine } from '@overworld-engine/quest'
import { createWeappStorage } from '@overworld-engine/adapters-weapp'
import { DIALOGUES, ITEMS, NPC_DIALOGUES, QUESTS } from './content'

export const conditions = createConditionRegistry()
export const effects = createEffectRegistry()

export const dialogue = createDialogueEngine({
  dialogues: DIALOGUES,
  conditions,
  effects,
  persist: false,
})

/** 任务进度持久化到 wx 存储(键:`overworld:quest`),演示小游戏存档。 */
export const quests = createQuestEngine({
  quests: QUESTS,
  conditions,
  effects,
  persist: { name: 'quest', storage: () => createWeappStorage() },
})

export const inventory = createInventory({ items: ITEMS, effects })

/** 摇杆写入、Player 读取的外部移动输入源。 */
export const movementInput = createMovementInput()

/** 极简金币账本(演示任务奖励;正式游戏请换成自己的 store)。 */
export const gold = { value: 0 }

// ---- 内容引用的效果/条件 ---------------------------------------------------

effects.register('gold.add', (params) => {
  gold.value += Number(params.amount) || 0
})
effects.register('quest.start', (params) => {
  quests.startQuest(String(params.questId))
})
effects.registerAll(relationshipEffects(dialogue))

conditions.register('quest.completed', (params) =>
  quests.isCompleted(String(params.questId))
)

// ---- 交互接线 ---------------------------------------------------------------

/** 对话进行中屏蔽移动输入(Player 的 isInputBlocked)。 */
export const isDialogueActive = (): boolean => dialogue.getState().activeDialogue !== null

/**
 * 射线拾取点中某个 NPC 网格时的统一入口(由 createWeappPointerBridge 的
 * `<group onClick>` 触发,取代了旧的「右半屏点按」hack):
 * - 对话进行中:有可选回应则自动选第一个(本模板的刻意简化 —— 不做选项 UI
 *   也能走完对话引擎的效果/条件链;正式游戏请用回应列表渲染真实选项),
 *   否则推进线性节点;
 * - 空闲时:打开该 NPC 的对话树。
 *
 * 单一 onClick 入口按「点按落点那一刻的对话状态」二选一,因此同一次点按只做
 * 一件事 —— 不会出现「推进到结尾即关闭、又被同一次点按重新打开」的抖动。
 */
export function handleNpcTap(npcId: string): void {
  const state = dialogue.getState()
  if (state.activeDialogue) {
    const first = state.availableResponses[0]
    if (first) state.choose(first.id)
    else state.advance()
    return
  }
  const dialogueId = NPC_DIALOGUES[npcId]
  if (dialogueId) dialogue.start(dialogueId, npcId)
}
