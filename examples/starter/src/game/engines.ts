import {
  createConditionRegistry,
  createEffectRegistry,
  gameEvents,
  EventBus,
  type OverworldEventMap,
  type RngSource,
} from '@overworld-engine/core'
import { createDialogueEngine, relationshipEffects } from '@overworld-engine/dialogue'
import { createQuestEngine } from '@overworld-engine/quest'
import { createInventory } from '@overworld-engine/inventory'
import { createAchievements } from '@overworld-engine/achievements'
import { useToastStore } from '@overworld-engine/notifications'
import { KEYBOARD_PRIORITY, createMovementInput, useKeyboardStore } from '@overworld-engine/input'
import { createEnvironment } from '@overworld-engine/environment'
import { bindScheduleToBus, createAgent, createNavGrid, createSchedule } from '@overworld-engine/ai'
import {
  createBroadcastChannelTransport,
  createPresenceSync,
  isBroadcastChannelAvailable,
} from '@overworld-engine/net'
import {
  detectQualityPreset,
  playerPositionRef,
  playerRotationRef,
  useQualityStore,
} from '@overworld-engine/scene'
import { ACHIEVEMENTS, DIALOGUES, ITEMS, LOOT_POOL, NPC_DIALOGUES, QUESTS } from './content'
import { useGoldStore } from './gold'
import { createLootTable } from './loot'

/**
 * Engine wiring — the only place where content, registries and engines meet.
 * `persist: false` keeps the demo stateless across reloads.
 */

/**
 * Build the deterministic, testable core of the demo: the quest/inventory
 * engines, their shared condition/effect registries, and the loot table —
 * all threaded through one event bus.
 *
 * Defaults produce a fresh, isolated bus and real (`Math.random`-backed)
 * loot rolls — safe to call repeatedly with zero cross-call leakage. Pass
 * `{ events: gameEvents }` for the production singleton below (so it stays
 * on the same bus every other package in this app uses), or
 * `{ rng: createSeededRng(seed) }` from a test for byte-identical,
 * reproducible results (see `@overworld-engine/test-kit`).
 *
 * Caveat: only `loot.random` is registered inside this factory. `gold.add`,
 * `quest.start`, and the dialogue relationship effects (plus the
 * `quest.completed`/`gold.atLeast` conditions) are registered later, at
 * module scope, against the production singleton returned below — not
 * against a fresh `createEngines()` instance. A test that calls
 * `createEngines(...)` directly gets `effects`/`conditions` registries
 * containing only `loot.random`; effects on unregistered types are
 * silently skipped (with a console warning), not errored, so register
 * whatever else your test needs on the returned `effects`/`conditions`.
 */
export function createEngines(overrides?: {
  events?: EventBus<OverworldEventMap>
  rng?: RngSource
}) {
  const events = overrides?.events ?? new EventBus<OverworldEventMap>()
  const rng = overrides?.rng ?? { next: Math.random }

  const conditions = createConditionRegistry()
  const effects = createEffectRegistry()

  const quests = createQuestEngine({ quests: QUESTS, conditions, effects, events, persist: false })
  const inventory = createInventory({ items: ITEMS, effects, events })
  const loot = createLootTable(LOOT_POOL, { rng })

  effects.register('loot.random', () => {
    inventory.add(loot.roll(), 1)
  })

  return { events, rng, conditions, effects, quests, inventory, loot }
}

const engines = createEngines({ events: gameEvents })
export const { conditions, effects, quests, inventory, loot } = engines

export const dialogue = createDialogueEngine({
  dialogues: DIALOGUES,
  conditions,
  effects,
  persist: false,
})

// inventory/achievements 的持久化是可选配置,省略即不持久化
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

/**
 * 跨标签页联机演示:BroadcastChannel 传输 + presence 同步。
 * 同源多开标签页即可互见幽灵玩家;换成 WebSocket transport 即为真联机。
 */
export const presence = isBroadcastChannelAvailable()
  ? createPresenceSync({
      transport: createBroadcastChannelTransport({ channelName: 'overworld-starter' }),
      // 延迟插值缓冲:远端玩家按 120ms 前的快照对插值,平滑应对网络抖动
      interpolation: { delayMs: 120 },
      getLocal: () => ({
        position: [
          playerPositionRef.current[0],
          playerPositionRef.current[1],
          playerPositionRef.current[2],
        ],
        rotationY: playerRotationRef.current,
      }),
    })
  : null
presence?.start()
if (typeof window !== 'undefined' && presence) {
  // 页面关闭时广播 bye,让其他标签页立即移除本玩家
  window.addEventListener('pagehide', () => presence.stop())
}

// ---- 性能预设:按设备能力自动降级(DPR/阴影/粒子) --------------------------

useQualityStore.getState().setPreset(detectQualityPreset())

// ---- 场景编辑器:实体模板目录(启动时注册一次) ----------------------------

void import('@overworld-engine/editor').then(({ useEditorStore }) => {
  useEditorStore.getState().setTemplates([
    { id: 'tpl-guide', label: '向导 NPC', kind: 'npc', modelPath: '/models/guide.glb', name: '新向导' },
    { id: 'tpl-house', label: '小屋', kind: 'building', scale: 2, collisionRadius: 3, name: '小屋' },
    { id: 'tpl-rock', label: '岩石装饰', kind: 'decoration', collisionRadius: 1 },
  ])
})

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
gameEvents.on('entity:interact', ({ kind, id }) => {
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
  void import('@overworld-engine/devtools').then((devtools) => {
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
    import('@overworld-engine/scene'),
    import('@react-three/fiber'),
    import('@overworld-engine/editor'),
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
        presence,
        quality: useQualityStore,
        // 后台标签页 RAF 被暂停时可手动驱动渲染帧(自动化验证用)
        advance: fiber.advance,
      }
    }
  })
}

// ---- 内容热重载:content.ts 变更时增量替换定义(仅开发模式,见 docs/guides/content-hmr.md)
if (import.meta.hot) {
  import.meta.hot.accept('./content', (mod) => {
    if (!mod) return
    void import('@overworld-engine/devtools').then((devtools) => {
      const report = devtools.validateContent(
        { dialogues: mod.DIALOGUES, quests: mod.QUESTS, items: mod.ITEMS, achievements: mod.ACHIEVEMENTS },
        { effectTypes: effects.types(), conditionTypes: conditions.types() }
      )
      if (!report.ok) {
        console.warn('[hmr] 内容校验未通过,跳过热更\n' + devtools.formatReport(report))
        return
      }
      quests.getState().registerQuests(...mod.QUESTS)
      dialogue.getState().registerDialogues(...mod.DIALOGUES)
      inventory.registerItems(mod.ITEMS)
      achievements.registerAchievements(mod.ACHIEVEMENTS)
      console.info('[hmr] 内容已热更新')
    })
  })
}
