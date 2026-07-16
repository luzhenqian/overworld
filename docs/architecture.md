# Overworld 架构说明

## 分层与依赖方向

```
┌─────────────────────────────────────────────────────┐
│                     你的游戏 (app)                    │
│   内容数据(NPC/对话/任务/成就) + 玩法系统 + UI 皮肤     │
└──────────────────────────┬──────────────────────────┘
                           │ 依赖(按需组合)
┌──────────────────────────▼──────────────────────────┐
│  系统包(互相之间零依赖)                                │
│  scene  input  dialogue  quest  inventory            │
│  achievements  tutorial  audio  notifications        │
│  loading  analytics                                  │
└──────────────────────────┬──────────────────────────┘
                           │ 只允许依赖 core
┌──────────────────────────▼──────────────────────────┐
│  @overworld-engine/core                                     │
│  EventBus / Registry / persistOptions / 公共类型      │
└─────────────────────────────────────────────────────┘
```

规则只有一条但必须严格遵守:**系统包之间禁止 import,只能通过 core 的事件总线和注册表间接协作**。
这是从 degener-city 中吸取的教训——那里的 questStore 直接 import 了 8 个玩法 store,
导致任务系统无法复用。

## 三种解耦机制

### 1. 事件总线(EventBus)

`@overworld-engine/core` 导出全局单例 `gameEvents`(也可以自建实例注入引擎,测试时必须自建)。
框架事件表 `OverworldEventMap` 覆盖玩家移动、场景切换、邻近、交互、对话、任务、物品、
成就、教程。游戏用 declaration merging 扩展:

```ts
declare module '@overworld-engine/core' {
  interface OverworldEventMap {
    'market:trade': { symbol: string; amount: number }
  }
}
```

典型链路:`Player` 发 `player:moved` → 任务引擎中 trigger 为 `player:moved` 的目标
按 `amountFrom: 'distance'` 累计 → 达标后发 `quest:objective-completed` →
成就引擎的计数器 +1 → UI 订阅弹 Toast。四个系统零相互引用。

### 2. 条件/效果注册表(Registry)

内容数据里的行为全部是声明式引用:

```ts
// 任务奖励(数据)
rewards: [{ type: 'wallet.addGold', params: { amount: 100 } }]

// 游戏启动时(代码)
effects.register('wallet.addGold', (params) => wallet.add(params.amount as number))
```

- `runEffects`:按序执行,未注册的 type 打 warning 跳过(内容错误不崩游戏)。
- `evaluateConditions`:AND 语义,空数组为 true,未注册的条件**fail closed**(返回 false)。

### 3. 内容注入(工厂函数)

每个引擎是 `createXxx(config)` 工厂,内容(任务表、对话树、成就表)从 config 传入,
支持运行期增量注册(`registerQuests` 等)。持久化通过 `persistOptions` 统一:
key 规范为 `overworld:<name>`、带版本号与 migrate、存储后端可替换
(localStorage / `createMemoryStorage()` / 自定义云存档适配器)。

## 3D 世界层(@overworld-engine/scene)

数据驱动:场景 = `SceneShell` + `NPCConfig[]` + `BuildingConfig[]` + 主题(`SceneTheme`)。
SceneShell 负责碰撞注册、NPC/建筑渲染(GLTF 加载失败回退几何体)、选中光环、玩家。
`Player` 是参数化控制器(模型/动画映射/速度/边界/碰撞半径,无模型时回退胶囊体),
移动经过碰撞解算(圆形碰撞体 + 迭代推出),按累计距离节流发出 `player:moved`。
邻近检测每帧比对玩家与实体距离,写入 sceneStore 并发 `proximity:enter/leave`;
交互键触发 `interact` 事件,由游戏决定打开对话还是面板。

键盘输入的**屏蔽判定**通过 `isInputBlocked` 回调注入(通常接 `@overworld-engine/input` 的
优先级层级),scene 包自身不依赖 input 包。

## 存档策略

沿用 zustand persist,全框架统一约定:**`persist` 省略或 `false` = 不持久化;`true` =
默认配置开启;传对象 = 自定义 `name`/`version`/`storage`**。key 统一前缀
(`overworld:<name>`),版本化迁移,存储后端可替换(localStorage / `createMemoryStorage()` /
自定义云存档适配器)。

多存档位:core 的 `createSaveSlots()` 提供 live 存档快照/恢复与命名槽位
(`saveTo/loadFrom/listSlots/deleteSlot/clearCurrent`),槽位存于
`overworld:slots:<name>`。注意:已完成 hydration 的 store 在 `restore` 后需要刷新页面
或逐个调用 `persist.rehydrate()` 才会反映恢复的数据。

## 测试策略

- 无头引擎(core/quest/dialogue/inventory/achievements/tutorial/input/notifications):
  纯 node 环境 vitest 单测,注入独立 EventBus 与 memory storage。
- 3D 层:碰撞/场景 store 走单测;渲染部分靠 examples/starter 作为集成验收。

## v0.2 已落地

- `@overworld-engine/environment`:昼夜循环(timeOfDay/相位/tick 驱动)+ 天气状态机(权重轮换、
  可注入随机源),R3F 组件 `EnvironmentTick`/`DayNightLighting`/`RainParticles`/
  `SnowParticles`/`WeatherVisuals`;事件表通过 declaration merging 扩展
  (`environment:phase-changed`/`environment:weather-changed`)——这正是留给游戏的扩展机制,
  框架自己也这么用。
- `@overworld-engine/minimap`:标记注册表 + 等比投影 + canvas 顶视图组件,玩家位置/朝向通过
  结构化 ref 传入,不依赖 three.js。
- 虚拟摇杆:`@overworld-engine/input` 的 `<VirtualJoystick>` + `createMovementInput()`;
  `Player` 的 `externalInput` 与键盘输入按向量合并,半推按比例减速。input 与 scene
  依然零相互依赖(共享形状靠结构化类型)。
- 存档槽位:见上文存档策略。

## v0.3 已落地

- `@overworld-engine/ai`:网格 A* 寻路(圆形障碍栅格化、禁切角、绳拉平滑、不可达回退最近可走格)+
  `createAgent` 行为体(巡逻 loop/ping-pong、游荡、跟随、速度按秒计)+ `<NPCWalker>` R3F 组件。
  朝向约定与场景包 Player 一致;`collidersToObstacles` 通过结构化类型直接消费碰撞 store 的数据,
  不引入对 scene 包的依赖。
- `@overworld-engine/devtools`:`validateDialogues/validateQuests/validateItems/validateAchievements/
  validateContent`(引用完整性、不可达节点、前置循环、效果/条件已注册核对、对话 quest.start →
  questId 跨包检查)+ `assertValidContent`(开发期启动即断言)+ `bindEventLogger`/
  `createEventRecorder`。校验输入是结构化 duck-type,devtools 不依赖任何系统包。
- 资产清单:loading 包的 `defineAssetManifest`/`mergeManifests`/`preloadManifest`
  (纯预热、不伪造进度,真实进度走 `useSceneLoadProgress`),见 docs/guides/assets.md。
- i18n 约定:内容字段一律不透明字符串(字面量或 key),渲染层翻译;Toast/事件载荷传
  key + 结构化参数,切语言不留旧语言残影。见 docs/guides/i18n.md,starter 有完整中英切换演示。

## v0.4 已落地

- `@overworld-engine/editor`:游戏内场景编辑器雏形 —— `<EditorScene>`(Canvas 内射线放置/选择/
  XZ 拖拽、占位几何体)+ `<EditorPanel>`(实体列表、属性编辑、导入导出)+ `<EditorToggle>`。
  导出 JSON 与 scene 包的 NPCConfig/BuildingConfig **结构兼容**(不 import scene)。
- NPC 日程系统(ai 包):`createSchedule({ agent, entries })` 按相位声明式切换行为
  (patrol/wander/follow/goTo/idle),`bindScheduleToBus` 经 `onAny` 泛化订阅
  `environment:phase-changed` —— ai 与 environment 之间零类型耦合。
- 动态避障(ai 包):`createAgent` 的 `avoid.obstacles` 回调把移动实体(如玩家)当障碍,
  逐帧线段探测 + ±30°/±60°/±90° 固定序偏转(确定性),卡死超时后走网格重寻路;
  规划路径本身从不被避障篡改。
- 内容 JSON Schema(devtools 包):对话/任务/物品/成就的 draft 2020-12 Schema
  (`allContentSchemas`),供外部 .json 内容文件用 ajv 校验、编辑器 `$schema` 补全。

## v0.5 已落地

- `@overworld-engine/net`:transport 无关的多人同步抽象 —— `Transport` 接口 + 三种参考实现
  (内存 hub / BroadcastChannel 跨标签页 / WebSocket 注入式),`createPresenceSync`
  (心跳按变更发送 + keepalive、过期清扫、bye 即时下线,`net:peer-joined/left` 事件),
  `relayEvents` 事件中继(重入标志防回声环),`<RemotePlayers>` 平滑插值渲染。
  starter 双开标签页即可互见幽灵玩家。
- 编辑器进阶:撤销/重做历史栈(拖拽/连续输入的 transient 突发合并为单个撤销步、上限 100)、
  实体复制(Ctrl/Cmd+D)、吸附步长可调、网格可视化。
- 层级化寻路(ai 包):`createHierarchicalGrid` 簇分区 + 入口图,`findPathHierarchical`
  窗口受限精化 + 全图 A* 兜底(可达性与普通 A* 严格一致);200×200 基准:访问格数
  3,393 vs 35,873。
- 行为树(ai 包):记忆式 sequence/selector、parallel(all/any)、wait/repeat/invert、
  blackboard、根完成自动复位;`goToAction/patrolAction` 等 agent 闭包动作节点,
  `tickTreeWithAgent` 显式组合(不魔改 agent)。

## v0.6 已落地

- 联机进阶(net 包):`createSnapshotBuffer` 延迟插值缓冲(渲染时刻 = now − delayMs,
  括值快照对插值、停发钳制不外推),presence 可选 `interpolation` + `samplePeer`,
  `<RemotePlayers>` 自动检测启用;`examples/ws-server` 参考中继服务器(房间、
  心跳收割、优雅关闭,真实三客户端验证)。
- 编辑器:实体模板目录(`setTemplates` 启动注册、放置模式选择器、字段预填走同一
  `addEntity` 路径继承撤销历史);GLTF 真实模型预览(fiber `useLoader` + Suspense +
  错误边界,失败回退占位几何体)。
- 云存档(core 包):`createRestStorage` 异步 REST 存储适配器(按 key 尾沿防抖、
  404=null、错误吞吐经 `onError`、`flush()` 关页前落盘),直接喂给 persist 的
  `storage` 即可切云存档。
- 性能剖析(devtools 包):`profileBus` 包裹 emit 统计每事件计数/总耗时/峰值,
  `top()`/`report()` 文本报表,叠加剖析链式生效(LIFO stop)。

## v0.7 已落地

- 输入预测/对账(net 包):`createPredictedState` 纯确定性核心 —— 本地立即预测、
  序号排队、权威快照到达后丢弃已确认输入并回滚重放,误预测触发 `onCorrection`;
  `createInputChannel` 传输配对;`examples/authority-server` 权威服务器示例
  (共享 step、服务端 clamp 反作弊、20Hz ack + 10Hz 世界广播)。
- 编辑器多选与对齐:`selectedIds` 多选(shift 点选/Ctrl+A)、群组拖拽合并单撤销步、
  对齐 min/center/max 与均分、删除/复制作用于选区;`selectedId` 保留为派生兼容字段。
- 性能预设(scene 包):`QUALITY_PRESETS` 三档(DPR 区间/阴影开关与贴图尺寸/粒子系数),
  `<ApplyQuality>` 应用到渲染器,`detectQualityPreset()` 设备启发式;粒子系数由游戏
  经 `useParticleMultiplier()` 消费。
- 内容热重载:docs/guides/content-hmr.md —— `import.meta.hot.accept` + 各引擎
  `registerX` 增量替换,替换语义逐引擎对照源码如实记载(含"活任务热加目标会死锁"
  边界),推荐先 `validateContent` 再注册。

## v0.8 已落地

- 1.0 API 冻结评审:docs/api-review-1.0.md,就绪度 B+;直接修复(audio `events`
  规范别名、persist 文档纠错、core README),P1–P15 提案待决策(store 形态统一、
  `interact` → `entity:interact`、audio persist 默认对齐、NPCWalker 行为树组合、
  NavGrid 格子级 API 等)。
- 发布流水线:changesets fixed 版本组 + `.github/workflows`(ci/release),
  18 包 dry-run 打包通过;见 docs/guides/releasing.md。
- 性能基准:benchmarks/ 七大套件 + baseline.json 对比 + 计数型回归守护
  (时间断言在 CI 抖,守护一律用访问格数/调用次数等确定量)。
- examples/dungeon:第二款示例(程序地牢/行为树敌人/钥匙宝箱链/HPA* 引路),
  证明框架不是只长成 starter 的形状;实战阻力点已并入评审报告。

## v0.9 已落地(破坏性变更收官)

评审提案 P1–P3、P11–P14 全部执行:store 形态统一为 `{ store, ...方法 }`、
`entity:interact` 双发过渡、audio persist 默认对齐、NPCWalker `driven`/`tree` 组合、
回退几何体尊重 scale、模型加载标准 Suspense + 错误边界(并修复 Player/Portal
无边界的潜在整树挂起)、`createNavGridFromCells` 格子级建网格。
两个示例已适配新 API,E2E 全量回归通过。API 自此冻结,进入 1.0 候选。

## 1.0 已发布(2026-07-16)

npm `@overworld-engine/*` 1.0.0(18 包)、文档站 overworld.web3noah.com、
GitHub luzhenqian/overworld。

## v1.1 已落地:多端支持

一套 Web 代码,三类交付(设计:docs/specs/2026-07-16-v1.1-multi-platform-design.md):

- `@overworld-engine/platform`(新):平台检测(wx→tauri→capacitor→telegram→web→node)、
  能力查询、PlatformBridge(存储/外链/安全区/震动/生命周期)+ 5 内置桥 + registerBridge,
  `app:paused/resumed/back` 总线事件;桥全部动态探测,零壳 SDK 硬依赖。
- `@overworld-engine/adapters-weapp`(新,适配层允许依赖 core/input/platform):
  wx 存储(喂 persistOptions)、`WeappWebSocket`(喂 net 注入口)、wx 音频后端
  (与 HTMLAudio 跑同一契约测试)、`createWeappCanvasRoot`(R3F 底层 createRoot,
  免 react-dom,内置 extend(THREE))、`createWeappTouchJoystick`。
- 框架增量:audio 后端注入 + pauseOnHide;scene `SpriteLabel` 跨端标签 +
  `labelMode`(SceneShell 透传);示例 vite 配置统一 dedupe react/fiber
  (修复 pnpm peer 多实例导致的 R3F hooks 崩溃)。
- 四个端模板:telegram-mini-app(TMA mock E2E)、desktop-tauri(macOS 真出包 .app/.dmg
  并启动验证)、mobile-capacitor(cap add+sync 双平台)、weapp-game(小游戏完整 3D,
  wx-shim 真浏览器 harness 21 断言,发布包体 1.01MB)。
- docs/guides/platforms.md:平台矩阵、通用接线、注入对照表、上架红线。

## v1.2 已落地:确定性与联机基建(首个生产消费方驱动)

- 可注入 clock/scheduler:achievements(unlockedAt)/quest(startedAt)/
  saveSlots(savedAt)/presence(lastSeenAt+清扫+插值时基)/toasts(createdAt+自动过期);
  默认懒绑定 Date.now 零破坏;各包带同 seed 重放全等测试。状态型与行为型墙钟
  边界成文(reconnect/防抖/淡入淡出不进状态,刻意保留)。
- `@overworld-engine/relay`(新):正式中继包(房间=URL 路径、verbatim 广播、
  心跳收割、payload 上限、优雅停机;bin + 编程 API + http server 挂载),
  含与 net 客户端的真 socket 互操作测试;examples/ws-server 改为薄包装。
- 线路协议规范(net 文档):传输信封/peerId 客户端生成/房间语义/应用层 `t`
  多路复用表/自建兼容中继检查单;2.0 前只增不改。
- 权威多人指南:外部确定性内核作为共享 step 的推荐接法(引擎不内置游戏状态仲裁)。
- 可测性:VirtualJoystick/MiniMap/编辑器全套 data-testid(可配前缀);
  官方测试指南确立 store 驱动断言为推荐路径。
- editor `configureEditorLabels` 文案全量覆写(全家桶唯一有内置可见文案的包);
  持久化互操作指南(权威数据不进 persist 守则);npm workspaces 兼容确认。

## v1.3 已落地:原生交互与出包

- 微信小游戏交互闭环(adapters-weapp):`createWeappPointerBridge` 用 fiber v8 的
  EventManager 复用其 raycast 管线,但**只由 wx.onTouch* 驱动**(不碰真实 DOM),
  故 wx-shim harness(真浏览器)与真机行为一致;vendor 适配器补 XMLHttpRequest
  (over wx.request)+ fetch shim,`useGLTF` 可加载真实 GLB。
- Telegram CloudStorage 云存档(platform):`createTelegramCloudStorage` 复刻
  Tauri 文件存储的「异步加载一次→同步镜像→异步写穿」模式;**透明键编码**
  (导出 `encodeCloudKey`/`decodeCloudKey`)解决 Telegram `[A-Za-z0-9_]` 键约束
  与框架冒号键的冲突——冒号 store 直接接入,`keys()`/`getItem` 仍讲原始键。
- CI 出包矩阵:examples 编译 job + build-artifacts.yml(Tauri macOS/Windows、
  Capacitor Android debug/iOS 模拟器,均无签名可绿);修复 pnpm action-setup 冲突。

（工程质量:本轮用带对抗验证的 workflow 编排——独立验证 agent 抓出了 CloudStorage
「冒号键在真机被静默拒收」的 hollow-green 缺陷,修复后以字符集强校验的 stub 端到端复验。）

## v1.4 已落地:授权闭环与出包硬化

- 编辑器↔SceneShell 场景往返(授权闭环):scene 导出 `SceneJson` 类型 +
  `<SceneFromJson>` 便捷组件 + 纯映射器 `sceneJsonToShellProps`/`sceneConfigToSceneJson`;
  devtools `sceneConfigSchema`(draft 2020-12)+ `validateScene`(mirror 其它内容校验);
  editor `sceneConfigToEditorEntities`/`loadSceneConfig`(把手写场景导入编辑器调整)。
  新示例 examples/scene-authoring 端到端演示编辑→导出→校验→从 JSON 出图→重新导入闭环。
- 跨端云端命名存档槽位:`FlushableStorage`(CloudStorage / Tauri 文件存储的 `flush()`
  排空序列化写队列,`app:paused` 前保证落盘);`createSaveSlots` 直接跑在 Telegram
  CloudStorage 镜像上,`overworld:slots:*` 槽位键沿用 v1.3 透明编码。
- 发布签名与商店上架:build-artifacts.yml 增签名/上传步骤(Apple 公证、Windows 签名、
  Google Play internal、TestFlight),用 `steps.detect.outputs` 布尔守卫——secrets
  缺失时跳过而非失败,无签名构件照常产出;docs/guides/signing-and-store.md 四端手册。

## v1.5 已落地:规模化授权与实时调试

- 编辑器多场景/关卡管理:命名场景(`scenes` + `activeSceneId`,新建/切换/改名/删除/复制,
  切换为历史边界)、`exportProject`/`importProject`(多关卡项目 JSON);devtools
  `sceneProjectSchema` + `validateSceneProject`(唯一 id/名、合法 activeSceneId、内层
  逐场景校验);scene `pickScene(project, nameOrId)` 结构化取关卡喂 `<SceneFromJson>`。
  单场景 `exportScene`/`importScene` 仍作用于活动场景,非破坏。
- `@overworld-engine/inspector`(新):`createEventStream`(单调计数环形缓冲,确定性、
  不用 Date.now)+ `<EventBusInspector>`(实时事件流 + 每事件计数,复用 devtools
  profileBus)+ `<StoreInspector>`(任意 zustand store 实时 JSON 快照)。dungeon 接入,
  E2E 证明面板显示真实事件与 store 字段。
- `@overworld-engine/content`(新):`defineContentPack`/`validateContentPack`/
  `applyContentPack` —— 校验门控(report 有 error 则拒绝、零注册)后按段调用 registerX
  注入引擎(引擎结构化传入,不 import);配合 core `defineMigrations`(顺序版本迁移,
  喂 `persistOptions.migrate`)做内容/存档演进。examples/content-packs 演示 v2 热更新。

## 版本路线(v1.6+)

微信 useGLTF 官方适配器 vendor 化、编辑器可视化关卡跳转/门户连线、内容包签名与
CDN 分发、多语言内容包工作流、性能预算 CI 门禁、录制回放(事件流 → 确定性重放)。
