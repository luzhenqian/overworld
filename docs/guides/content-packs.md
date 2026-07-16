# 内容包:打包、校验、热更新分发与版本管理

[内容热重载](./content-hmr.md)讲的是「开发期改 `content.ts`,Vite HMR 里重调
`registerX` 不丢状态」。**内容包**(`@overworld-engine/content`)把同一套机制沉淀成
可分发的产物:内容打成**带版本的一个单元**,**先校验、通过才注册**,既能在开发期
热更,也能作为线上运营内容按需下发。

内容包只依赖 `@overworld-engine/core` 与 `@overworld-engine/devtools`,**不 import 引擎**
——目标引擎作为结构化参数传入。

## 1. 打包:defineContentPack

内容包是纯数据:`id`、数字 `version`,加上四个内容段的任意子集。段类型是 devtools 的
结构化 `*Like` 子集,真实的 `DialogueTree` / `QuestDefinition` / `ItemDefinition` /
`AchievementDefinition` 数组可直接赋值。

```ts
import { defineContentPack } from '@overworld-engine/content'

export const townPack = defineContentPack({
  id: 'town',
  version: 1,
  dialogues: DIALOGUES,
  quests: QUESTS,
  items: ITEMS,
  achievements: ACHIEVEMENTS,
})
```

`defineContentPack` 是恒等函数,只为字面量锚定类型推断。一个 `id` 代表一条内容线,
`version` 单调递增地标记它的历次发布。

## 2. 校验:validateContentPack

```ts
import { validateContentPack } from '@overworld-engine/content'

const report = validateContentPack(townPack, {
  effectTypes: effects.types(),
  conditionTypes: conditions.types(),
})
```

它检查包元数据(`id` 非空、`version` 为有限数字),并把各段委托给 devtools 的
`validateContent`,继承全部逐段与跨段规则。`report.ok` 只看 error;warning(如未注册的
效果类型)不判失败。纯函数、不抛异常——适合放进 CI,也适合作为下发前的把关。

## 3. 热更新分发:applyContentPack

分发的关键动作是 `applyContentPack(pack, targets, options)`:**默认先校验,报告有 error
就拒绝**(一个段都不注册,返回 `ok: false`);通过才把每个存在的段注册到对应引擎。

```ts
import { applyContentPack } from '@overworld-engine/content'

async function hotUpdate() {
  const pack = await fetch('/packs/v2.json').then((r) => r.json())
  const result = applyContentPack(pack, { dialogue, quest: quests, inventory, achievements }, {
    effectTypes: effects.types(),
    conditionTypes: conditions.types(),
  })
  if (!result.ok) {
    console.error('内容校验未通过,保留旧内容', result.report.errors)
    return
  }
  // 新任务 / 新对话已实时出现,进行中的任务进度、背包、成就计数原样保留
}
```

各段沿用引擎的两种调用约定(quest / dialogue 用 rest 参数,inventory / achievements 用
数组),`applyContentPack` 已按 id 结构化处理。注册**只增改、从不删除**,所以热更是
非破坏性的:改文案、调数值、加新任务都不用重玩(替换语义细节见
[content-hmr](./content-hmr.md))。

内容来源随你:打进构建的 `import.meta.hot`、`public/` 下的 JSON、CDN、远端配置中心
——`applyContentPack` 只认 `ContentPack` 对象。

## 4. 版本管理

**内容版本**用轻量追踪器记账,以更旧版本重放时告警(疑似陈旧/乱序推送):

```ts
import { createContentPackTracker } from '@overworld-engine/content'

const tracker = createContentPackTracker()
// 每次成功 apply 后 tracker.record(pack)
tracker.record({ id: 'town', version: 1 }) // 之后 record 更低版本 → 告警
```

**存档版本**是另一回事。内容包热更的是**定义**,不会写坏存档;但当改动影响持久化
状态的含义(重命名 quest id、改 objective id),旧存档会指向不存在的定义。这类改动
正式发布时,用 `@overworld-engine/core` 的 `defineMigrations` + `persistOptions` 迁移:

```ts
import { defineMigrations, persistOptions } from '@overworld-engine/core'

const migrate = defineMigrations({
  2: (state) => ({ ...state, active: renameQuestIds(state.active) }),
})
// persistOptions({ name: 'quest', version: 2, migrate })
```

经验法则:内容改动走内容包(校验 + 热更),持久化含义改动配一次存档迁移(版本 +
migrate),两者独立演进、互不干扰。

完整可跑示例见 `examples/content-packs`。
