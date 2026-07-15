import {
  createConditionRegistry,
  createEffectRegistry,
  gameEvents,
} from '@overworld/core'
import { createDialogueEngine, relationshipEffects } from '@overworld/dialogue'
import { createQuestEngine } from '@overworld/quest'
import { createInventory } from '@overworld/inventory'
import { createAchievements } from '@overworld/achievements'
import { useToastStore } from '@overworld/notifications'
import { KEYBOARD_PRIORITY, createMovementInput, useKeyboardStore } from '@overworld/input'
import { createEnvironment } from '@overworld/environment'
import { ACHIEVEMENTS, DIALOGUES, ITEMS, NPC_DIALOGUES, QUESTS } from './content'
import { useGoldStore } from './gold'

/**
 * Engine wiring — the only place where content, registries and engines meet.
 * `persist: false` keeps the demo stateless across reloads.
 */

export const conditions = createConditionRegistry()
export const effects = createEffectRegistry()

export const dialogue = createDialogueEngine({
  dialogues: DIALOGUES,
  conditions,
  effects,
  persist: false,
})

export const quests = createQuestEngine({
  quests: QUESTS,
  conditions,
  effects,
  persist: false,
})

// inventory/achievements 的持久化是可选配置,省略即不持久化
export const inventory = createInventory({
  items: ITEMS,
  effects,
})

export const achievements = createAchievements({
  definitions: ACHIEVEMENTS,
  effects,
})

/** 昼夜循环:10 分钟一天,从上午开始 */
export const environment = createEnvironment({ dayLengthMs: 600_000 })
environment.setTimeOfDay(0.4)

/** 虚拟摇杆与键盘共用的外部移动输入源 */
export const movementInput = createMovementInput()

// ---- Effects & conditions the content refers to -------------------------

effects.register('gold.add', (params) => {
  useGoldStore.getState().add(Number(params.amount) || 0)
})
effects.register('quest.start', (params) => {
  quests.getState().startQuest(String(params.questId))
})
effects.registerAll(relationshipEffects(dialogue))

conditions.register('quest.completed', (params) =>
  quests.getState().isCompleted(String(params.questId))
)
conditions.register('gold.atLeast', (params) => useGoldStore.getState().gold >= Number(params.amount))

// ---- Cross-system wiring via the event bus ------------------------------

/** Movement/interaction is blocked while any UI layer above game controls is active. */
export const isGameInputBlocked = () =>
  useKeyboardStore.getState().getActiveMaxPriority() > KEYBOARD_PRIORITY.GAME_CONTROLS

const toast = (message: string, variant: 'info' | 'success' | 'warning' | 'error' = 'info') =>
  useToastStore.getState().show({ message, variant })

// E 键交互 → 打开该 NPC 的对话
gameEvents.on('interact', ({ kind, id }) => {
  if (kind !== 'npc') return
  const dialogueId = NPC_DIALOGUES[id]
  if (dialogueId) dialogue.getState().start(dialogueId, id)
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
gameEvents.on('achievement:unlocked', ({ achievementId }) => {
  const def = achievements.getDefinition(achievementId)
  toast(`🏆 成就解锁:${def?.title ?? achievementId}`, 'success')
})

// 开发期调试句柄(生产构建自动剔除)
if (import.meta.env.DEV) {
  void Promise.all([import('@overworld/scene'), import('@react-three/fiber')]).then(
    ([scene, fiber]) => {
      ;(window as unknown as Record<string, unknown>).__game = {
        gameEvents,
        dialogue,
        quests,
        inventory,
        achievements,
        playerPositionRef: scene.playerPositionRef,
        keyboard: useKeyboardStore,
        isGameInputBlocked,
        environment,
        movementInput,
        // 后台标签页 RAF 被暂停时可手动驱动渲染帧(自动化验证用)
        advance: fiber.advance,
      }
    }
  )
}
