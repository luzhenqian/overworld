# @overworld-engine/scene

Overworld 框架的 3D 世界层:场景外壳、玩家控制器、跟随相机、圆形碰撞、邻近检测、
GLTF 模型加载、场景主题与传送门。基于 React + three.js + @react-three/fiber + drei + zustand。

## 定位

本包只负责"可探索的 3D 世界"这一层,**零游戏内容**:没有内置模型路径、NPC 名字、
配色预设或世界边界,全部通过 props / 配置传入。跨系统通信一律走
`@overworld-engine/core` 的事件总线(`gameEvents`),因此对话、任务、音频等系统无需
import 本包即可响应玩家移动、场景切换与交互。

发出的事件:

| 事件 | 时机 |
| --- | --- |
| `player:moved` | 玩家累计移动约 0.5 米(可配)时,携带位置与移动距离 |
| `scene:changed` | `useSceneStore.setScene(id)` 切换场景时 |
| `proximity:enter` / `proximity:leave` | 玩家进入 / 离开 NPC 或建筑的交互半径时 |
| `entity:interact` | 附近有实体且按下交互键(`useInteractKey` / `interact()`)时 |
| `interact`(**已弃用**) | 与 `entity:interact` 同载荷双发,仅为过渡期兼容,2.0 移除 |

## 核心组件 / API

- **`<SceneShell>`** — 场景样板组合:碰撞注册 + 邻近检测 + NPC / 建筑循环 +
  选中光环 + 玩家。场景专属内容(灯光、地面、传送门、装饰)作为 `children` 传入。
  通过 `npcIndicators`(任务角标)与 `interactHint`(自定义交互提示)替代原游戏的
  store 读取;`player` prop 默认渲染 `<Player />`,传 `null` 可关闭。
- **`<Player>`** — WASD / 方向键移动,Shift 奔跑;圆形碰撞解算、可选世界边界钳制、
  动画 crossfade(idle/walk/run)。`modelUrl` 省略时渲染胶囊体占位。
  `isInputBlocked?: () => boolean` 用于接入你的输入优先级系统(如 @overworld-engine/input)。
  `externalInput?: MovementInputRef` 接受外部移动源(虚拟摇杆/手柄等,形如
  `{ current: { x, z, running } }`,模长 ≤ 1),每帧与键盘输入合并:方向相加后归一化,
  `running = Shift 或 externalInput.current.running`;模拟量模长 < 1 时速度按比例缩放
  (纯键盘保持全速),同样受 `isInputBlocked` 约束。与 `@overworld-engine/input` 的
  `createMovementInput()` / `<VirtualJoystick>` 结构兼容——两个包互不 import。
- **`<FollowCamera targetRef offset lerp>`** — 平滑跟随相机,可独立使用。
- **`<BaseNPC>` / `<BaseBuilding>`** — 模型加载 + 名牌 + 发光 + 交互气泡,
  颜色全部来自 `theme`;"是否在附近"读取本包的 `useSceneStore`。
- **`<SelectionRing>` / `<CollisionRegistration>` / `<Portal>`** — 地面选中环、
  声明式碰撞注册、场景传送门(默认走 `setScene`,可用 `onEnter` 覆盖)。
- **`useSceneStore`** — `currentScene` / `nearbyNpcId` / `nearbyBuildingId`;
  `setScene(id)` 会发出 `scene:changed`。
- **`useCollisionStore`** — 圆形碰撞注册表:`registerCollider` / `checkCollision` /
  `resolveCollision`(推出式解算)。
- **`playerPositionRef` / `playerRotationRef` / `teleportPlayer(pos)`** —
  模块级可变引用,每帧由 Player 写入,供逐帧系统(小地图、邻近检测)读取而不触发
  React 重渲染;`teleportPlayer` 用于场景切换后落点。
- **`useProximityDetection({ npcs, buildings, npcRadius, buildingRadius })`** —
  每帧找出最近的在半径内实体,写入 sceneStore 并发出 proximity 事件
  (SceneShell 已内置调用)。
- **`useModelLoader` / `preloadSceneModels`** — GLTF 加载(克隆 + 阴影配置)与预加载。
  加载中会 **Suspense 挂起**(挂起的 promise 会重新抛出,不会被吞),必须在
  `<Suspense>` 边界之下调用——`BaseNPC` / `BaseBuilding` / `Player` 已内置
  `<Suspense>` + `ModelErrorBoundary`(按模型 URL 作 key,改路径即重试);
  加载中与加载失败都显示主题化占位体,失败只打一条 `console.error`。
  `preloadSceneModels` 因此只是性能优化(缓存命中时同步解析),不再是正确性前提。
- **`interact()` / `useInteractKey(key = 'e', { isInputBlocked })`** —
  把"按 E 交互"翻译成总线上的 `entity:interact` 事件(过渡期同载荷双发已弃用的
  `interact`,2.0 移除)。
- **`defaultSceneTheme` / `createSceneTheme(partial)`** — 中性默认主题与深合并辅助。

## 最小使用示例

```tsx
import { Canvas } from '@react-three/fiber'
import { gameEvents } from '@overworld-engine/core'
import {
  SceneShell,
  Player,
  Portal,
  useInteractKey,
  useSceneStore,
  createSceneTheme,
  type NPCConfig,
} from '@overworld-engine/scene'

const theme = createSceneTheme({ npc: { primaryColor: '#ff9f43' } })

const npcs: NPCConfig[] = [
  { id: 'guide', name: '向导', modelPath: '/models/guide.glb',
    position: [4, 0, 2], rotation: [0, Math.PI, 0] },
]

// 任意系统都可以订阅交互事件,无需 import 场景组件
gameEvents.on('entity:interact', ({ kind, id }) => {
  if (kind === 'npc') console.log('开始对话:', id)
})

function World() {
  return (
    <SceneShell
      theme={theme}
      npcs={npcs}
      npcIndicators={{ guide: 'quest-available' }}
      player={<Player bounds={{ minX: -24, maxX: 24, minZ: -24, maxZ: 24 }} />}
    >
      {/* 场景专属内容 */}
      <ambientLight intensity={0.6} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[50, 50]} />
        <meshStandardMaterial color="#2d3436" />
      </mesh>
      <Portal position={[0, 0, -20]} targetScene="downtown" label="市中心" />
    </SceneShell>
  )
}

export function Game() {
  useInteractKey('e')
  const scene = useSceneStore((s) => s.currentScene)
  return (
    <Canvas shadows camera={{ position: [0, 10, 30], fov: 50 }}>
      {scene !== 'downtown' ? <World /> : null /* 其他场景 */}
    </Canvas>
  )
}
```

## 本版本新增(2.0):密集世界四件套 + 默认输入锁

### 输入锁默认接入(破坏性变更)

`Player`/`useInteractKey` 的 `isInputBlocked` 省略时,现在回退到
`@overworld-engine/core` 的共享 `inputLock.isLocked()`,`FollowCamera` 的
orbit 拖拽/滚轮同样受其约束——三者不再需要各自接线,只要任意系统调用
`inputLock.acquire(id)` 就会同时挂起移动、交互键与相机拖拽。**未获取任何锁
时行为与旧版完全一致**(`isLocked()` 恒为 false)。`useInputLocked()` 提供
响应式布尔值,供 HUD 判断是否置灰控件。

```tsx
import { inputLock } from '@overworld-engine/core'
import { useInputLocked } from '@overworld-engine/scene'

inputLock.acquire('dialogue')   // 任意系统均可调用,无需 import scene
useInputLocked()                // HUD 中响应式读取锁状态
```

### `<Decorations>` — 实例化批量装饰物

```tsx
import { Decorations, type DecorationSet } from '@overworld-engine/scene'

const lamps: DecorationSet = {
  id: 'lamps', modelPath: '/models/lamp.glb',
  instances: [{ position: [4, 0, 2] }, { position: [4, 0, 8] }],
  collision: { radius: 0.4 },
}

<Decorations sets={[lamps]} />  // 每个源 mesh 一个 InstancedMesh;碰撞体默认从同一份 instances 派生
```

`collidersForSets(sets)` 可独立调用(不挂组件时手动注册碰撞)。

### `<Lod>` — 距离驱动的模型切换

```tsx
import { Lod } from '@overworld-engine/scene'

<Lod
  position={[0, 0, 0]}
  levels={[{ distance: 0, modelPath: '/models/tree-hi.glb' }, { distance: 40, modelPath: '/models/tree-lo.glb' }]}
  render={(modelPath) => <MyModel url={modelPath} />}
/>
```

按 `playerPositionRef` 距离选级(自带滞回,避免边界抖动),自动预加载下一档。

### `<AgentNPC>` — 引用驱动的移动 NPC

```tsx
import { AgentNPC } from '@overworld-engine/scene'
// agent 满足结构类型 AgentLike(如 @overworld-engine/ai 的 createAgent 结果),scene 不 import ai

<AgentNPC npcId="patrol-1" agent={agent} positionRef={npcPositionRefs.current['patrol-1']}>
  <BaseNPC ... />
</AgentNPC>
```

每帧驱动 `agent.update(deltaMs)`,把位置写回共享 ref(`SceneShell` 的
`npcPositionRefs`,供邻近检测/小地图/雷达读取)并同步碰撞体位置
(`setColliderPosition`)。

### `<FollowCamera orbit>` — 轨道相机

```tsx
<FollowCamera targetRef={playerRef} orbit={{ minDistance: 8, maxDistance: 40 }} />
```

传 `orbit` 后,鼠标拖拽 + 滚轮 / 触屏单指拖拽 + 双指缩放驱动球面轨道
(`applyOrbitDelta`/`orbitToOffset` 可独立测试);省略 `orbit` 时行为与旧版
固定偏移完全一致。拖拽/滚轮同样遵守 `inputLock`。

## 模型加载语义

无美术资产也能跑:省略 `modelUrl` / `modelPath` 时,玩家与 NPC 回退为胶囊体、
建筑回退为盒体、传送门回退为发光圆环。有模型路径时的完整语义:

- **加载中** — 显示同一个主题化占位体(`BaseNPC` / `BaseBuilding` / `Player`
  内置 `<Suspense>`,`useModelLoader` 会正常挂起而不是吞掉 promise),
  加载完成后模型自动出现,**无需**预加载。
- **加载失败**(404 / 解析错误)— 打印**一条** `console.error` 并永久显示占位体;
  组件内部的 `ModelErrorBoundary` 按模型 URL 作 key,修改路径即可重试。
- **`preloadSceneModels`** — 纯性能优化:预加载后 `useGLTF` 从缓存同步解析,
  跳过占位体闪现;不预加载也完全正确。

NPC 回退胶囊与名牌 / 角标 / 交互气泡高度随 `scale` 等比缩放(基准:NPC 默认
`scale = 2.5`,建筑基准 `scale = 1`,默认值下与旧版完全一致);
`labelHeight` prop 可覆盖名牌高度(角标与气泡保持其上方的比例间距)。
纯数学部分以 `npcVisualHeights(scale, labelHeight?)` /
`buildingVisualHeights(scale, labelHeight?)` 导出。

## 性能预设

面向移动端 / 低端设备的渲染质量分档:一个 zustand 单例存当前
`QualitySettings`,`<ApplyQuality />` 挂在 Canvas 内负责把 GL 相关的部分
(DPR、阴影开关)应用到渲染器,其余数值由游戏自己消费。

- **`QUALITY_PRESETS`** — 三档内置预设:

  | 档位 | dpr | 阴影 | shadowMapSize | 粒子倍率 |
  | --- | --- | --- | --- | --- |
  | `high` | [1, 2] | 开 | 2048 | ×1 |
  | `medium` | [1, 1.5] | 开 | 1024 | ×0.6 |
  | `low` | [0.75, 1] | 关 | 512 | ×0.3 |

- **`useQualityStore`** — `{ preset, settings, setPreset(name), setSettings(partial) }`。
  默认 `high`;`setSettings` 合并部分覆盖并把 `preset` 置为 `'custom'`。
  **不持久化**——玩家的画质选择由游戏自己存(localStorage / 存档槽)。
- **`detectQualityPreset()`** — 设备启发式:无 `navigator`(SSR / 测试)返回
  `'high'`;"弱设备" = `hardwareConcurrency` ≤ 4 或 `deviceMemory` ≤ 4GB
  (两者都有守卫,缺失不计);"移动端" = 粗指针(`pointer: coarse`)或移动 UA。
  移动 + 弱 → `low`,移动 → `medium`,桌面 + 弱 → `medium`,其余 → `high`。
  只是起点,把结果喂给 `setPreset` 并允许玩家覆盖。
- **`<ApplyQuality />`** — 挂在 `<Canvas>` 内:把 `settings.dpr` 作为
  `[min, max]` 区间交给 R3F 的 `setDpr`(真实 `devicePixelRatio` 被钳制进该
  区间);切换 `gl.shadowMap.enabled` 并置 `gl.shadowMap.needsUpdate = true`。
  注意:`shadowMapSize` **不会**被自动应用——投影灯光归游戏所有,自己在创建
  灯光处读值(`shadow-mapSize={[size, size]}`);运行中开关阴影后,阴影关闭期间
  创建的材质可能需要 `needsUpdate` / 重挂载,尽量在场景挂载前定档。
- **`useParticleMultiplier()`** — 读当前粒子倍率的便捷 selector。

```tsx
import { ApplyQuality, detectQualityPreset, useQualityStore, useParticleMultiplier } from '@overworld-engine/scene'

useQualityStore.getState().setPreset(detectQualityPreset()) // 启动时定档

function World() {
  const shadowMapSize = useQualityStore((s) => s.settings.shadowMapSize)
  const particles = Math.round(200 * useParticleMultiplier())
  return (
    <Canvas shadows>
      <ApplyQuality />
      <directionalLight castShadow shadow-mapSize={[shadowMapSize, shadowMapSize]} />
      {/* 用 particles 决定粒子数量 */}
    </Canvas>
  )
}
```
