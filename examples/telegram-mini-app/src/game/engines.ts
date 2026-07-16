import {
  createConditionRegistry,
  createEffectRegistry,
  gameEvents,
} from '@overworld-engine/core'
import { createDialogueEngine } from '@overworld-engine/dialogue'
import { createQuestEngine } from '@overworld-engine/quest'
import { createInventory } from '@overworld-engine/inventory'
import { useToastStore } from '@overworld-engine/notifications'
import { KEYBOARD_PRIORITY, createMovementInput, useKeyboardStore } from '@overworld-engine/input'
import { DIALOGUES, ITEMS, NPC_DIALOGUES, QUESTS } from './content'
import { useGoldStore } from './gold'
import { getSaveStorage } from './save-storage'
import './platform'

/**
 * 引擎装配(starter 裁剪版)—— 内容、注册表与引擎唯一的交汇处。
 * 相比 starter 去掉了 i18n / 编辑器 / 联机 / AI 村民 / 成就 / 昼夜循环 / 小地图,
 * 保留:场景 + 玩家 + 任务 + 对话 + 背包 + HUD。
 *
 * 注意:本模块必须在 setSaveStorage() 之后才能被 import(见 main.tsx 的异步引导)。
 */

export const conditions = createConditionRegistry()
export const effects = createEffectRegistry()

export const dialogue = createDialogueEngine({
  dialogues: DIALOGUES,
  conditions,
  effects,
  persist: false,
})

/**
 * 任务引擎开启持久化,存储后端由 main.tsx 异步解析后注入:
 * Telegram 端 → CloudStorage(跨设备云存档),浏览器直开 → localStorage。
 * 这是"每个端一份存档"的最小演示 —— 刷新页面后任务进度仍在,
 * 在 Telegram 里换台设备登录同一账号也能读回进度。
 */
export const quests = createQuestEngine({
  quests: QUESTS,
  conditions,
  effects,
  persist: { name: 'quest', storage: () => getSaveStorage() },
})

export const inventory = createInventory({
  items: ITEMS,
  effects,
})

/** 虚拟摇杆与键盘共用的外部移动输入源 */
export const movementInput = createMovementInput()

// ---- 内容引用的效果与条件 ------------------------------------------------

effects.register('gold.add', (params) => {
  useGoldStore.getState().add(Number(params.amount) || 0)
})
effects.register('quest.start', (params) => {
  quests.getState().startQuest(String(params.questId))
})

conditions.register('quest.completed', (params) =>
  quests.getState().isCompleted(String(params.questId))
)

// ---- 事件总线上的跨系统接线 ----------------------------------------------

/** 有更高优先级的 UI 层(对话框等)激活时,屏蔽玩家移动/交互 */
export const isGameInputBlocked = () =>
  useKeyboardStore.getState().getActiveMaxPriority() > KEYBOARD_PRIORITY.GAME_CONTROLS

const toast = (
  message: string,
  variant: 'info' | 'success' | 'warning' | 'error' = 'info'
) => useToastStore.getState().show({ message, variant })

// E 键 / 点击交互 → 打开该 NPC 的对话
gameEvents.on('entity:interact', ({ kind, id }) => {
  if (kind !== 'npc') return
  const dialogueId = NPC_DIALOGUES[id]
  if (dialogueId) dialogue.getState().start(dialogueId, id)
})

/**
 * 平台返回键(Telegram BackButton / Android 返回键)约定:
 * 对话打开时关闭对话;否则不处理,交还给平台默认行为
 * (Telegram 收起 Mini App / Android 退到桌面)。
 */
gameEvents.on('app:back', () => {
  if (dialogue.getState().activeDialogue) dialogue.end()
})

// 引擎事件 → 通知(UI 风格由游戏决定,框架只发事件)
gameEvents.on('quest:started', ({ questId }) => {
  const def = quests.getState().definitions[questId]
  toast(`接受任务:${def?.title ?? questId}`, 'info')
})
gameEvents.on('quest:completed', ({ questId }) => {
  const def = quests.getState().definitions[questId]
  toast(`任务完成:${def?.title ?? questId}`, 'success')
})
gameEvents.on('item:added', ({ itemId, quantity, total }) => {
  const def = inventory.getDefinition(itemId)
  toast(`获得 ${def?.name ?? itemId} ×${quantity}(共 ${total})`, 'info')
})
