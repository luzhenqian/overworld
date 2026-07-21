# 世界生产化 v2.1 设计文档 — 收口审计缺口

日期:2026-07-21
状态:已评审(范围:v2 反馈中未完成的 8 项;2 项 MISSING + 6 项 PARTIAL)
触发:对 v2.0.0(`docs/specs/2026-07-20-world-production-v2-design.md`)逐项**重新审计**
后发现:v2 覆盖表把 9 项标记为"已完成",但按真实 shipped 代码只有 3 项真正 FULL,
6 项 PARTIAL,另有 2 项从未进入 v2 设计文档(GPU 感知质量检测、NPC 动画契约)。

## 1. 目标与非目标

**目标**:把 v2 反馈里剩余的 8 项收口到 FULL,让"密集可行走 sci-fi 园区"级别的游戏
不必再在应用层补齐 GPU 质量检测、NPC 动画、LOD 释放/设备封顶、装饰 LOD、环境曝光/过渡、
跨区加载进度、雷达朝向。

**非目标**:
- 不重做已 FULL 的 3 项(统一输入锁、环境音区、可调轨道相机)。
- 不改变任何现有调用方的默认行为——8 项全部**加法式、向后兼容**。
- 不引入导航网格烘焙、HDRI 管线、HRTF 空间音频等重资产/重算法项。
- **不新增任何跨包 import 依赖边**。跨包协作只走 `core` 事件总线或 structural typing。

## 2. 铁律(继承 v2 / `docs/architecture.md`)

1. 系统包之间**零 import**;只可依赖 `@overworld-engine/core`。
2. 每项能力沉淀为**纯函数/无头 helper**(可 vitest 真值表单测)+ 薄 R3F 接线层。
3. 测试遵循仓库既有约定:**纯逻辑测试,不用 testing-library / renderHook**。
4. 版本:`@overworld-engine/*` 为 changesets **fixed 组**,一次协同 **minor** 升版;附一条 changeset。

## 3. 审计结论(基准)

| # | 反馈项 | 优先级 | 归属包 | 现状 | 需补 |
|---|---|---|---|---|---|
| 10 | GPU 感知质量检测 | P1 | `scene` | ❌ MISSING | 全新 |
| 11 | NPC 动画契约 | P1 | `scene` | ❌ MISSING | 全新 |
| 5 | 移动 NPC 动画态切换 | P1 | `scene` | ⚠️ PARTIAL | 接线(依赖 #11) |
| 4 | 运行时 LOD 释放/封顶/预载 | P1 | `scene` | ⚠️ PARTIAL | 补齐 |
| 3 | 实例化装饰 LOD 消费 | P1 | `scene` | ⚠️ PARTIAL | 接线 |
| 2 | 环境曝光/过渡/月光/色彩插值 | P0 | `environment` | ⚠️ PARTIAL | 补齐 |
| 6 | 跨区加载进度/重试/优先级 | P1 | `loading` | ⚠️ PARTIAL | 补齐 |
| 9 | 雷达朝向推断/配置类型 | P2 | `minimap` | ⚠️ PARTIAL | 补齐 |

已 FULL、不在本设计范围:#1 统一输入锁、#7 环境音区、#8 可调轨道相机。

---

## 4. `scene` — 质量与模型

### 4.1 #10 GPU 感知质量检测(MISSING)

**问题**:`detectQualityPreset()`(`packages/scene/src/quality.ts`)只看
`hardwareConcurrency` / `deviceMemory` / 移动 UA / coarse pointer,不看活动 WebGL 渲染器。
10 核 + SwiftShader 机器被判为 `high`,而软件光栅正是最需要 `low` 的场景(反馈实测首帧 44s→16s)。

**API 契约**(向后兼容:无参调用不变):

```ts
// packages/scene/src/quality.ts
export function detectQualityPreset(input?: {
  renderer?: string
  gl?: WebGLRenderingContext | WebGL2RenderingContext
}): QualityPresetName

/** 纯函数:命中软件光栅特征即 true。 */
export function isSoftwareRenderer(renderer: string): boolean
// 匹配(大小写不敏感):swiftshader | llvmpipe | softpipe |
//                      software rasterizer | (microsoft )?basic render(er)? driver

/** 从 gl 读 UNMASKED_RENDERER_WEBGL;扩展缺失/异常时返回 undefined(全程 guard)。 */
export function readWebglRenderer(
  gl: WebGLRenderingContext | WebGL2RenderingContext,
): string | undefined
```

**判定顺序**:先解析 renderer(优先 `input.renderer`,否则 `readWebglRenderer(input.gl)`);
若 `isSoftwareRenderer(renderer)` 为真 ⇒ 直接返回 `'low'`,**覆盖**核数/内存/移动判定;
否则回退到现有启发式。SSR / 无 `navigator` / 无 renderer 时行为与今日一致。

**验收**:`isSoftwareRenderer` 真值表(命中 5 类特征字符串 + 拒绝真实 GPU 名);
`detectQualityPreset({ renderer: '... SwiftShader ...' })` 无论核数一律 `'low'`;
无参 `detectQualityPreset()` 结果与现状逐字相同。

### 4.2 #11 NPC 动画契约(MISSING)

**问题**:`Player` 有 `PlayerAnimationMap` + `useAnimations` 的 idle/walk/run 交叉淡入,
但 `NPCConfig` / `BaseNPCProps` / `SceneShell.npcOptions` 无 clips、动画映射、mixer/action 态或
渲染扩展点;`useModelLoader` 直接**丢弃** `gltf.animations`。静态 NPC GLB 因此冻结。

**API 契约**:

```ts
// packages/scene/src/types.ts — 镜像 PlayerAnimationMap,idle 必填
export interface NPCAnimationMap {
  idle: string
  walk?: string
  run?: string
}
export interface NPCConfig {
  // ...现有字段...
  animationMap?: NPCAnimationMap
}

// packages/scene/src/BaseNPC.tsx
export interface BaseNPCProps {
  // ...现有字段...
  animationMap?: NPCAnimationMap
  /** 授权状态机的渲染/就绪扩展点。model 加载并配置完成后调用一次。 */
  onModelReady?: (ctx: {
    scene: THREE.Group
    actions: Record<string, THREE.AnimationAction | null>
    mixer: THREE.AnimationMixer
    names: string[]
  }) => void
  /** 可选:每帧读取的动画态 ref(供移动 NPC,见 #5);缺省恒为 'idle'。 */
  animStateRef?: React.RefObject<'idle' | 'walk' | 'run'>
}
```

**模型加载决策**:不破坏 `useModelLoader` 现有 `THREE.Group | null` 返回(被多处使用),
新增同风格姊妹 hook:

```ts
// packages/scene/src/useModelLoader.ts
export function useModelClips(opts: UseModelLoaderOptions): {
  model: THREE.Group | null
  animations: THREE.AnimationClip[]
}
```

`BaseNPC` 用 `useModelClips` → `useAnimations(animations, model)`,默认播放 idle
(按名解析,回退到索引约定,与 `Player` 完全一致)。把 `Player` 内联的 action 解析抽成
共享纯函数:

```ts
// packages/scene/src/animationClips.ts(新)
export function resolveClip(
  names: string[],
  requested: string | undefined,
  fallbackIndex: number,
): string | undefined
```

`Player` 改用 `resolveClip` 复用(行为不变,内部去重)。

**验收**:`resolveClip` 真值表(命名命中 / 缺失回退索引 / 越界返回 undefined);
`BaseNPC` 挂载后默认 idle action 处于 `isRunning`(集成层以最小渲染断言,纯逻辑覆盖解析);
`onModelReady` 收到 actions/mixer;向后兼容:无 `animationMap` 的 NPC 渲染路径不变。

### 4.3 #5 移动 NPC 动画态切换(PARTIAL,依赖 #11)

**问题**:`AgentStatus` 暴露 `isMoving` / `behavior`,但无消费者切换动画;NPC 无 glTF clip/mixer 机制
(#11 落地后即具备)。

**API 契约**:

```ts
// packages/scene/src/animationClips.ts
/** 纯函数:由 AgentStatus 推导动画态。 */
export function deriveNpcAnimState(status: {
  isMoving: boolean
  running?: boolean
}): 'idle' | 'walk' | 'run'
```

`AgentNPC` 每帧(已在写 `positionRef` 的同一 `useFrame` 中)把 `deriveNpcAnimState(status)`
写入 `animStateRef`;`BaseNPC`(#11 的 `animStateRef`)每帧读取并交叉淡入。ref-per-frame 模式与
现有 `positionRef` 一致,不新增机制。

**验收**:`deriveNpcAnimState` 真值表(静止→idle,移动→walk,移动+running→run);
`AgentNPC` 写 ref 的单测复用现有 ref 驱动测试风格。

### 4.4 #4 运行时 LOD:释放 + 设备封顶 + 预载优先级(PARTIAL)

**问题**:距离切换 + 滞回已 FULL/有测试,但:(a) 被替换的 LOD **从不释放**GPU 资源;
(b) `deviceCap` 逻辑存在却从未从质量层接入 `<Lod>`;(c) 预载只是"下一档"裸预取,无优先级。

**API 契约**:

```ts
// packages/scene/src/lod.ts
/** 纯函数:从 prev→next 切换时,哪些 level 索引应被释放。 */
export function levelsToDispose(
  prevIndex: number,
  nextIndex: number,
  levels: LodLevel[],
): number[]

/** 纯函数:质量档 → 最大可用 LOD 索引封顶(low 更粗)。 */
export function qualityToLodCap(preset: QualityPresetName): number

/** 纯函数:以 currentIndex 为中心的就近优先预载顺序。 */
export function orderPreload(levels: LodLevel[], currentIndex: number): number[]
```

- **释放**:`<Lod>` 只释放**它自己 clone 出的**几何/材质(卸载或切档时),
  **绝不** `useGLTF.clear()` 共享缓存(可能夺走其他实体仍在用的模型)。默认开启,可 `dispose={false}`。
- **设备封顶**:`BaseBuilding.tsx` / `BaseNPC.tsx` 读质量 store,把 `qualityToLodCap(preset)` 作为
  `deviceCap` 传入 `<Lod>`(今日从不传)。
- **预载**:`LodSwitch` 用 `orderPreload` 就近优先,替代单一 `levels[next+1]`。

**验收**:三个纯函数各自真值表;`<Lod>` 卸载调用 dispose 的集成断言(mock geometry.dispose 计数);
封顶后 `selectLodLevel` 不会返回超过 cap 的档。

### 4.5 #3 实例化装饰 LOD 消费(PARTIAL)

**问题**:`DecorationSet.lod?` 字段已声明但**完全无消费者**;`DecorationSetMesh` 恒加载
`set.modelPath`,装饰集永不 LOD 切换。

**API 契约**:

```ts
// packages/scene/src/decorationInstancing.ts
/** 纯函数:按玩家到装饰集质心的距离,选出应渲染的 modelPath。 */
export function selectDecorationModel(
  set: DecorationSet,
  playerPos: { x: number; z: number },
): string
```

`Decorations.tsx` 每帧(或节流)用 `selectDecorationModel` 选源模型,复用 `lod.ts` 的
`selectLodLevel` 语义(含滞回)。质心 = 实例位置均值(纯函数 `setCentroid(set)`)。
无 `lod` 字段的装饰集行为不变(恒 `modelPath`)。

**验收**:`selectDecorationModel` 真值表(近→LOD0,远→末档,含滞回);
`setCentroid` 纯测;无 lod 装饰集回归不变。

---

## 5. `environment` — #2 曝光 / 过渡 / 月光 / 色彩插值(PARTIAL)

**问题**:`WorldEnvironmentPreset` 缺反馈明确点名的 **exposure** 与 **transition duration** 覆盖;
"sun/moon" 仅有 sun;相位色彩在 daylight 0.5 处**硬切**而非插值。

**API 契约**:

```ts
// packages/environment/src/worldEnvironment.ts
export interface WorldEnvironmentPreset {
  // ...现有 sky / fog / lighting.sun / lighting.ambient...
  /** tone-mapping 曝光;随 daylight 因子在昼夜值间插值。 */
  exposure?: number | { day: number; night: number }
  lighting: {
    sun: DayNightValue
    ambient: DayNightValue
    /** 独立月光(夜间);缺省时回退今日"sun.night"行为。 */
    moon?: DayNightValue
  }
  /** 相位/timeOfDay 命令式切换的缓动时长(ms)。 */
  transitionDuration?: number
}

/** 纯函数:替代 daylight>=0.5 硬切,按 t 线性插值颜色。 */
export function lerpColor(a: string, b: string, t: number): string

/** 纯函数:命令式过渡的 0..1 进度(缓动)。 */
export function createPhaseTransition(durationMs: number): {
  advance(deltaMs: number): number // 返回 clamp 后的进度
  reset(): void
}
```

- 组件把解析后的 exposure 写入 `gl.toneMappingExposure`(随 daylight 因子插值)。
- `resolveLight` 改用 `lerpColor` 跨 daylight 因子插值(消除 0.5 硬切);保持纯函数。
- `moon` 存在时夜间用月光值,否则回退现有 sun.night(向后兼容)。
- `transitionDuration` 存在时,命令式 day↔night 切换经 `createPhaseTransition` 缓动;
  组件在 `useFrame` 驱动。缺省时行为与今日(跟随连续 timeOfDay)一致。

**验收**:`lerpColor` 真值表(t=0/1/0.5);`createPhaseTransition` 进度缓动 + clamp;
`resolveLight` 在 daylight=0.5 附近返回插值色而非硬切;无新字段的旧 preset 逐字回归。

---

## 6. `loading` — #6 跨区进度 / 真实重试 / 优先级桶(PARTIAL)

**问题**:四相位 + 就近排序 + 失败态 + 可查 dev handle 已 FULL,但:
(a) **跨区进度聚合缺失**(`preloadManifest` 不报进度);(b) `retryZone` 只重置错误态、
**不真正重新触发**预载;(c) 优先级只是距离的次级 tie-breaker。

**API 契约**:

```ts
// packages/loading/src/manifest.ts — 报告 0..1 进度
export function preloadManifest(
  manifest: ZoneManifest,
  opts?: { onProgress?: (fraction: number) => void },
): Promise<void>

// packages/loading/src/zoneStreaming.ts
/** 纯函数:优先级桶优先、桶内按距离。 */
export function orderZones(
  zones: ZoneManifest[],
  playerPos: { x: number; z: number },
): ZoneManifest[]

/** 纯函数:跨区加权进度聚合(0..1)。 */
export function aggregateZoneProgress(
  zones: Array<{ progress: number; weight?: number }>,
): number

// packages/loading/src/sceneLoadStore.ts
interface SceneLoadStore {
  // ...
  /** 真正重触发:清 startedRef 标记并重新调用 preload。 */
  retryZone(id: string): void
}
```

- `useZoneStreaming` 记录每区 fractional 进度;store 在四相位进度旁额外暴露 `aggregateZoneProgress`。
- `retryZone` 清 `startedRef` 中的 id 并重新 `preloadManifest`(今日仅清错误条目)。
- `orderZones` 以 priority 分桶优先、桶内距离次之,替代"距离主、priority 仅 tie-break"。

**验收**:`orderZones` / `aggregateZoneProgress` 真值表;`retryZone` 后 preload 被再次调用
(mock 计数);dev handle 仍可在 Playwright 无像素采样查询。

---

## 7. `minimap` — #9 雷达朝向推断 / 配置类型(PARTIAL)

**问题**:投影/颜色/边缘 clamp 已 FULL,但:(a) **朝向推断缺失**——`player:moved` 载荷不含
heading,`radar.ts` 要求调用方传入 `playerHeading`,无处从连续位置推导;(b) 选择器用本地
`RadarEntity`,而非反馈所述 `BuildingConfig`/`NPCConfig`。

**API 契约**(不改 `core` 事件 schema,不新增 import 边):

```ts
// packages/minimap/src/radar.ts
/** 纯函数:由前后位置推导朝向(弧度);位移小于死区则保留上一朝向。 */
export function inferHeading(
  prev: { x: number; z: number },
  next: { x: number; z: number },
  lastHeading: number,
  deadZone?: number,
): number

/** 有状态包装:喂入连续 player:moved 位置,吐出稳定 heading。 */
export function createHeadingTracker(deadZone?: number): {
  update(pos: { x: number; z: number }): number
  heading(): number
}
```

- `RadarEntity` 保留但对齐字段(补可选 `kind`),使 `BuildingConfig`/`NPCConfig` **structural
  satisfy** 之——零 import,靠结构类型。附类型级测试(把 config 形状对象喂入选择器编译通过)。
- `selectRadarMarkers` 的 `playerHeading` 参数保留(向后兼容),文档指向 `createHeadingTracker` 作为
  推荐来源。

**决策(已确认)**:朝向在 `minimap` 侧由位置增量推断(保零 import 边),不在 `player:moved`
事件加 `heading` 字段。

**验收**:`inferHeading` 真值表(正东/正北/死区保持);`createHeadingTracker` 序列稳定性;
config 形状对象通过 `selectRadarMarkers` 的类型级测试。

---

## 8. 跨切面

- **不新增依赖边**:#9 靠 structural typing,#5/#11 全在 `scene` 内,其余各自归属包。
  以 `pnpm -r typecheck` + 依赖图审查确认 0 新增 import。
- **向后兼容**:8 项全部加法式;所有新字段可选(#11 的 `NPCAnimationMap.idle` 仅在提供
  `animationMap` 时必填)。无 breaking change。
- **版本**:一条 changeset,`@overworld-engine/*` fixed 组协同 **minor** 升(2.0.0 → 2.1.0)。
- **文档**:更新 `docs/architecture.md` 覆盖表 / 相关 guide,标注 8 项收口。

## 9. 测试策略(仓库纯逻辑约定)

每个纯 helper 一张 vitest 真值表;R3F 接线层仅做最小集成断言(mock three 资源的 dispose 计数、
ref 写入、action.isRunning),**不用** testing-library / renderHook。清单:

- `scene`: `isSoftwareRenderer`、`readWebglRenderer`(mock gl)、`resolveClip`、`deriveNpcAnimState`、
  `levelsToDispose`、`qualityToLodCap`、`orderPreload`、`selectDecorationModel`、`setCentroid`。
- `environment`: `lerpColor`、`createPhaseTransition`、`resolveLight`(插值断言)。
- `loading`: `orderZones`、`aggregateZoneProgress`、`retryZone`(重触发计数)。
- `minimap`: `inferHeading`、`createHeadingTracker`、雷达 config 形状类型级测试。

## 10. 交付顺序(供实现计划参考)

1. #10 GPU 检测(独立、最小)。
2. #11 NPC 动画契约(为 #5 铺底)。
3. #5 移动 NPC 动画态(接 #11)。
4. #4 LOD 释放/封顶/预载。
5. #3 装饰 LOD 消费(复用 #4 的 lod 语义)。
6. #2 环境曝光/过渡/月光/色彩。
7. #6 加载进度/重试/优先级。
8. #9 雷达朝向/类型。
9. changeset + 文档 + 全量 `pnpm -r typecheck` / `test`。
