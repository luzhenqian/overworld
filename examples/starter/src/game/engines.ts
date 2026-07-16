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
import { bindScheduleToBus, createAgent, createNavGrid, createSchedule } from '@overworld/ai'
import { playerPositionRef } from '@overworld/scene'
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

/** 巡逻村民:A* 网格把向导艾拉当作障碍物,巡逻路径自动绕行 */
const navGrid = createNavGrid({
  bounds: { minX: -18, maxX: 18, minZ: -18, maxZ: 18 },
  obstacles: [{ x: 6, z: 6, radius: 1.5 }],
})
export const villagerAgent = createAgent({
  position: [-6, 6],
  speed: 1.4,
  grid: navGrid,
  // 动态避障:把玩家当作移动障碍物,村民会绕着玩家走
  avoid: {
    obstacles: () => [
      { x: playerPositionRef.current[0], z: playerPositionRef.current[2], radius: 0.6 },
    ],
  },
})

const VILLAGER_HOME: [number, number] = [-6, 6]
const VILLAGER_ROUTE: [number, number][] = [
  [-6, 6],
  [-6, 13],
  [4, 13],
  [8, 2],
]

/** NPC 日程:昼夜相位驱动行为切换(environment 发事件,ai 包零耦合消费) */
export const villagerSchedule = createSchedule({
  agent: villagerAgent,
  entries: {
    dawn: { type: 'wander', center: VILLAGER_HOME, radius: 3 },
    day: { type: 'patrol', waypoints: VILLAGER_ROUTE, pauseMs: 900 },
    dusk: { type: 'goTo', point: VILLAGER_HOME },
    night: { type: 'goTo', point: VILLAGER_HOME },
  },
  initialPhase: 'day',
})
bindScheduleToBus(villagerSchedule, gameEvents)

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

/** Toast 里只放结构化数据(key + 参数),渲染层再翻译 —— 见 docs/guides/i18n.md */
const toast = (
  message: { key: string; params?: Record<string, unknown> },
  variant: 'info' | 'success' | 'warning' | 'error' = 'info'
) => useToastStore.getState().show({ message, variant })

// E 键交互 → 打开该 NPC 的对话
gameEvents.on('interact', ({ kind, id }) => {
  if (kind !== 'npc') return
  const dialogueId = NPC_DIALOGUES[id]
  if (dialogueId) dialogue.getState().start(dialogueId, id)
})

// 引擎事件 → 通知(UI 风格由游戏决定,框架只发事件)
gameEvents.on('quest:started', ({ questId }) => {
  const def = quests.getState().definitions[questId]
  toast({ key: 'toast.questStarted', params: { title: def?.title ?? questId } }, 'info')
})
gameEvents.on('quest:completed', ({ questId }) => {
  const def = quests.getState().definitions[questId]
  toast({ key: 'toast.questCompleted', params: { title: def?.title ?? questId } }, 'success')
})
gameEvents.on('item:added', ({ itemId, quantity, total }) => {
  const def = inventory.getDefinition(itemId)
  toast({ key: 'toast.itemAdded', params: { name: def?.name ?? itemId, qty: quantity, total } }, 'info')
})
gameEvents.on('achievement:unlocked', ({ achievementId }) => {
  const def = achievements.getDefinition(achievementId)
  toast({ key: 'toast.achievement', params: { title: def?.title ?? achievementId } }, 'success')
})

// 开发期:内容校验(引用完整性 + 已注册效果/条件核对),生产构建自动剔除
if (import.meta.env.DEV) {
  void import('@overworld/devtools').then((devtools) => {
    const report = devtools.validateContent(
      { dialogues: DIALOGUES, quests: QUESTS, items: ITEMS, achievements: ACHIEVEMENTS },
      { effectTypes: effects.types(), conditionTypes: conditions.types() }
    )
    console.info(devtools.formatReport(report))
    ;(window as unknown as Record<string, unknown>).__contentReport = report
    devtools.assertValidContent(
      { dialogues: DIALOGUES, quests: QUESTS, items: ITEMS, achievements: ACHIEVEMENTS },
      { effectTypes: effects.types(), conditionTypes: conditions.types() }
    )
  })
}

// 开发期调试句柄(生产构建自动剔除)
if (import.meta.env.DEV) {
  void Promise.all([
    import('@overworld/scene'),
    import('@react-three/fiber'),
    import('@overworld/editor'),
  ]).then(([scene, fiber, editor]) => {
    {
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
        villagerAgent,
        villagerSchedule,
        editorStore: editor.useEditorStore,
        // 后台标签页 RAF 被暂停时可手动驱动渲染帧(自动化验证用)
        advance: fiber.advance,
      }
    }
  })
}
