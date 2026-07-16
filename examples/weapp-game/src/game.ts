/**
 * 小游戏启动序列(vendor/weapp-adapter.js 已由 game.js 先行加载):
 *
 *   1. registerWeappBridge()            —— 向 platform 注册 weapp 桥
 *   2. setLabelCanvasFactory            —— SpriteLabel 的离屏 canvas 改走 wx.createCanvas
 *   3. createWeappCanvasRoot()          —— 首个 wx.createCanvas() 即屏幕主画布,R3F 根
 *   4. createWeappTouchJoystick         —— 左半屏浮动摇杆 → movementInput → Player
 *   5. root.render(<World/>)
 *   6. createWeappPointerBridge         —— 由 wx 触摸驱动 R3F 指针事件:点中 NPC
 *                                          网格 → onClick → 打开/推进对话(真射线拾取)
 *
 * 注意:setLabelCanvasFactory 只登记工厂不建 canvas,真正的 wx.createCanvas()
 * 首调发生在 createWeappCanvasRoot 内 —— 保证主画布语义(小游戏首个 canvas
 * 上屏)不被标签画布抢占。指针桥必须在 render() 之后挂载(需要 R3F store)。
 */
import { createElement } from 'react'
import * as THREE from 'three'
import { extend } from '@react-three/fiber'
import {
  createWeappCanvasRoot,
  createWeappPointerBridge,
  createWeappTouchJoystick,
  getWx,
  registerWeappBridge,
} from '@overworld-engine/adapters-weapp'
import { gameEvents } from '@overworld-engine/core'
import {
  playerPositionRef,
  setLabelCanvasFactory,
  useSceneStore,
  type LabelCanvas,
} from '@overworld-engine/scene'
import { World } from './World'
import { dialogue, gold, inventory, movementInput, quests } from './engines'

const wx = getWx()
if (typeof wx.createCanvas !== 'function') {
  throw new Error('[weapp-game] 需要微信小游戏环境(wx.createCanvas 缺失)')
}

// 0. 注册 R3F 的 JSX 元素目录:走底层 createRoot(而非 <Canvas>)时,
//    fiber 不会自动 extend(THREE),<mesh>/<ambientLight> 等小写元素需要手动登记。
extend(THREE)

// 1. platform 桥(createBridge() 由此可返回 weapp 实现)
registerWeappBridge()

// 2. SpriteLabel 离屏 canvas 工厂(wx canvas 与 LabelCanvas 结构兼容)
setLabelCanvasFactory(() => wx.createCanvas!() as unknown as LabelCanvas)

// e2e 调试句柄(release 构建整段剔除)
interface DebugHandle {
  frames: number
  gl: unknown
  canvas: unknown
  size: unknown
  /** R3F 场景图(e2e 断言 GLB 模型已进入场景 / 计算 NPC 屏幕坐标)。 */
  scene: THREE.Scene | null
  /** R3F 相机(e2e 把 NPC 世界坐标投影到屏幕以合成点按)。 */
  camera: THREE.Camera | null
  /** THREE 命名空间(e2e 在页面内做 Box3/Vector3 投影)。 */
  three: typeof THREE
  gameEvents: typeof gameEvents
  quests: typeof quests
  dialogue: typeof dialogue
  inventory: typeof inventory
  movementInput: typeof movementInput
  playerPositionRef: typeof playerPositionRef
  sceneStore: typeof useSceneStore
  gold: typeof gold
}
let debugHandle: DebugHandle | null = null
if (__DEBUG__) {
  debugHandle = {
    frames: 0,
    gl: null,
    canvas: null,
    size: null,
    scene: null,
    camera: null,
    three: THREE,
    gameEvents,
    quests,
    dialogue,
    inventory,
    movementInput,
    playerPositionRef,
    sceneStore: useSceneStore,
    gold,
  }
  ;(globalThis as Record<string, unknown>).__game = debugHandle
}

// 3. R3F 根(尺寸/DPR 取自 wx.getSystemInfoSync,dpr clamp 2)
const canvasRoot = createWeappCanvasRoot({
  renderProps: {
    camera: { fov: 50, position: [0, 12, 18] },
    gl: {
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
      // 调试构建保留绘制缓冲,供 e2e 读像素断言「真的画出来了」
      preserveDrawingBuffer: __DEBUG__,
    },
    onCreated: (state) => {
      if (debugHandle) {
        debugHandle.gl = state.gl
        debugHandle.scene = state.scene
        debugHandle.camera = state.camera
      }
    },
  },
})
if (debugHandle) {
  debugHandle.canvas = canvasRoot.canvas
  debugHandle.size = canvasRoot.size
}

// 4. 左半屏浮动摇杆(锚点 = 落指点),写入 movementInput
createWeappTouchJoystick(movementInput, { region: 'left-half' })

// 5. 渲染场景
canvasRoot.render(createElement(World))

// 6. R3F 指针桥(必须在 render 之后:需要 R3F store)。由 wx 触摸驱动,tap(短按
//    不拖动)→ 射线拾取 → 点中的 NPC group onClick → 打开/推进对话。region:'full'
//    让全屏皆可拾取;摇杆仍独占左半屏移动 —— 二者靠「拖动 vs 轻点」自然共存
//    (拖动摇杆不会被当作拾取点按)。
createWeappPointerBridge(canvasRoot, { region: 'full' })
