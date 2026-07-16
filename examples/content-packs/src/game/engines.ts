import { createConditionRegistry, createEffectRegistry, gameEvents } from '@overworld-engine/core'
import { createDialogueEngine, relationshipEffects } from '@overworld-engine/dialogue'
import { createQuestEngine } from '@overworld-engine/quest'
import { createInventory } from '@overworld-engine/inventory'
import { createAchievements } from '@overworld-engine/achievements'
import {
  applyContentPack,
  createContentPackTracker,
  type ApplyContentPackResult,
  type ContentPack,
} from '@overworld-engine/content'
import { BASE_PACK, INVALID_PACK } from './packs'

/**
 * 引擎接线 —— 内容包、注册表与引擎在此汇合。
 *
 * 启动时用 applyContentPack 应用基础包(town@1);运行时用同一个 applyContentPack
 * 把拉取到的 v2 包热更进引擎,或用非法包演示校验门禁。persist: false 保持无状态。
 */

export const conditions = createConditionRegistry()
export const effects = createEffectRegistry()

// 引擎从空内容起步 —— 全部内容都经内容包应用,证明「校验后再注册」的闭环。
export const dialogue = createDialogueEngine({
  dialogues: [],
  conditions,
  effects,
  persist: false,
})

export const quests = createQuestEngine({
  quests: [],
  conditions,
  effects,
  persist: false,
})

export const inventory = createInventory({ items: [], effects })

export const achievements = createAchievements({ definitions: [], effects })

// 内容里引用的效果:对话选项接下委托 → quest.start 启动任务。
effects.register('quest.start', (params) => {
  quests.getState().startQuest(String(params.questId))
})
effects.registerAll(relationshipEffects(dialogue))

/** 应用内容包时传给校验器的已注册类型(未注册的引用只报 warning,不拦截)。 */
const applyOptions = () => ({
  effectTypes: effects.types(),
  conditionTypes: conditions.types(),
})

/** 内容包应用时的目标引擎集合(结构化传入,content 包不 import 引擎)。 */
const targets = { dialogue, quest: quests, inventory, achievements }

/** 版本追踪:重放更旧版本时告警(见 @overworld-engine/content)。 */
export const tracker = createContentPackTracker()

/** 应用一个内容包:校验 → 通过则注册 → 记录版本。返回 applyContentPack 结果。 */
export function apply(pack: ContentPack): ApplyContentPackResult {
  const result = applyContentPack(pack, targets, applyOptions())
  if (result.ok) tracker.record(pack)
  return result
}

/** 启动:应用基础包(town@1)。 */
export const baseApply = apply(BASE_PACK)

/** 从 /packs/v2.json 拉取更新的内容包并热更进引擎(校验后注册)。 */
export async function applyV2(): Promise<ApplyContentPackResult> {
  const res = await fetch('/packs/v2.json')
  const pack = (await res.json()) as ContentPack
  return apply(pack)
}

/** 应用非法内容包:校验门禁应拒绝,引擎保持不变。 */
export function applyInvalid(): ApplyContentPackResult {
  return apply(INVALID_PACK)
}

// E 键(或点击 NPC)→ 打开村长对话,推进 welcome 任务(演示热更后进度保留)。
gameEvents.on('entity:interact', ({ kind, id }) => {
  if (kind === 'npc' && id === 'elder') dialogue.getState().start('elder-intro', 'elder')
})
