# 世界生产化 v2 设计文档

日期:2026-07-20
状态:已评审(范围:P0–P2 全量;按"归位到各包 + scene 缝合"分布)
触发:某游戏团队(投资人生模拟器)在 `@overworld-engine/scene` 1.4 上做密集可行走
sci-fi 园区时,把大半个世界层重造在了应用代码里。本设计把这些能力**归位**到各自
的框架包,补齐真实缺口,并提供不引入跨包依赖的缝合层。

## 1. 目标与非目标

**目标**:让一款"密集可行走 3D 园区"级别的游戏,不必在应用层重造
输入锁 / 环境层 / 实例化装饰 / LOD / 移动 NPC / 流式加载态 / 环境音区 / 轨道相机 /
雷达。这些能力沉淀进框架,并保持互操作约定。

**非目标**:
- 不把功能都堆进 `scene`。严格遵守"系统包之间零 import,只依赖 `core`,跨包协作走
  事件总线/结构化类型"的铁律(见 `docs/architecture.md`)。
- 不引入导航网格烘焙工具、HDRI 资产管线、空间音频 3D 声像(HRTF)等重资产/重算法项——
  只提供框架级 API,资产与内容仍是游戏侧职责。
- 不做破坏性变更(除 `scene` 因新增能力升 2.0.0 外,所有默认行为向后兼容;见 §12)。

**核心发现**:反馈的 10 项请求里,只有 3 项(实例化装饰、运行时 LOD、轨道相机)是
`scene` 的真正新缺口;其余要么别的包已实现(`ai` 的移动 NPC 栈、`loading` 的进度聚合、
`minimap` 的投影)、要么应在其归属包补齐(`environment` 的环境预设、`audio` 的音区、
`input` 的输入分层)。设计据此**归位**,而非集中。

## 2. 归位总览

| # | 请求 | 优先级 | 归属包 | 性质 |
|---|---|---|---|---|
| 1 | 统一输入锁 | P0 | `core` + `input` + `scene` | 新原语 + 接线 |
| 2 | WorldEnvironment 预设 | P0 | `environment` | 现有引擎上的组合层 |
| 3 | 实例化装饰渲染器 | P1 | `scene` | 全新 |
| 4 | 运行时 LOD + 预算 | P1 | `scene` | 全新 |
| 5 | 移动/日程 NPC | P1 | `scene`(复用 `ai`) | 集成(ref 驱动) |
| 6 | 世界流式加载 + 加载态 | P1 | `loading` | 扩展 |
| 7 | 环境音区 + 总线 | P2 | `audio` | 扩展 |
| 8 | 可调轨道相机 | P2 | `scene` | 全新 |
| 9 | 雷达原语 | P2 | `minimap` | 扩展 |

跨包协作一律走 `gameEvents`/`OverworldEventMap` 或结构化类型(structural typing),
**新增 0 条 import 依赖边**。下面逐项给出 API 契约与验收。

---

## 3. P0 — 统一输入锁(`core` + `input` + `scene`)

### 3.1 问题

`scene` 的 `Player`、`useInteractKey`、相机各自接受 `isInputBlocked` 回调,游戏要为每个
输入源重复接线同一个"模态是否打开"条件。`input` 已有成熟的键盘优先级分层
(`KEYBOARD_PRIORITY`/`useKeyboardStore`/`useKeyboardLayer`),但它是**键盘专属**——摇杆、
交互键、相机拖拽都不查它。缺一个所有输入源共用的、无依赖的单一真相源。

### 3.2 `core`:无头输入锁单例

core 保持纯 TS(不引 zustand/react),新增与 `gameEvents` 同风格的单例:

```ts
// packages/core/src/inputLock.ts
export interface InputLock {
  /** 获取一把命名锁(幂等:同 id 重复 acquire 只计一次)。 */
  acquire(id: string): void
  /** 释放一把命名锁(幂等)。 */
  release(id: string): void
  /** 是否有任意锁被持有。 */
  isLocked(): boolean
  /** 当前持有的锁 id 列表(稳定排序)。 */
  activeLocks(): string[]
  /** 订阅锁状态变化,返回解绑函数。 */
  subscribe(fn: (locked: boolean, active: string[]) => void): () => void
  /** 释放全部锁(场景切换/测试清理)。 */
  releaseAll(): void
}
export const inputLock: InputLock   // 全局单例
```

- 每次 `acquire`/`release` 导致 `isLocked()` 结果变化时,`inputLock` 在 `gameEvents`
  上 emit `'input:lock-changed'`(可选注入的 bus:`inputLock` 默认用 `gameEvents`,
  测试可 `createInputLock(bus)`——导出工厂 `createInputLock(bus?)` 供隔离测试)。
- `OverworldEventMap` 新增:`'input:lock-changed': { locked: boolean; active: string[] }`。

**为什么在 core**:core 已是唯一被所有包依赖的层,且已承载跨切面单例(`gameEvents`)与
纯逻辑。输入锁是跨 `input`/`scene`/未来输入源的单一真相源,放 core 让各方零互相 import
即可共用。它是纯 TS,不破坏 core 的框架无关性。

### 3.3 `input`:键盘层桥接到输入锁

`useKeyboardLayer` 增加第三参对象形态,`lockInput` 为真时该层激活期同时持有 `inputLock`:

```ts
// 兼容旧签名:useKeyboardLayer(id, priority, blockedKeys?)
export function useKeyboardLayer(
  id: string,
  priority: number,
  opts?: string[] | { blockedKeys?: string[]; lockInput?: boolean }
): void
```

- `lockInput: true` → 组件挂载时 `inputLock.acquire(id)`,卸载时 `release(id)`。
  模态/对话框一次调用即同时屏蔽键盘、摇杆、交互键、相机拖拽。
- `VirtualJoystick`:每帧写 `MovementInputRef` 前查 `inputLock.isLocked()`,锁定时输出
  归零(不 emit 移动)。新增 prop `respectInputLock?: boolean`(默认 `true`)。

### 3.4 `scene`:默认消费输入锁

`Player`、`useInteractKey`、`FollowCamera`(轨道模式)在**未显式传** `isInputBlocked` 时,
默认回退为 `() => inputLock.isLocked()`:

```ts
// Player / useInteractKey / FollowCamera 内部:
const blocked = isInputBlocked ?? (() => inputLock.isLocked())
```

- 因锁初始为空、从不 `acquire` 的老游戏零行为变化;传了自己回调的老游戏保持不变。
  → 附加式、非破坏(见 §12)。
- 新增 React 便捷 hook(scene 侧,订阅 core 单例):
  `export function useInputLocked(): boolean`(供 HUD 置灰等)。

### 3.5 验收

- core:`inputLock` 单测——幂等 acquire/release、`isLocked`/`activeLocks`、subscribe 通知、
  `input:lock-changed` emit、`releaseAll`;`createInputLock(bus)` 隔离。
- input:`useKeyboardLayer({lockInput})` 挂载/卸载对称 acquire/release;`VirtualJoystick`
  锁定时输出归零(jsdom + 假 ref)。
- scene:`Player` 无回调时随 `inputLock` 阻断移动;显式回调优先;`useInteractKey` 同理。

---

## 4. P0 — WorldEnvironment 预设(`environment`)

### 4.1 问题

`environment` 已有昼夜引擎、天气状态机、`DayNightLighting`、雨雪粒子、`WeatherVisuals`,
但**没有** sky / fog / ground / env-map 的组合层,也没有"具名整场景预设"。每个游戏都要
重写同一套 quality 感知的环境层。

### 4.2 API

```ts
// packages/environment/src/WorldEnvironment.tsx
export interface WorldEnvironmentPreset {
  sky?:
    | { top: string; bottom: string; sunColor?: string; sunPosition?: Vec3 }  // 渐变穹顶
    | { hdri: string }                                                        // drei <Environment>
  fog?: { color: string; near: number; far: number }        // 线性
       | { color: string; density: number }                 // 指数 fogExp2
  ground?: { color: string; roughness?: number; metalness?: number; size?: number } | false
  lighting?: {
    ambient?: DayNightValue<{ color: string; intensity: number }>
    sun?: DayNightValue<{ color: string; intensity: number }> & { position?: Vec3; castShadow?: boolean }
  }
  envMapIntensity?: number
  stars?: boolean | { count: number }
}

export const WORLD_ENV_PRESETS: Record<
  'clear-noon' | 'overcast' | 'foggy-dusk' | 'night',
  WorldEnvironmentPreset
>

export interface WorldEnvironmentProps {
  /** 具名预设或自定义预设对象。默认 'clear-noon'。 */
  preset?: keyof typeof WORLD_ENV_PRESETS | WorldEnvironmentPreset
  /** 可选昼夜引擎:传入则光照/雾/天空随 getDaylightFactor 时间插值。 */
  engine?: Environment
  /**
   * 画质提示(结构化传入,避免 environment→scene 依赖)。
   * 游戏侧:quality={useQualityStore.getState().settings}
   */
  quality?: { shadows: boolean; shadowMapSize: number; particleMultiplier: number }
  /** 自定义 R3F 子节点仍然允许(在预设之上叠加)。 */
  children?: React.ReactNode
}
export function WorldEnvironment(props: WorldEnvironmentProps): JSX.Element
```

- sky:默认实现为大号内翻球渐变着色(无重依赖);`{ hdri }` 时用 drei `<Environment files>`。
- fog:挂到 R3F `scene.fog`(`<fog>` / `<fogExp2>`);随 `engine` 存在时按昼夜插值颜色。
- ground:大平面 `meshStandardMaterial`;`false` 时不渲染(游戏自带地面)。
- lighting:复用现有 `DayNightLighting` 思路,`shadow-mapSize` 取 `quality.shadowMapSize`,
  `castShadow` 取 `quality.shadows`。
- stars:`THREE.Points`,数量 × `quality.particleMultiplier`。
- **quality 结构化传入**:`environment` 不 import `scene` 的 `useQualityStore`;接受纯对象。

### 4.3 验收

- 纯逻辑抽到 `worldEnvironment.ts`(选预设、解析 fog/light 数值、按 daylightFactor 插值),
  jsdom 下可测(不进 GL)。
- 组件级:传 `engine` 时 fog/光照数值随 `setTimeOfDay` 变化(mock daylightFactor)。

---

## 5. P1 — 实例化装饰渲染器(`scene`,全新)

### 5.1 问题

`scene` 的碰撞 API 已理解 decoration 分组(`DecorationCollisionGroup`),但**没有**匹配的
装饰渲染器/实例化/LOD。游戏为路灯/树/长椅/数据柱各建 `InstancedMesh`,并手动保持其
transform 与碰撞条目同步——重复数据、易漂移。

### 5.2 API

```ts
export interface DecorationSet {
  id: string
  modelPath: string
  instances: DecorationInstance[]            // 复用现有 { position; rotation?; scale? }
  collision?: { radius: number }
  lod?: Array<{ distance: number; modelPath: string }>   // 见 §6
}
export interface DecorationsProps {
  sets: DecorationSet[]
  /** 从同一 instances 派生碰撞条目并注册进 collisionStore。默认 true。 */
  registerCollision?: boolean
}
export function Decorations(props: DecorationsProps): JSX.Element
```

- 渲染:对每个 set 的 GLB,遍历其 mesh,为每个(mesh, material)建一个 `InstancedMesh`
  (count = instances.length),按 `{position, rotation?, scale?}` 写 `setMatrixAt`。
- **单一真相源**:碰撞从同一 `instances` 派生,消灭"手动同步 transform"。当
  `registerCollision` 为真,内部复用现有 `collisionStore.registerCollider`,type 为
  `'decoration'`,id 为 `decoration-${set.id}-${i}`——与现有 `CollisionRegistration`
  的装饰命名一致,可与 `SceneShell` 的 `decorationCollisions` 二选一(见 §11 迁移)。
- LOD:`lod` 存在时,按整 set 与玩家的代表距离(或按实例分桶)切换实例源;实现复用 §6
  的滞回逻辑(整 set 粒度先落地,per-instance 分桶列为后续)。
- 约束:面向"单一/少材质的重复装饰模型"这一典型;多材质骨骼网格不在本渲染器范围
  (用 `BaseNPC`)。JSDoc 明确此约束。

### 5.3 验收

- 纯逻辑抽 `decorationInstancing.ts`:instances → 矩阵数组、instances → 碰撞条目;可测。
- 组件级(jsdom):`registerCollision` 开关正确增删 collisionStore 条目;卸载清理。

---

## 6. P1 — 运行时 LOD + 预算(`scene`,全新)

### 6.1 API

`BuildingConfig` / `NPCConfig` 新增可选字段:

```ts
interface BuildingConfig { /* ...现有... */ lods?: Array<{ distance: number; modelPath: string }> }
interface NPCConfig      { /* ...现有... */ lods?: Array<{ distance: number; modelPath: string }> }
// base modelPath = LOD0;lods 按 distance 升序,distance 为"切到下一级的阈值"
```

通用 LOD 切换组件:

```ts
export interface LodLevel { distance: number; modelPath: string }
export interface LodProps {
  /** 用于测距的世界位置(通常 = 实体 position)。 */
  position: Vec3
  /** 含 base 在内的层级,近→远。 */
  levels: LodLevel[]
  /** 滞回带宽(世界单位),防止边界抖动。默认 2。 */
  hysteresis?: number
  /** 低端设备可用的最高层级索引(封顶最精模型)。 */
  deviceCap?: number
  /** 渲染当前选中的 modelPath(调用方决定如何加载/渲染)。 */
  render: (modelPath: string) => React.ReactNode
}
export function Lod(props: LodProps): JSX.Element
```

- 每帧读 `playerPositionRef` 计算距离,带滞回带选级(切远需超阈值+带宽,切近需低于阈值−带宽)。
- 预载:选中级邻近的下一级用 `useGLTF.preload` 提前拉取(优先级 = 距离越近越先)。
- 释放:离开某级一定时间后 `useGLTF.clear(modelPath)`(可配 `disposeDelayMs`,默认不激进释放,
  避免抖动重载)。
- 设备封顶:`deviceCap` 限制最高精度级(游戏可传 `low` 档索引)。
- `BaseBuilding`/`BaseNPC`:检测到 `config.lods` 时自动改走 `<Lod>` 包裹现有模型渲染路径;
  无 `lods` 时行为不变。
- `preloadSceneModels` 扩展:遍历 `lods` 的所有 modelPath(可选 `{ lodPriority?: 'nearest'|'all' }`)。

### 6.2 验收

- 纯逻辑抽 `lod.ts`:`selectLodLevel(distance, levels, hysteresis, prevIndex, deviceCap)`——
  纯函数,覆盖滞回、封顶、边界;单测为主。

---

## 7. P1 — 移动/日程 NPC 集成(`scene` 复用 `ai`)

### 7.1 问题

`ai` 已有完整无头移动栈(`createAgent`、patrol/wander/follow/goTo、A*/HPA*、动态避障、
行为树、日程、`NPCWalker`)。缺的是:让移动 NPC 在移动的同时,`SceneShell` 的邻近检测/
选择环/交互/碰撞仍跟随其**实时**位置——且不能每帧 `setState` 触发全场景重渲染。

### 7.2 关键:ref 驱动而非 state 驱动

`SceneShell` 新增 ref-map 入口,邻近检测/选择环/碰撞每帧读 ref:

```ts
interface SceneShellProps {
  /* ...现有... */
  /** 移动 NPC 的实时位置 ref(每帧读取,不触发 React 重渲染)。 */
  npcPositionRefs?: Record<string, { current: Vec3 }>
}
```

- `useProximityDetection` / `SelectionRing` 改为:某 npc 若在 `npcPositionRefs` 里,则每帧
  从 ref 读位置;否则用静态 `position`(现有行为)。
- 碰撞:移动 NPC 的 collider 每帧更新位置(`collisionStore` 增 `setColliderPosition(id, pos)`)。

结构化桥接 `ai`(scene 不 import ai):

```ts
/** 结构化接受 ai 的 createAgent() 返回物,不产生 import 依赖。 */
export interface AgentLike {
  position: readonly [number, number]   // [x, z]
  readonly heading: number
  update(deltaMs: number): unknown
}
export interface AgentNPCProps {
  npcId: string
  agent: AgentLike
  /** 写回的共享位置 ref(挂到 SceneShell 的 npcPositionRefs[npcId])。 */
  positionRef: { current: Vec3 }
  y?: number
  rotationOffset?: number
  /** BaseNPC 视觉(模型、名牌等)。 */
  children?: React.ReactNode
  driven?: boolean   // 与 ai NPCWalker 语义一致:false 时只跟随不 update
}
/**
 * 每帧 step agent(或由外部驱动),把 [x,z]→positionRef,并驱动内部 group 的位置/朝向。
 * 用法:游戏用 ai.createAgent() 建 agent,配 SceneShell 的 npcPositionRefs 共享同一 ref。
 */
export function AgentNPC(props: AgentNPCProps): JSX.Element
```

- 日程:`ai` 的 `createSchedule`/`bindScheduleToBus` 已可用(接 `environment:phase-changed`),
  文档给出组合示例,scene 不重复实现。

### 7.3 验收

- `collisionStore.setColliderPosition` 单测。
- `useProximityDetection` 读 ref 时,移动使 `proximity:enter/leave` 正确触发(假 ref + 假 clock)。
- `AgentNPC`:`positionRef` 随假 agent 更新(jsdom,mock useFrame)。

---

## 8. P1 — 世界流式加载 + 加载态(`loading`)

### 8.1 问题

`loading` 有加权进度聚合、manifest、drei 桥,但**没有**世界流式/分区加载态,也没有反馈里
说的 module/geometry/texture/first-frame **阶段模型**与可测句柄。一旦场景到 5 个 2K-PBR
地标 + 骨骼玩家,"lazy 模块加载完成"不再等于"世界就绪",Playwright 只能分别等 debug 句柄、
真实模型响应、首帧绘制。

### 8.2 API

```ts
export type ScenePhase = 'idle' | 'module' | 'geometry' | 'texture' | 'first-frame' | 'ready'

export interface SceneLoadState {
  phase: ScenePhase                 // 当前最靠前的未完成阶段
  progress: number                  // 0..1 聚合
  phases: Record<ScenePhase, { progress: number; done: boolean }>
  errors: Array<{ zone?: string; message: string }>
}
export const useSceneLoadStore: /* zustand store */ {
  getState(): SceneLoadState & {
    setPhaseProgress(phase: ScenePhase, p: number): void
    completePhase(phase: ScenePhase): void
    failZone(zone: string, message: string): void
    retryZone(zone: string): void
    reset(): void
  }
}
export function useSceneLoadState(): SceneLoadState

// 分区流式(nearby-first)
/** 结构化世界矩形(与 minimap 的 WorldBounds 形状相同,但 loading 不 import minimap)。 */
export interface ZoneBounds { minX: number; maxX: number; minZ: number; maxZ: number }
export interface ZoneManifest {
  id: string
  priority: number
  manifest: AssetManifest           // 复用现有类型
  bounds?: ZoneBounds               // 结构化,不跨包依赖 minimap
}
export function useZoneStreaming(
  zones: ZoneManifest[],
  playerPosRef: { current: Vec3 }
): { pending: string[]; loaded: string[]; failed: string[] }
```

- 阶段推进:`module`(动态 import 完成)→ `geometry`(GLB 解析)→ `texture`(贴图上传)→
  `first-frame`(首帧绘制)→ `ready`。前四阶段进度由各来源上报,`ready` 在全部 done 时置位。
- `<FirstFramePhase />`:挂在 Canvas 内,`geometry` 就绪后的第一个 `useFrame` 里
  `completePhase('first-frame')`——直接消灭反馈里的 Playwright 三段竞态。
- 分区:`useZoneStreaming` 按玩家到各 zone `bounds` 的距离排序,近者先 `preloadManifest`;
  失败进 `failed`,`retryZone` 重排。
- **可测句柄**:dev 构建下把 `useSceneLoadStore.getState()` 镜像到
  `window.__overworldSceneLoad`(生产构建 tree-shake 掉),Playwright 直接读
  `phase === 'ready'`,不再采样 canvas 像素。

### 8.3 验收

- store 纯逻辑单测:阶段聚合进度、`ready` 门控、fail/retry。
- `useZoneStreaming` 排序纯函数 `orderZonesByDistance(zones, pos)` 单测。
- dev 句柄挂载/卸载、生产不挂,单测(mock `import.meta.env`)。

---

## 9. P2 — 环境音区 + 总线(`audio`)

### 9.1 问题

`audio` 是单 BGM 通道 + fire-and-forget SFX + scene→track 映射;无命名总线/混音组、无空间/
音区、无距离衰减、静音是全局。反馈要 master/music/ambience/SFX 总线、autoplay-safe resume、
距离衰减、可测静音/无头模式。

### 9.2 API(增量,现有全部保留)

```ts
type BusName = 'master' | 'music' | 'ambience' | 'sfx'
interface AudioManagerConfig {
  /* ...现有... */
  buses?: Partial<Record<BusName, number>>   // 各总线初始音量(0..1)
}
interface AudioManager {
  /* ...现有... */
  setBusVolume(bus: BusName, v: number): void
  getBusVolume(bus: BusName): number
  // 环境音区
  setAmbientZones(zones: AmbientZone[]): void
  updateListener(pos: Vec3): void            // 接 player:moved;按距离交叉淡入音区
  // 一次性提示音(距离衰减)
  playCue(sfxId: string, opts?: { at?: Vec3; listener?: Vec3 }): void
}
export interface AmbientZone {
  id: string
  trackId: string
  center: Vec3
  innerRadius: number   // ≤ inner:满音量
  outerRadius: number   // ≥ outer:静音;之间线性/平滑衰减
  maxVolume?: number    // 默认 1
}
export { silentBackend }   // 无声后端,用于无头/静音测试与 CI
```

- 实际音量 = `trackVolume × busVolume(所属总线) × masterVolume × 音区衰减`。
- autoplay:复用现有解锁重试机制;音区在解锁后才起。
- 无头/静音:`config.backend = silentBackend` 时全链路无声但状态可查(音区权重、总线值),
  Playwright/Vitest 可断言。

### 9.3 验收

- 纯逻辑抽 `ambientZones.ts`:`zoneWeight(zone, listenerPos)`、`mixBuses(...)` 单测。
- `silentBackend` 下 `updateListener` 使音区权重按距离变化;总线音量级联正确。

---

## 10. P2 — 可调轨道相机(`scene`)

### 10.1 API(向后兼容)

```ts
interface FollowCameraProps {
  /* ...现有 targetRef / offset / lerp... */
  orbit?: {
    enabled?: boolean            // 默认由 orbit 对象是否存在决定
    minDistance?: number; maxDistance?: number
    minPitch?: number; maxPitch?: number
    initialDistance?: number; initialYaw?: number; initialPitch?: number
    zoomSpeed?: number; rotateSpeed?: number
    pointer?: boolean            // 桌面:拖拽旋转 + 滚轮缩放,默认 true
    touch?: boolean              // 移动:单指旋转/双指捏合缩放,默认 true
  }
}
```

- **默认 `orbit` 未定义 = 现有固定偏移行为**(非破坏)。启用后 offset 转球坐标
  (distance/yaw/pitch),受 min/max 限位;仍保留 lerp 平滑。
- 输入门控:轨道拖拽/缩放在 `inputLock.isLocked()` 时禁用(§3.4),模态期不误触。
- 固定偏移仍是默认——反馈明确要求保留当前近距固定角。

### 10.2 验收

- 纯逻辑抽 `orbitCamera.ts`:`applyOrbitDelta(state, dYaw, dPitch, dZoom, limits)`——纯函数、
  限位裁剪、球坐标↔笛卡尔;单测为主。

---

## 11. P2 — 雷达原语(`minimap`)

### 11.1 API(无头,游戏自渲染)

```ts
export interface RadarConfig {
  worldBounds: WorldBounds
  buildings?: Array<{ id: string; position: Vec3; name?: string }>   // 结构化,兼容 BuildingConfig
  npcs?: Array<{ id: string; position: Vec3; name?: string }>        // 结构化,兼容 NPCConfig
  colors?: Partial<Record<EntityKind, string>>
  range?: number   // 雷达半径(世界单位),用于屏外钳制与量程环
}
export interface RadarMarker {
  id: string; kind: EntityKind
  x: number; y: number       // 归一化雷达空间 [-1, 1]
  offScreen: boolean
  angle?: number             // offScreen 时的边缘指示角(弧度)
}
export function selectRadarMarkers(
  config: RadarConfig, playerPos: Vec3, playerHeading: number
): RadarMarker[]
export function computeOffscreenIndicator(
  markerWorld: Vec3, playerPos: Vec3, playerHeading: number, range: number
): { angle: number; edge: boolean }
```

- 纯函数;把世界坐标投到以玩家为中心、按 heading 旋转的雷达空间,超 `range` 的钳到边缘并给角度。
- 与现有 `useMinimapStore`/`projectToCanvas` 互补:雷达是"玩家中心 + heading 旋转 + 屏外指示",
  minimap 是"north-up 全局投影"。`MiniMap` 组件可选接受 `radar` 模式(后续)。

### 11.2 验收

- `selectRadarMarkers`/`computeOffscreenIndicator` 纯函数单测:范围内/外、边缘角、heading 旋转。

---

## 12. 兼容性与发布

**向后兼容**(全部附加式,除下述一处):
- `core`:纯新增 `inputLock` 与一个事件,无改动 → **minor**。
- `input`:`useKeyboardLayer` 第三参兼容旧的 `string[]` 形态;`VirtualJoystick` 新增可选 prop → **minor**。
- `environment`/`loading`/`audio`/`minimap`:纯新增导出 → **minor**。
- `scene`:`Player`/`useInteractKey`/`FollowCamera` 的 `isInputBlocked` 默认改为回退 `inputLock`——
  语义上是新默认(锁空时无影响),但属于行为默认变化 → 计入 **2.0.0**;同时携带 `Decorations`/
  `Lod`/`AgentNPC`/`npcPositionRefs`/轨道相机等新增能力。

**发布**:一次跨 7 包协调发布,各自 changeset:
`scene` major;`core`/`input`/`environment`/`loading`/`audio`/`minimap` minor。

**依赖规则校验**:实现后 grep 全仓确认新增 0 条系统包互相 import;跨包协作仅经
`gameEvents`/`OverworldEventMap` 与结构化类型。

## 13. 实现顺序(供 writing-plans 细化)

1. `core` inputLock(地基,被 input/scene 依赖)。
2. 并行:`input` 桥接、`environment` WorldEnvironment、`loading` sceneLoadState、
   `audio` 音区、`minimap` 雷达(互不依赖)。
3. `scene`:输入锁消费 → 装饰渲染器 → LOD → 移动 NPC 集成 → 轨道相机(部分依赖 §1)。
4. 文档:各包 README + docs 站页面更新;新增一份"密集世界生产指南"整合示例
   (替代反馈里 `WorldEnvironment.tsx`/`worldLayout.ts`/`npcs.ts`/`worldAudio.ts`/`Minimap.tsx`
   等应用私有实现)。
5. 全仓 `build + typecheck + test` 绿;依赖规则 grep 校验。

每包遵循 TDD:纯逻辑先抽独立文件 + 单测,再接 R3F/DOM 绑定。
