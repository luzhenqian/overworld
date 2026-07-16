import {
  createConditionRegistry,
  createEffectRegistry,
  gameEvents,
} from '@overworld/core'
import { createDialogueEngine } from '@overworld/dialogue'
import { createQuestEngine } from '@overworld/quest'
import { createInventory } from '@overworld/inventory'
import { useToastStore } from '@overworld/notifications'
import { KEYBOARD_PRIORITY, createMovementInput, useKeyboardStore } from '@overworld/input'
import { createEnvironment } from '@overworld/environment'
import {
  action,
  condition,
  createAgent,
  createBehaviorTree,
  createHierarchicalGrid,
  createNavGrid,
  parallel,
  patrolAction,
  selector,
  sequence,
  type Agent,
  type BehaviorTree,
} from '@overworld/ai'
import {
  detectQualityPreset,
  playerPositionRef,
  useQualityStore,
} from '@overworld/scene'
import { DIALOGUES, ITEMS, NPC_DIALOGUES, QUESTS } from './content'
import { allWallCells, cellToWorld, generateDungeon, parseSeed } from './dungeon'
import { useGameStore } from './state'

/**
 * 引擎装配 —— 内容、注册表与各引擎唯一的交汇处。
 * 与 starter 的差异:整张地图(碰撞、寻路、摆放)都来自程序化生成器。
 */

// ---- 游戏自定义事件:声明合并进框架事件表,全链路类型安全 -----------------

declare module '@overworld/core' {
  interface OverworldEventMap {
    /** 骷髅守卫碰到玩家。 */
    'dungeon:player-hit': { enemyId: string; damage: number }
    /** 宝箱被打开(任务 open-chest 的目标触发器)。 */
    'dungeon:chest-opened': { chestId: string }
  }
}

// ---- 程序化地牢:URL ?seed= 驱动,默认 42 --------------------------------

export const dungeonSeed = parseSeed(
  typeof window !== 'undefined' ? window.location.search : ''
)
export const layout = generateDungeon(dungeonSeed)

/**
 * 同一份格子数据喂给 NavGrid:每个墙格 blockCircle(半径 0.2 + agentRadius
 * 0.3 = 0.5,恰好只封住本格),敌人寻路与场景碰撞天然一致。
 */
export const navGrid = createNavGrid({
  bounds: layout.bounds,
  cellSize: layout.cellSize,
  agentRadius: 0.3,
})
for (const [cx, cz] of allWallCells(layout)) {
  const [x, z] = cellToWorld(layout, cx, cz)
  navGrid.blockCircle(x, z, 0.2)
}

/** HPA* 分层寻路:引导路径(玩家 → 当前目标)用它查询。 */
export const hierarchicalGrid = createHierarchicalGrid(navGrid, { clusterSize: 12 })

// ---- 注册表与引擎 ---------------------------------------------------------

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

export const inventory = createInventory({ items: ITEMS, effects })

/** 永夜:时间锁在午夜并暂停,DayNightLighting 常驻夜间光照。 */
export const environment = createEnvironment()
environment.setTimeOfDay(0)
environment.setPaused(true)

/** 虚拟摇杆与键盘共用的移动输入源。 */
export const movementInput = createMovementInput()

useQualityStore.getState().setPreset(detectQualityPreset())

// ---- 内容引用的 effects / conditions --------------------------------------

effects.register('gold.add', (params) => {
  useGameStore.getState().addGold(Number(params.amount) || 0)
})
conditions.register('inventory.has', (params) =>
  inventory.has(String(params.itemId), Number(params.quantity ?? 1))
)

// ---- 骷髅守卫:行为树(巡逻 → 追击 → 放弃回岗)驱动的寻路 agent -----------

export interface DungeonEnemy {
  id: string
  agent: Agent
  tree: BehaviorTree<Record<string, never>>
  post: [number, number]
}

/** 进入追击的距离。 */
export const CHASE_RADIUS = 5
/** 追击中玩家甩开该距离后放弃,巡逻树会把守卫带回岗位。 */
export const GIVE_UP_RADIUS = 9

const distanceToPlayer = (agent: Agent): number =>
  Math.hypot(
    agent.position[0] - playerPositionRef.current[0],
    agent.position[1] - playerPositionRef.current[2]
  )

const playerAliveAndNear = (agent: Agent) => () => {
  const s = useGameStore.getState()
  return !s.dead && s.finishedMs === null && distanceToPlayer(agent) <= CHASE_RADIUS
}

function createGuardTree(agent: Agent, route: [number, number][]) {
  /** 追击:follow 玩家位置 ref;甩开或玩家死亡/通关后成功退出。 */
  const chase = action(() => {
    const s = useGameStore.getState()
    if (s.dead || s.finishedMs !== null || distanceToPlayer(agent) > GIVE_UP_RADIUS) {
      agent.idle()
      return 'success'
    }
    if (agent.behavior !== 'follow') {
      agent.follow(playerPositionRef, { stopDistance: 0.4, repathMs: 250 })
    }
    return 'running'
  })
  // selector:玩家在附近 → 追击;否则巡逻,parallel('any') 监视玩家靠近,
  // 靠近即完成本轮 → 树自动重置 → 下一 tick 进入追击分支。
  return createBehaviorTree<Record<string, never>>(
    selector(
      sequence(condition(playerAliveAndNear(agent)), chase),
      parallel(
        'any',
        patrolAction(agent, route, { pauseMs: 700 }),
        condition(playerAliveAndNear(agent))
      )
    ),
    {}
  )
}

export const enemies: DungeonEnemy[] = layout.guards.map((guard) => {
  const agent = createAgent({
    position: [guard.post[0], guard.post[1]],
    speed: 3.4,
    grid: navGrid,
  })
  return { id: guard.id, agent, tree: createGuardTree(agent, guard.route), post: guard.post }
})

// ---- 输入门控:UI 层(对话等)激活或死亡/通关时禁止移动与交互 -------------

export const isGameInputBlocked = (): boolean => {
  const s = useGameStore.getState()
  if (s.dead || s.finishedMs !== null) return true
  return useKeyboardStore.getState().getActiveMaxPriority() > KEYBOARD_PRIORITY.GAME_CONTROLS
}

// ---- 事件总线接线(引擎发事件,游戏决定 UI 表现) -------------------------

const toast = (
  message: string,
  variant: 'info' | 'success' | 'warning' | 'error' = 'info'
) => useToastStore.getState().show({ message, variant })

// E 键交互:NPC → 对话;宝箱 → 开箱逻辑
gameEvents.on('interact', ({ kind, id }) => {
  if (kind === 'npc') {
    const dialogueId = NPC_DIALOGUES[id]
    if (dialogueId) dialogue.getState().start(dialogueId, id)
    return
  }
  if (kind === 'building' && id === 'chest') {
    const state = useGameStore.getState()
    if (state.dead) return
    if (state.chestOpened) {
      toast('宝箱已经空了。')
      return
    }
    if (!inventory.has('key')) {
      toast('宝箱锁得死死的 —— 需要一把钥匙。', 'warning')
      return
    }
    inventory.remove('key', 1)
    state.openChest()
    inventory.add('treasure', 1)
    gameEvents.emit('dungeon:chest-opened', { chestId: id })
  }
})

gameEvents.on('quest:started', ({ questId }) => {
  const def = quests.getState().definitions[questId]
  toast(`📜 新任务:${def?.title ?? questId}`)
})

gameEvents.on('quest:completed', ({ questId }) => {
  const def = quests.getState().definitions[questId]
  toast(`✅ 任务完成:${def?.title ?? questId}`, 'success')
  if (questId === 'open-chest') {
    const store = useGameStore.getState()
    store.finish()
    const ms = useGameStore.getState().finishedMs ?? 0
    toast(`🎉 通关!用时 ${(ms / 1000).toFixed(1)} 秒`, 'success')
  }
})

gameEvents.on('item:added', ({ itemId, quantity }) => {
  const def = inventory.getDefinition(itemId)
  toast(`🔑 获得 ${def?.name ?? itemId} ×${quantity}`, 'info')
})

gameEvents.on('dungeon:player-hit', ({ damage }) => {
  useGameStore.getState().damage(damage)
  const s = useGameStore.getState()
  if (s.dead) {
    toast('💀 你倒在了地牢里……', 'error')
  } else {
    toast(`💔 被骷髅抓到了!剩余 ${s.hearts} 颗心`, 'warning')
  }
})

// ---- 开发期:内容校验 + 调试句柄(生产构建自动剔除) -----------------------

if (import.meta.env.DEV) {
  void import('@overworld/devtools').then((devtools) => {
    const report = devtools.validateContent(
      { dialogues: DIALOGUES, quests: QUESTS, items: ITEMS },
      { effectTypes: effects.types(), conditionTypes: conditions.types() }
    )
    console.info(devtools.formatReport(report))
    devtools.assertValidContent(
      { dialogues: DIALOGUES, quests: QUESTS, items: ITEMS },
      { effectTypes: effects.types(), conditionTypes: conditions.types() }
    )
  })

  void import('@react-three/fiber').then((fiber) => {
    ;(window as unknown as Record<string, unknown>).__game = {
      gameEvents,
      dialogue,
      quests,
      inventory,
      enemies,
      playerPositionRef,
      dungeonSeed,
      layout,
      navGrid,
      gameStore: useGameStore,
      movementInput,
      isGameInputBlocked,
      quality: useQualityStore,
      // 后台标签页 RAF 暂停时手动驱动渲染帧(自动化验证用)
      advance: fiber.advance,
    }
  })
}
