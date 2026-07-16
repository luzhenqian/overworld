# Overworld 1.0 API 冻结一致性评审

- 日期:2026-07-16
- 范围:packages/ 下 18 个包(src/index.ts + 主模块 + dist/*.d.ts)、docs/architecture.md、各包 README、apps/docs 包页面
- 方法:逐包通读公共入口与引擎主模块;grep 全仓验证依赖规则 / persist 约定 / 事件命名 / `: any` 泄漏;README 与 docs 页 API 标识符反向核对源码

---

## 一、结论摘要(冻结就绪度评级)

**评级:B+ —— 有条件就绪。**

约定的执行度整体很高:依赖规则(系统包零互相 import)经 grep 验证为 **0 违例**;`persist?: boolean | Config` 约定在全部 7 个可持久化引擎中形状一致;事件命名除一个历史遗留(`interact`)外全部为 kebab-case `domain:action`;dist 类型声明无 `: any` 泄漏;18 个包的 package.json 元数据字段形态完全一致;peer 版本范围完全一致(react `^18.0.0` / zustand `^5.0.0` / three `>=0.160.0` / fiber `^8.0.0` / drei `^9.0.0`)。

**冻结前必须决策的两件事**(见破坏性提案 P1/P2):

1. **store 暴露形态三种并存**(hook 直返 / `{ store }` 对象 / `{ useStore, getState }` 对象)——这是唯一会"永久固化"的大不一致,1.0 后再改成本翻倍。
2. **`interact` 事件无 domain 前缀**——事件表里唯一的例外,趁 pre-1.0 更名窗口处理。

工厂 vs 单例的划分是**有原则的**,可以照此写入文档:**承载内容与存档、可多实例、可注入总线的领域引擎一律 `createXxx(config)` 工厂**(dialogue/quest/inventory/achievements/tutorial/environment/audio/net/ai);**进程级天然唯一的基础设施与 UI 队列一律模块级单例 hook**(`useKeyboardStore` 输入层级、`useSceneStore`/`useCollisionStore`/`useQualityStore` 场景运行态、`useToastStore`/`useAlertStore` 通知队列、`useLoadingStore` 加载任务、`useMinimapStore` 标记表、`useEditorStore` 编辑器工作集)。唯一游离于两种模式之外的是 analytics 的模块级函数单例(`configureAnalytics`/`track`),见 P8。

---

## 二、已直接修复项(本次评审直接落地,全部低风险)

| # | 修复 | 文件 | 性质 |
| --- | --- | --- | --- |
| 1 | audio 配置新增 `events?` 规范别名(全框架唯一用 `bus?` 命名总线的引擎;`bus` 保留为旧别名并注明,同传时 `events` 优先) | `packages/audio/src/audioManager.ts` | 附加别名(任务允许项),+2 个测试 |
| 2 | audio `persist` 默认值文档纠偏:README 与 docs 页原写"默认关闭",**代码实际是 `config.persist ?? true`(默认开启)**,已改为如实描述并标注"与其他引擎约定不同" | `packages/audio/README.md`、`apps/docs/content/docs/packages/audio.mdx` | 文档纠错(代码未动,见 P3) |
| 3 | audio 配置表 `bus` 行改为 `events`(附别名说明) | 同上两文件 | 文档 |
| 4 | achievements / inventory / tutorial 的 `persist` 配置 JSDoc 统一为框架约定措辞("omitted or `false` = disabled; `true` = enabled with defaults; object = custom",此前只写 "Enable persistence by providing (possibly empty) persist settings",未说明 `true`/`false` 语义) | `createAchievements.ts` / `createInventory.ts` / `createTutorial.ts` | 文档(JSDoc) |
| 5 | 新增 `packages/core/README.md`——core 是 18 个包中唯一没有 README 的(npm 包页面会空白),内容取自 docs 站 core 页浓缩 | `packages/core/README.md` | 新增文档 |

验证:audio(20 测试)、achievements(14)、inventory(23)、tutorial(13)四包 `build + typecheck + test` 全绿;其余改动为纯 md。

**未修(刻意)**:audio/notifications 缺 react peerDependency(见 P9)——改 package.json 依赖需同步 lockfile,超出本次"无 install"约束。

---

## 三、破坏性提案

### P1(重点)store 暴露形态统一 —— 建议 1.0 前

**现状**,三种形态并存:

| 形态 | 包 | 返回值 |
| --- | --- | --- |
| A:工厂直接返回 zustand hook | dialogue(`DialogueEngine = UseBoundStore<StoreApi<State>>`)、quest(同) | 引擎即 hook,方法挂在 state 上 |
| B:`{ store: StoreApi(vanilla), ...方法 }` | achievements、inventory、tutorial、environment、net(`PresenceSync.store`) | 方法在对象上,store 是 vanilla,React 侧走 `useStore(engine.store, sel)` |
| C:`{ useStore: UseBoundStore, getState, ...方法 }` | audio | 第三种混合形态 |

**提案**:统一为 **B 形态 `{ store, ...方法 }`**。理由:(a) 现存 5 个包已是 B,迁移面最小;(b) vanilla store + `useStore` 使 headless 包不必绑定 React 入口(达成"纯 node 单测"的测试策略);(c) 方法在对象上而非 state 上,d.ts 更干净、`getState()` 快照不携带函数。可在 core 增加 `useEngine(engine, selector)` 便捷 hook 弥补 A 形态的书写舒适度。

**影响面**:dialogue/quest 的所有调用点(`useDialogue((s) => ...)` → `useStore(dialogue.store, ...)`、`engine.getState().start(...)` → `dialogue.start(...)`),含 starter 示例、docs、`relationshipEffects`(依赖 `engine.getState()`);audio 的 `useStore`→`store` 更名。这是全清单里迁移成本最高的一项,**但 1.0 后成本只会更高**。

**建议时机**:1.0 前。若 1.0 排期不允许,至少在 dialogue/quest 上附加 `.store` 属性(hook 对象上挂 vanilla 引用,附加不破坏),把 A 形态"降级"为兼容层,2.0 收口。

### P2(重点)`interact` 事件更名为 `entity:interact` —— 建议 1.0 前

**现状**:`OverworldEventMap` 中唯一无 domain 前缀的事件(`packages/core/src/events.ts`),由 `packages/scene/src/interaction.ts` 的 `interact()` 发出,载荷 `{ kind: EntityKind; id: string }`。
**提案**:事件表新增 `'entity:interact'`(同载荷);`scene.interact()` 双发一个过渡版本(或 pre-1.0 直接更名不双发);1.0 冻结时移除裸 `interact`。docs 站 core 页事件表同步。
**影响面**:所有订阅 `interact` 的游戏代码(starter、示例、外部早期用户);框架内部无消费者(grep 确认只有 scene 发、无包订阅)。
**建议时机**:1.0 前(更名窗口关闭在即;若拖到 2.0 则必须走双发弃用周期)。

### P3 audio `persist` 默认值对齐约定 —— 建议 1.0 前

**现状**:架构文档约定"`persist` 省略或 `false` = 不持久化",7 个引擎中 6 个遵守;audio 是 `config.persist ?? true`(默认**开启**,键 `overworld:audio`)。本次已把文档改为如实描述,但约定违背仍在。
**提案**:1.0 改为省略 = 关闭,与全框架一致;starter/模板中显式传 `persist: true` 保持体验。
**影响面**:依赖默认持久化音量/静音的游戏,升级后设置不再自动保存(体验回退,不丢已存数据)。
**建议时机**:1.0 前;若保留现状,则必须在架构文档的约定处标注"audio 例外"。

### P4 PersistConfig 字段集统一(`prefix` 缺口)—— 1.0 前(附加,不破坏)

**现状**:achievements/inventory/tutorial/environment 的 PersistConfig 含 `name/version/prefix/storage`;dialogue/quest/audio 的只有 `name/version/storage`,**缺 `prefix`**,且七个包各自手写同构接口。
**提案**:dialogue/quest/audio 补 `prefix?`(透传给 `persistOptions`,附加不破坏);七处接口收敛为 core 导出的公共别名(如 `Pick<OverworldPersistConfig<S>, 'name' | 'version' | 'prefix' | 'storage'>`)。
**影响面**:无破坏;涉及 persist 路径,故本次未直接改(任务边界)。

### P5 `context` 惰性化补齐 —— 1.0 前

**现状**:dialogue/quest 为 `context?: Ctx | (() => Ctx)`(JSDoc 明确 lazy 语义);achievements/inventory 仅 `context?: Ctx`。
**提案**:补齐为 `Ctx | (() => Ctx)`。
**影响面**:几乎为零;唯一边角是 `Ctx` 本身为函数类型的用户(语义歧义),与 dialogue/quest 现状一致。涉及运行时解析逻辑,故未在本次直接改。

### P6 audio `bus` 别名移除 —— 2.0

本次已加 `events` 规范别名并文档化;`bus` 保留到 2.0 移除即可。

### P7 registries 可选性统一 —— 1.0 前(放宽,不破坏)

**现状**:参数名全部统一为 `conditions`/`effects`(达标);但 dialogue/quest 的两者**必填**,achievements/inventory 的 `effects` **可选**(默认空注册表)。
**提案**:dialogue/quest 的 `conditions`/`effects` 改可选、默认空注册表(未注册条件本就 fail-closed、未注册效果本就 warn-skip,语义自洽)。放宽必填为可选不破坏任何现有调用。

### P8 analytics 形态决策 —— 1.0 前定调(可不改代码)

**现状**:`configureAnalytics`/`track`/`trackPage`/`resetAnalytics` 模块级单例,是唯一既非工厂也非单例 store 的包。
**提案**:埋点天然进程级全局,保留单例**可以接受**,但需在架构文档"工厂 vs 单例"原则处显式点名归类(本报告第一节的措辞可直接采用);若追求纯粹,2.0 提供 `createAnalytics()` 工厂 + 默认实例。
**影响面**:改工厂则波及所有 `track()` 调用点,不建议 1.0 做。

### P9 peer 依赖缺口(非破坏,发布流水线前必须)

audio 与 notifications 从 `'zustand'`(React 入口,内部 `useSyncExternalStore`)import `create`,却未声明 react peerDependency(对照:dialogue/quest 声明了)。发布前补 `"react": "^18.0.0"` 并同步 lockfile;或将二者改用 `zustand/vanilla`(audio 走 P1 的 B 形态时顺带解决,notifications 的 hook 定位则应补 peer)。

### P10 杂项类型卫生 —— 2.0 或标注

- scene 导出通用工具类型 `DeepPartial`(名字太泛,易与用户环境冲突)——建议 `@internal` 或更名 `SceneThemeOverrides` 场景专用类型;
- `MovementInputRef` 在 scene 与 input 双导出(结构化共享是刻意设计,architecture.md 已说明)——建议在两处 JSDoc 互相注明,防止被当成 drift;
- 全部 18 包 `exports` 仅有 `import` 条件(ESM-only,无 `require`/CJS)——形态一致没有问题,但应在 README/docs 声明这是 1.0 的支持矩阵承诺。

---

## 四、各包状态表

值/类型导出数取自 dist/index.d.ts 顶层声明统计;测试数为 `it/test` 用例数(本次修复后)。文档页 = apps/docs/content/docs/packages/<包>.mdx,18/18 全覆盖;README 18/18(core 为本次补齐)。

| 包 | 值导出 | 类型导出 | 测试数 | README | docs 页 | 就绪度 | 备注 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| core | 13 | 21 | 34 | ✅(本次新增) | ✅ | ✅ 就绪 | `interact` 事件更名待决(P2) |
| scene | 27 | 30 | 38 | ✅ | ✅ | ⚠️ 待决 | `interact()` 双发(P2)、`DeepPartial`(P10) |
| input | 11 | 7 | 30 | ✅ | ✅ | ✅ 就绪 | 单例模式,归类清晰 |
| dialogue | 2 | 8 | 14 | ✅ | ✅ | ⚠️ 待决 | A 形态 hook 直返(P1)、registries 必填(P7) |
| quest | 1 | 10 | 19 | ✅ | ✅ | ⚠️ 待决 | 同 dialogue |
| inventory | 1 | 9 | 23 | ✅ | ✅ | ✅ 就绪 | context 惰性化(P5) |
| achievements | 1 | 7 | 14 | ✅ | ✅ | ✅ 就绪 | context 惰性化(P5) |
| tutorial | 1 | 8 | 13 | ✅ | ✅ | ✅ 就绪 | — |
| audio | 1 | 4 | 20 | ✅ | ✅ | ⚠️ 待决 | persist 默认 true(P3)、C 形态(P1)、react peer(P9) |
| notifications | 6 | 9 | 18 | ✅ | ✅ | ✅ 就绪 | react peer(P9) |
| loading | 8 | 6 | 24 | ✅ | ✅ | ✅ 就绪 | — |
| analytics | 9 | 6 | 12 | ✅ | ✅ | ⚠️ 定调 | 单例形态归类写入文档(P8) |
| environment | 13 | 13 | 21 | ✅ | ✅ | ✅ 就绪 | B 形态标杆 |
| minimap | 4 | 5 | 13 | ✅ | ✅ | ✅ 就绪 | — |
| ai | 31 | 30 | 100 | ✅ | ✅ | ✅ 就绪 | 面积最大,d.ts 干净 |
| devtools | 23 | 25 | 75 | ✅ | ✅ | ✅ 就绪 | 零 peer,纯 duck-type |
| editor | 9 | 18 | 87 | ✅ | ✅ | ✅ 就绪 | 单例 store 归类清晰 |
| net | 10 | 23 | 52 | ✅ | ✅ | ✅ 就绪 | `PresenceSync.store` 为 B 形态 |

**横切验证结果**:系统包互相 import:0(grep 全仓,仅 2 处注释命中);d.ts `: any`:0(仅 1 处注释命中);peer 范围:完全一致;package.json 字段(type/main/types/exports/files/sideEffects/license/repository.directory/description):18/18 齐全且形态相同;版本:18/18 统一 0.7.0。

---

## 五、建议的冻结顺序

1. **1.0-rc 前**:P1(store 形态,或至少 A 形态挂 `.store` 兼容层)→ P2(`interact` 更名)→ P3(audio persist 默认)→ P9(peer + lockfile)。
2. **1.0 前顺手(全部不破坏)**:P4(prefix 补齐)、P5(context 惰性)、P7(registries 可选化)、P8(文档定调)。
3. **2.0**:P6(移除 `bus` 别名)、P10(`DeepPartial` 收敛)。

## 附:第二款示例(dungeon)实战暴露的阻力点

开发 examples/dungeon 过程中记录的框架摩擦,按优先级并入 1.0 待办:

1. **P11(1.0 前)** `NPCWalker` 与行为树组合会双步进(两者都调 `agent.update`)——
   给 NPCWalker 加 `driven?: boolean` 或 `tree` prop。
2. **P12(1.0 前)** `BaseNPC` 回退胶囊硬编码 6 单位高且无视 `scale` prop —— 回退几何体应用 scale。
3. **P13(1.0 前)** `useModelLoader` 把 Suspense promise 当错误捕获,晚加载的模型不触发重渲染
   永不出现;唯一缓解是模块级 `preloadSceneModels`(连 starter 自己都没调)——
   区分 promise 与 Error,或文档强制预加载。
4. **P14(1.0 前)** `NavGrid` 缺格子级 API —— tile 地图要用调参过的 `blockCircle` 才能精确
   封一格;应提供 `blockCell(cx, cz)` / `fromCells()`。
5. **P15(2.0 可)** `BuildingConfig.modelPath` 必填且无回退友好路径;BaseNPC 名牌/徽章高度
   假设大胶囊,小模型徽章悬空。
6. 文档补充:SceneShell 的 buildings-only 邻近通道与自定义可交互物的组合方式。
