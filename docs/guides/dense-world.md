# 密集世界:用框架 API 替换团队自维护的胶水代码

一个内容量较大的世界(密集的装饰物、多个昼夜/天气效果、巡逻 NPC、按区域流式
加载、环境音、雷达 HUD)以前往往靠游戏自己攒一套"胶水文件"拼出来:一个
`WorldEnvironment.tsx` 手写光照/天空,一个 `worldLayout.ts` 摆放灯柱/树木并
手动维护碰撞列表,一个 `npcs.ts` 用 `setInterval`/`useFrame` 手推 NPC 位置,
`worldAudio.ts` 手写环境音淡入淡出,`Minimap.tsx` 之外再手写一份雷达投影,
`EventDialogueBridge.tsx` 在对话打开时手动禁用键盘/摇杆/相机拖拽。

v1.5 → v2.0 这批变更把这些能力上收进框架,替换表如下:

| 团队原来的文件 | 现在用框架的什么 |
|---|---|
| `WorldEnvironment.tsx`(手写光照/雾/天空) | `@overworld-engine/environment` 的 `<WorldEnvironment preset engine quality>` + `WORLD_ENV_PRESETS` |
| `worldLayout.ts`(手摆装饰物 + 手维护碰撞) | `@overworld-engine/scene` 的 `<Decorations sets>`(实例化渲染,碰撞从同一份 instances 派生)+ `<Lod>`(远近切模型) |
| `npcs.ts`(手推 NPC 位置) | `@overworld-engine/scene` 的 `<AgentNPC agent positionRef>` 驱动 `@overworld-engine/ai` 的 `createAgent` |
| （无,靠玩家走到哪加载到哪） | `@overworld-engine/loading` 的 `useSceneLoadStore` / `useZoneStreaming` / `<FirstFramePhase />` |
| `worldAudio.ts`(手写环境音淡入淡出) | `@overworld-engine/audio` 的 `setAmbientZones` / `updateListener` |
| `Minimap.tsx` 之外再手写雷达投影 | `@overworld-engine/minimap` 的 `selectRadarMarkers` |
| `EventDialogueBridge.tsx`(手动逐个禁用输入源) | `@overworld-engine/core` 的 `inputLock` + `useKeyboardLayer({ lockInput: true })`,`scene`/`input` 默认消费 |

跨系统通信依旧只走 `@overworld-engine/core`(事件总线 `gameEvents` 与共享的
`inputLock`)——下面每个系统互不 `import` 彼此,靠结构类型或事件对接。

## 组合示例:一个密集村庄场景

```tsx
import { Canvas } from '@react-three/fiber'
import { gameEvents, inputLock } from '@overworld-engine/core'
import {
  SceneShell, Player, FollowCamera, AgentNPC, Decorations, Lod,
  useInputLocked, type DecorationSet, type NPCConfig,
} from '@overworld-engine/scene'
import { WorldEnvironment, createEnvironment, EnvironmentTick } from '@overworld-engine/environment'
import {
  useSceneLoadStore, useZoneStreaming, FirstFramePhase, orderZonesByDistance,
  type ZoneManifest,
} from '@overworld-engine/loading'
import { createAudioManager } from '@overworld-engine/audio'
import { selectRadarMarkers } from '@overworld-engine/minimap'
import { createAgent } from '@overworld-engine/ai'
import { useKeyboardLayer, KEYBOARD_PRIORITY } from '@overworld-engine/input'

// 1) 昼夜循环引擎(无头) + 预设环境层
const environment = createEnvironment({ dayLengthMs: 10 * 60 * 1000 })

// 2) 密集装饰物:一份 instances 同时喂渲染与碰撞,替代 worldLayout.ts 手摆 + 手维护碰撞表
const lamps: DecorationSet = {
  id: 'lamps',
  modelPath: '/models/lamp.glb',
  instances: [{ position: [4, 0, 2] }, { position: [4, 0, 8] }, { position: [-6, 0, 2] }],
  collision: { radius: 0.4 },
}

// 3) 巡逻 NPC:ai 的无头 agent + scene 的 AgentNPC 做渲染/碰撞同步(替代 npcs.ts 手推位置)
const guardAgent = createAgent({ position: [0, -10], speed: 1.5 })
guardAgent.patrol([[0, -10], [10, -10], [10, 0]], { pauseMs: 800 })
const guardPositionRef = { current: [0, 0, -10] as [number, number, number] }
// "guard" 必须同时是 SceneShell.npcs 的一项 —— 邻近检测/选中环都只从 npcs
// 派生"要追踪哪些 id",npcPositionRefs 对不在 npcs 里的 id 直接无效(见下文
// "移动 NPC"一节)。这一项的 modelPath 留空,只用于挂碰撞体/邻近检测/选中
// 环,不作为可见模型 —— 真正会动的模型由 <AgentNPC> 的 children 渲染。
const guardNpc: NPCConfig = {
  id: 'guard',
  modelPath: '',
  // 独立的字面量数组,故意不复用 guardPositionRef.current —— 后者会被
  // AgentNPC 每帧原地修改,若这里引用同一个数组,静态入口的 position 会被
  // 意外原地改写,但 BaseNPC 只在 React 重渲染时才把 position 应用到
  // three.js 对象,不会每帧同步,行为会变得不可预测。
  position: [0, 0, -10],
  rotation: [0, 0, 0],
}

// 4) 环境音区:靠近瀑布逐渐淡入水声(替代 worldAudio.ts 手写淡入淡出)
const audio = createAudioManager({
  tracks: { village: '/bgm/village.mp3', waterfall: '/audio/waterfall-loop.mp3' },
  sceneTracks: { village: 'village' },
})
audio.setAmbientZones([
  { id: 'waterfall', trackId: 'waterfall', center: [10, 0, -20], innerRadius: 5, outerRadius: 25 },
])

// 5) 按区域流式加载:相邻区域按到玩家距离由近及远预热
const zones: ZoneManifest[] = [
  { id: 'plaza', priority: 1, manifest: { models: ['/models/well.glb'] }, bounds: { minX: -20, maxX: 20, minZ: -20, maxZ: 20 } },
  { id: 'market', priority: 0, manifest: { models: ['/models/stall.glb'] }, bounds: { minX: 20, maxX: 60, minZ: -20, maxZ: 20 } },
]

// 6) 对话打开时统一挂起移动/交互键/相机拖拽/摇杆——不用逐个系统接线
function DialogueOverlay() {
  useKeyboardLayer('dialogue', KEYBOARD_PRIORITY.NPC_DIALOGUE, { lockInput: true })
  return <div className="dialogue-panel">…</div>
}

function World() {
  const playerRef = useRef<THREE.Group>(null)
  const playerPos = { current: [0, 0, 0] as [number, number, number] }

  useZoneStreaming(zones, playerPos)
  const progress = useSceneLoadStore((s) => s.progress)

  // 雷达标记(独立于 <MiniMap>,自绘 HUD 场景可用)
  const radarMarkers = selectRadarMarkers(
    { worldBounds: { minX: -60, maxX: 60, minZ: -60, maxZ: 60 }, npcs: [{ id: 'guard', position: guardPositionRef.current }] },
    playerPos.current,
    0
  )

  return (
    <Canvas shadows>
      <EnvironmentTick engine={environment} />
      <WorldEnvironment preset="clear-noon" engine={environment} />
      <FirstFramePhase />

      <SceneShell
        npcs={[guardNpc]}
        npcPositionRefs={{ guard: guardPositionRef }}
        // 这个场景里唯一的 npc 就是移动的 guard,所以直接把 BaseNPC 的名牌/
        // 徽标/发光/E 气泡关掉,避免它们停在 guard 出生点不跟着走。若场景
        // 里还混了静态 npc,这些开关是全场景生效的(非按 npc 单独控制),
        // 需要按需取舍或拆分场景。
        npcOptions={{ showGlow: false, showEBubble: false, showQuestIndicator: false }}
        player={<Player ref={playerRef} />}
      >
        <Decorations sets={[lamps]} />
        <Lod
          position={[30, 0, 30]}
          levels={[{ distance: 0, modelPath: '/models/tower-hi.glb' }, { distance: 60, modelPath: '/models/tower-lo.glb' }]}
          render={(url) => <mesh>{/* ...加载 url... */}</mesh>}
        />
        {/* guard 真正可见的模型:AgentNPC 每帧把 children 摆到 agent 的位置 */}
        <AgentNPC npcId="guard" agent={guardAgent} positionRef={guardPositionRef}>
          <mesh castShadow>{/* ...加载 /models/guard.glb... */}</mesh>
        </AgentNPC>
      </SceneShell>

      <FollowCamera targetRef={playerRef} orbit={{ minDistance: 8, maxDistance: 40 }} />
    </Canvas>
  )
}
```

## 逐项说明

### 环境:`WorldEnvironment.tsx` → `<WorldEnvironment>`

原来的文件通常硬编码一组光照数值、手写雾效果、按天气/时间 if-else 切光照
参数。现在的 `<WorldEnvironment preset engine quality>` 把这套逻辑做成
可复用的纯配置(`WORLD_ENV_PRESETS`)+ 纯插值函数(`resolveLight`),`engine`
是可选的 —— 不传就是静态预设,传了 `createEnvironment()` 的实例就自动随
时间平滑过渡。自定义美术只需传自定义 `preset` 对象,不需要碰组件内部。

### 装饰与 LOD:`worldLayout.ts` → `<Decorations>` + `<Lod>`

`worldLayout.ts` 常见的坑是"渲染用一份坐标数组,碰撞用另一份手抄的列表",
两者容易改漏一处。`<Decorations sets>` 的 `collidersForSets` 直接从同一份
`instances` 派生碰撞体,渲染与碰撞永远同步;渲染本身走 `InstancedMesh`,
装饰物数量再多也只是几个 draw call。远处的大型建筑/树木用 `<Lod>` 按
`playerPositionRef` 距离切模型精度,内置滞回避免边界抖动来回切换。

### 移动 NPC:`npcs.ts` → `<AgentNPC>` + `ai.createAgent`

`npcs.ts` 里手写的 `useFrame` 位置推进、朝向平滑、和碰撞体同步这三件事,
`<AgentNPC agent positionRef>` 一次性做掉:`agent` 只需满足结构类型
`AgentLike`(`@overworld-engine/ai` 的 `createAgent` 结果天然满足,
`scene` 包本身不 import `ai`),每帧调用 `agent.update(deltaMs)`、把位置写回
共享 ref、同步碰撞体位置(`useCollisionStore.getState().setColliderPosition`),
朝向按最短角度平滑转向,`children` 就是玩家真正看到的移动模型。

**真正能跑起来的组合,三个条件缺一不可**(否则邻近检测/选中环/碰撞体对这个
NPC 全部失效,且不会报错——只是安静地不生效):

1. NPC 的 id 必须**同时**出现在 `SceneShell.npcs` 里(哪怕只放一个
   `modelPath: ''` 的最小占位项)。邻近检测(`useProximityDetection`)和
   选中环(`SelectionRing`)追踪哪些 id,都是从 `npcs` 派生的,不是从
   `npcPositionRefs` 派生的——`npcPositionRefs` 只是"如果这个 id 正在被
   追踪,追踪的时候用哪个位置",不在 `npcs` 里的 id 直接被忽略。
2. 同一个 id 要出现在 `SceneShell.npcPositionRefs` 里,指向和
   `<AgentNPC positionRef>` **同一个** ref 对象,邻近检测/选中环才会用
   实时位置而不是 `npcs` 里的出生点坐标。
3. `<AgentNPC npcId>` 要和上面两处用同一个 id 字符串——`setColliderPosition`
   只会更新已注册的碰撞体,`CollisionRegistration` 只按 `npcs` 数组注册,
   id 对不上就是静默 no-op。

**已知局限**:`SceneShell` 会为 `npcs` 里的每一项都渲染一个 `<BaseNPC>`
静态可视对象(模型/名牌/任务徽标/发光/交互气泡),这个可视对象只读
`NPCConfig.position`,**不会**跟随 `npcPositionRefs`——即使上面三条全部接对
了,那个静态 `BaseNPC` 依然钉在出生点不动。所以移动 NPC 的正确写法是:
`npcs` 里的那一项只留最小占位(`modelPath: ''`,不显示真实模型),真正会动
的模型放进 `<AgentNPC>` 的 `children`;如果不想让出生点残留一个不会动的
胶囊体/名牌/发光气泡,用 `npcOptions` 把对应 UI 关掉(注意 `npcOptions`
是整个场景生效,不能按单个 NPC 单独关)。这是当前实现的真实边界,不是配置
技巧能完全绕开的——要让 `BaseNPC` 的可视效果本身跟随 `npcPositionRefs`,
需要改 `BaseNPC`/`SceneShell` 的实现。

### 加载状态:新增能力,原来常常没有

多数团队的"进场景"体验就是黑屏一下,没有细粒度进度。
`useSceneLoadStore` 把"进场景"拆成 `module → geometry → texture →
first-frame → ready` 五个阶段,`useZoneStreaming` 按玩家距离由近及远预热
分区清单(`ZoneManifest`/`orderZonesByDistance`),`<FirstFramePhase />`
自动标记首帧完成 —— 不需要自己猜"什么时候算加载完"。

### 环境音:`worldAudio.ts` → 环境音区(ambient zones)

`worldAudio.ts` 手写的"离瀑布越近水声越大"逻辑通常是一段自定义的
`setInterval` + 距离计算 + 手动 `audio.volume =`。`setAmbientZones` +
`updateListener` 把这套逻辑做成声明式配置:每个 zone 声明内圈/外圈半径,
`updateListener(playerPos)` 在每帧或每次移动后调用即可,内部按
`zoneWeight`(线性衰减)与 `mixBuses`(乘上 `ambience` 总线音量)计算增益。

### 雷达 HUD:`Minimap.tsx` 里再手写一份投影 → `selectRadarMarkers`

`<MiniMap>` 组件已经解决了"北朝上小地图",但很多游戏还想要一个
"玩家朝向朝上"的雷达 HUD,原来往往是复制一份坐标投影代码改朝向。
`selectRadarMarkers(config, playerPos, playerHeading)` 直接产出旋转好、
按 `range` 钳制到边缘的标记数组,`offScreen`/`angle` 字段够画边缘箭头,
不需要再手写一份投影数学。

### 统一输入阻断:`EventDialogueBridge.tsx` → `inputLock`

`EventDialogueBridge.tsx` 常见写法是对话打开时分别调用"禁用键盘"
"清空摇杆""锁住相机拖拽"三处不同系统的 API,任何一处漏调都会留下"对话开着
角色还在跑"的经典 bug。现在只需要
`useKeyboardLayer(id, priority, { lockInput: true })`
(或直接 `inputLock.acquire(id)` / `release(id)`)—— `@overworld-engine/scene`
的 `Player`、交互键、`FollowCamera` orbit,以及 `@overworld-engine/input` 的
`<VirtualJoystick respectInputLock>` 都默认消费同一把 `inputLock`,一次
`acquire` 全部生效,组件卸载/`release` 后自动恢复。未持有任何锁时行为与
旧版完全一致。
