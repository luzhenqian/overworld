# @overworld-engine/test-kit — 通用 App 层集成测试基建（REQ-004）— 设计

日期：2026-07-25
状态：范围、包结构、API 形状、验收用例、与需求的逐条对照均已与需求方（Noah）确认

## 背景

REQ-004（`/Users/noah/Work/idea/灵妖西行/client/requirements/REQ-004-e2e-testing.md`）由一个真实事故驱动：
伏妖塔战斗接线时，app 层建战漏传战斗 RNG（`createBattle` 少了 `rng`），退化成空的确定性随机序列，
第一次要随机数就抛异常、UI 卡死。内核单测与对拍金测全绿（它们不经过 app 层的 store→React→战斗
循环装配），bug 一路溜到手动游玩才被发现。这类"接线级/集成级"缺陷是当前自动化的盲区。

**明确约束（用户在需求评估阶段提出）**：这次交付不是"帮灵妖西行测战斗"，而是一套任何 Overworld
游戏都能用的通用能力。灵妖西行的战斗 RNG bug 只是一个具体实例；Overworld 仓库里根本没有
battle/combat 包（战斗逻辑是各游戏自己的 kernel），所以"战斗 RNG"本身超出 Overworld 的范围——
Overworld 只能交付"可注入种子的 RNG"这个通用模式，由灵妖西行自己接到他们的 `createBattle` 上。

现状核实：
- `core` 里没有任何 RNG/seed 抽象，仓库里裸调 `Math.random()` 的地方只有环境粒子特效（下雪下雨），
  没有注入约定。
- `packages/devtools` 的 `createEventRecorder(bus)` 和 `packages/inspector` 的
  `createEventStream(bus)` 已经是成熟的、用单调计数器（非 `Date.now()`）保证确定性的事件录制器，
  但两者都不能被新包直接复用（见下）。
- `packages/core` 的 `createSaveSlots` 只快照*持久化*的 storage 字符串，覆盖不到纯内存态 store。
- 仓库里零无头浏览器/E2E 工具（无 Playwright、无 `@vitest/browser`）；`scene` 包带 react-three-fiber，
  比纯 DOM 测试重得多。
- 现有测试模式只到"单 store + 真实事件总线"粒度（`packages/scene/src/__tests__/interaction.test.ts`），
  没有跨 store/跨屏驱动的先例；`examples/starter` 完全没有测试基建（无 vitest、无 test 脚本）。
- `createQuestEngine`/`createInventory`/`createDialogueEngine`/`createAchievements` 等工厂函数已经
  支持 `config.events`/`config.clock` 可选覆盖（默认用全局 `gameEvents`/`Date.now`）——依赖注入这个
  模式在仓库里已有先例，只是没人给 `rng` 补上同款参数，也没人利用 `events` 覆盖做测试隔离。
- `@overworld-engine/scene` 的 `useInteractKey` 是纯 `useEffect` + `window.addEventListener('keydown', ...)`
  + 调用导出函数 `interact()`，不碰 Three.js/Canvas——可以脱离场景渲染单独挂载测试。

## 1. 范围与非目标

**范围**：一个新增的 devDependency 包 `@overworld-engine/test-kit`，加上 `core` 里一个很小的运行时
新增（可注入种子的 RNG）。以 `examples/starter` 为真实载体，交付两条"先红后绿"的验收脚本，分别覆盖
store/事件/装配层和 React 绑定层。

**非目标**（v1 明确不做，避免范围蔓延）：
- 不做无头浏览器/真实渲染断言（Playwright、`@react-three/test-renderer`）——本需求要抓的 bug 类型
  （装配/接线错误）不发生在渲染层，见下方"方案对比"。
- 不做"语义化动作"的专用 DSL——需求文档举的动词（"打开暂停菜单""进入某战斗"）都是游戏自己的，
  Overworld 不可能预先知道。脚本就是普通 Vitest 测试代码，直接调用真实导出的函数/store action。
- 不做通用"虚拟时钟"工具——`clock` 这个 DI 口子仓库里已有先例（`quest` 包），验收用例本身也用不到
  时间维度，不重新发明。
- 不做通用 store 重置工具——工厂模式下每次调用天然是全新隔离实例，不需要额外重置机制。
- 不做战斗系统本身——Overworld 没有、也不应该有 battle 包；`rng` 注入到灵妖西行自己的
  `createBattle` 是他们自己的工作，这次只交付可复用的模式和证明它有效的通用范例。

## 2. 方案对比：怎么"驱动真实运行时"

| | 纯逻辑驱动（选中） | 无头浏览器（Playwright） | `@react-three/test-renderer` |
|---|---|---|---|
| 依赖 | 零新增基础设施 | 浏览器二进制、dev server 编排 | 生态不活跃，版本兼容风险 |
| 速度/CI | 纯 Vitest/Node，秒级 | 慢，CI 时间显著增加 | 中等 |
| 命中的 bug 类型 | 装配/接线/store/事件——正是这次要抓的 | 渲染/视觉层 | 渲染层 |
| 与仓库现有风格的契合度 | 完全契合（`interaction.test.ts` 已是这个模式，零 testing-library） | 无先例 | 无先例 |

选纯逻辑驱动。真正要抓的 bug（漏传 RNG 导致构造时崩溃）病灶在"怎么把东西装配起来"，不在"渲染对不
对"，渲染层工具是杀鸡用牛刀，且会把仓库的 CI 时间和维护成本拖上一个台阶。

## 3. 包结构

```
packages/core/src/rng.ts                    # 新增：RngSource + createSeededRng
packages/test-kit/
  src/
    index.ts
    eventRecorder.ts   # createEventRecorder(bus) —— 自实现，不依赖 devtools/inspector
    renderHook.ts       # renderHook(hook, ...args) —— React 绑定层，基于 react-test-renderer
    __tests__/
  package.json           # @overworld-engine/test-kit
  tsconfig.json
  tsup.config.ts

examples/starter/
  src/game/engines.ts     # 重构：模块级单例 → createEngines(overrides?) 工厂
  src/game/loot.ts         # 新增：createLootTable(pool, { rng? })
  src/__tests__/
    engineWiring.test.ts   # 验收脚本 1：装配层（RNG 注入）
    interactKeyWiring.test.ts  # 验收脚本 2：React 绑定层
  vitest.config.ts          # 新增：starter 目前完全没有测试基建
  package.json               # 新增 vitest / react-test-renderer devDependency + test 脚本
```

**为什么 `createEventRecorder` 不直接复用 `devtools`/`inspector` 里已有的同款实现**：仓库的
`.dependency-cruiser.cjs` 有零跨包导入规则——除 `core` 外任何包只能依赖 `core`，`test-kit` 不能
依赖 `devtools`/`inspector`。三处实现逻辑高度相似（单调计数器 + `bus.onAny` push 到数组），但都只有
几行，是一处小的、有意为之的重复，而不是去重构两个已有、已测试、工作正常的包——不做超出本次目标
的重构。

## 4. `core` 新增：可注入种子的 RNG

```ts
// packages/core/src/rng.ts
/** [0, 1) 区间的伪随机源，任何需要"可复现随机性"的构造函数都应该能接受它。 */
export interface RngSource {
  next(): number
}

/**
 * mulberry32 —— 零依赖的小型确定性 PRNG。不追求密码学强度，只保证"同种子
 * 同序列"，满足测试可复现即可；生产环境随机可以直接用 `{ next: Math.random }`
 * 而不必依赖这个函数。
 */
export function createSeededRng(seed: number): RngSource {
  let state = seed >>> 0
  return {
    next() {
      state = (state + 0x6d2b79f5) >>> 0
      let t = state
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    },
  }
}
```

这是运行时原语，不是测试专用——放进 `core` 而不是 `test-kit`，因为游戏的生产代码（`createBattle`
之类的工厂函数）也要能接受 `RngSource` 参数，`test-kit` 只是"用固定种子调用它"的那一侧，不该成为
生产代码的依赖。

## 5. `test-kit`：事件录制器

```ts
// packages/test-kit/src/eventRecorder.ts
import type { EventBus } from '@overworld-engine/core'

export interface RecordedEvent {
  event: string
  payload: unknown
  /** 单调递增序号，不是时间戳——保证任何环境下排序断言都确定。 */
  at: number
}

export interface EventRecorder {
  events: RecordedEvent[]
  stop(): void
}

export function createEventRecorder<M extends object>(bus: EventBus<M>): EventRecorder {
  const events: RecordedEvent[] = []
  let counter = 0
  const stop = bus.onAny((event, payload) => {
    events.push({ event: String(event), payload, at: counter++ })
  })
  return { events, stop }
}
```

Store 快照 / 金快照比对不新建机制，直接用 Vitest 自带的 `expect(store.getState()).toMatchSnapshot()`。

## 6. 验收脚本 1：装配层（store / 事件 / RNG 注入）

`engines.ts` 从模块级单例改成工厂函数，允许测试从外部注入隔离的事件总线和种子 RNG：

```ts
// examples/starter/src/game/engines.ts（重构）
export function createEngines(overrides?: {
  events?: EventBus<OverworldEventMap>  // 默认 new EventBus()（隔离）
  rng?: RngSource                        // 默认 { next: Math.random }
}) {
  const events = overrides?.events ?? new EventBus<OverworldEventMap>()
  const rng = overrides?.rng ?? { next: Math.random }

  const quests = createQuestEngine({ quests: QUESTS, conditions, effects, events, persist: false })
  const inventory = createInventory({ items: ITEMS, effects, events })
  // ...achievements/dialogue 同样按 events 穿透
  const loot = createLootTable(LOOT_POOL, { rng })  // ← 漏传 rng 就是复现的 bug

  effects.register('loot.random', () => {
    const itemId = loot.roll()
    inventory.add(itemId, 1)
  })

  return { quests, inventory, dialogue, achievements, loot, events }
}

// 真实 app 入口：与全局 gameEvents 保持一致（其它包如 villagerSchedule 都接在这条总线上）
export const engines = createEngines({ events: gameEvents })
```

```ts
// examples/starter/src/game/loot.ts（新增）
export interface LootEntry { id: string; weight: number }

export function createLootTable(pool: LootEntry[], options?: { rng?: RngSource }) {
  return {
    roll(): string {
      if (!options?.rng) {
        throw new Error('[loot] createLootTable: missing rng — pass { rng } at construction time')
      }
      const total = pool.reduce((sum, e) => sum + e.weight, 0)
      let r = options.rng.next() * total
      for (const entry of pool) {
        if ((r -= entry.weight) < 0) return entry.id
      }
      return pool[pool.length - 1]!.id
    },
  }
}
```

`options?.rng` 故意设计成**可选类型**——和灵妖西行真实事故里那个参数一样，不是 TS 编译期就能拦住
的错误，只有运行到第一次 `.roll()` 才炸，完整复现"漏传依赖，首次用到才崩"这个故障类别。

**验收脚本**（`examples/starter/src/__tests__/engineWiring.test.ts`）：

```ts
it('completing gather-crystals grants a deterministic random reward', () => {
  const { quests, inventory, events } = createEngines({ rng: createSeededRng(1234) })
  const recorder = createEventRecorder(events)

  quests.startQuest('gather-crystals')
  // reportProgress 推进目标进度；到达 target 时引擎自动 completeQuest 并跑 rewards
  quests.reportProgress('gather-crystals', 'collect', 1)

  expect(recorder.events.map((e) => e.event)).toContain('quest:completed')
  expect(inventory.store.getState()).toMatchSnapshot()  // 固定种子下每次跑结果一致
})
```

暂时把 `createEngines` 里的 `{ rng }` 参数删掉（模拟漏传）→ 上面这条测试第一次调 `.roll()` 时抛错，
测试失败，报错信息里点名"missing rng"；接回 `{ rng }` → 测试转绿，且多次运行 `toMatchSnapshot()`
结果字节级一致。

## 7. 验收脚本 2：React 绑定层

```ts
// packages/test-kit/src/renderHook.ts
import { act, create, type TestRenderer } from 'react-test-renderer'

/**
 * 在一棵最小的 React 树里挂载单个 hook 并跑它的 effect——不渲染任何真实
 * UI/场景，只是给 hook 一个真实的 React 生命周期让它的 `useEffect` 执行。
 * 需要在 jsdom 环境下跑（hook 内部若访问 window/document）。
 */
export function renderHook<Args extends unknown[]>(
  hook: (...args: Args) => void,
  ...args: Args
): { unmount(): void } {
  let renderer!: TestRenderer
  function Harness() {
    hook(...args)
    return null
  }
  act(() => {
    renderer = create(<Harness />)
  })
  return { unmount: () => act(() => renderer.unmount()) }
}
```

`test-kit` 的 `package.json` 把 `react`、`react-test-renderer` 设为 `peerDependencies`（版本必须与
消费方一致，走 peer 避免装两份 React，与 `packages/platform` 现有的 `react` peer 依赖同一模式）。

**验收脚本**（`examples/starter/src/__tests__/interactKeyWiring.test.ts`，`// @vitest-environment jsdom`）：

```ts
it('pressing "e" near an NPC emits entity:interact', () => {
  const recorder = createEventRecorder(gameEvents)
  useSceneStore.setState({ nearbyNpcId: 'npc-1', nearbyBuildingId: null })

  renderHook(useInteractKey, 'e', { isInputBlocked: () => false })
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'e' }))

  expect(recorder.events.map((e) => e.event)).toContain('entity:interact')
})
```

暂时不调用 `renderHook(useInteractKey, ...)`（模拟"按键绑定漏接"）→ 按键事件发出去没人接，断言失败；
接回调用 → 转绿。

## 8. 与 REQ-004 逐条对照

| REQ-004 原文 | 交付内容 | 结论 |
|---|---|---|
| 确定性启动：世界/战斗/外观 RNG 全可注入/复现 | `core` 的 `RngSource` + `createSeededRng`，通用注入接口 | 接口/模式层面满足；"战斗 RNG"要落到灵妖西行自己的 kernel，Overworld 不能替他们改 |
| 语义化动作驱动真实运行时，走真实 store 动作 + 事件通路 | 脚本直接调真实导出函数/store action，无内部状态直改 | 满足 |
| 断言接口：store 快照 / 事件流 / 屏幕状态 + 金快照 | Vitest `toMatchSnapshot()` + `createEventRecorder` | 满足 |
| CI 友好、快、无 GPU、失败可定位到动作步 | 纯 Vitest/Node（脚本 2 用 jsdom，非真实浏览器），无自定义 DSL，失败即原生调用栈 | 满足 |
| 验收：可复现"漏传依赖导致运行时崩"类 bug，先红后绿 | 验收脚本 1（loot/RNG） | 满足 |
| 背景点名的 store↔React↔战斗循环↔存档 四层 | store/事件/装配层（脚本 1）+ React 绑定层（脚本 2） | 满足（战斗循环/存档层是灵妖西行自己的 kernel，Overworld 侧的对应物是"通用模式已交付，可复用同一套 test-kit 原语") |

## 9. 测试策略

- `test-kit` 自己的单测：`createEventRecorder` 录制正确性；`createSeededRng` 的"同种子同序列"可复现性
  + 基本均匀分布检查（不追求密码学强度）；`renderHook` 挂载/卸载正确调用 effect 清理函数。
- 两条验收脚本都在 `examples/starter` 里，作为"给 starter 新增测试基建"的一部分（目前 `starter` 只有
  `dev`/`build`/`typecheck`，没有 `test`）：新增 `vitest` + `react-test-renderer` devDependency、
  `test` 脚本、最小 `vitest.config.ts`。
- 脚本 2 需要 `jsdom` 环境（仓库根 `package.json` 已有 `jsdom` devDependency，只需在该测试文件顶部
  加 `// @vitest-environment jsdom` 或在 `starter` 的 vitest 配置里全局开启——因为它本来就是个 React
  应用，全局开启更省事）。

## 已知风险 / 后续开放问题

- `engines.ts` 从模块级单例改成工厂函数是一处小的破坏性重构（虽然对外 `export const engines = ...`
  的调用方无感知），需要确认 `examples/starter` 里所有直接 `import { quests } from './engines'` 之类
  的引用都改成走 `engines.quests`（或保留原有具名导出、由 `engines` 单例解构出来，向后兼容）——具体
  怎么做在实现计划阶段展开，不在这里预先决定。
- "外观 RNG"（cosmetic RNG）在 `examples/starter` 里没有对应的真实场景可以拿来做验收——RNG 注入模式
  本身是通用的，只是这次没有第三个例子去证明它，不是模式本身有缺口。
- 灵妖西行需要把 `RngSource` 接口和 `createSeededRng` 实际接到他们自己的 `createBattle`/世界生成/
  外观系统里——这是他们自己仓库的工作，本设计只交付可复用的模式和证明它有效的范例，不代表他们的
  `createBattle` 已经自动获得确定性。
