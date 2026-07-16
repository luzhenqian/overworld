# @overworld-engine/input

键盘输入优先级层级系统 + 移动端虚拟摇杆。高优先级的 UI 层(模态框、对话框、侧边面板等)可以
阻止低优先级的按键处理(如游戏移动控制),避免"打开菜单时角色还在跑"的经典问题。

## 核心概念

- **层(Layer)**:任何需要拦截键盘输入的 UI 在挂载时注册一个层,包含
  `id`、`priority`、可选的 `blockedKeys`(仅阻止列出的键;不传则阻止全部按键)。
- **优先级(Priority)**:数值越大越优先。低优先级的处理器在按键被更高层
  阻止时不应响应。`KEYBOARD_PRIORITY` 提供一组默认值,游戏可自定义任意数值。

```ts
export const KEYBOARD_PRIORITY = {
  SYSTEM_MODAL: 100,   // 系统模态框
  TUTORIAL: 90,        // 教程遮罩
  EVENT_NOTIFICATION: 80,
  QUIZ: 75,
  NPC_DIALOGUE: 70,    // NPC 对话
  SIDE_PANEL: 60,      // 侧边面板
  QUICK_ACTION: 50,
  GAME_CONTROLS: 10,   // 游戏控制(移动/交互)
  DEFAULT: 0,
}
```

## API

### `useKeyboardStore`

zustand store,持有当前活跃层(按优先级降序排列):

- `registerLayer(layer)` / `unregisterLayer(id)` — 注册/注销层,相同 `id` 覆盖。
- `isKeyBlocked(key, forPriority?)` — 某个键对指定优先级的处理器是否被阻止。
- `shouldHandleKey(key, handlerPriority)` — 处理器是否应处理该键(上者取反)。
- `getActiveMaxPriority()` — 当前最高层的优先级。

### `useKeyboardLayer(id, priority, blockedKeys?)`

React Hook:组件挂载时注册层,卸载时自动注销。

```tsx
function DialoguePanel() {
  useKeyboardLayer('dialogue', KEYBOARD_PRIORITY.NPC_DIALOGUE, ['w', 'a', 's', 'd', 'e'])
  return <div>…</div>
}
```

### `useHotkey(key, handler, options?)`

React Hook:监听全局 `keydown`,自动咨询层级栈(`shouldHandleKey`),
被更高层阻止时不触发。

```tsx
useHotkey('e', () => interact(), { priority: KEYBOARD_PRIORITY.GAME_CONTROLS })
```

`options`:

| 选项 | 默认 | 说明 |
| --- | --- | --- |
| `priority` | `DEFAULT (0)` | 处理器运行的优先级 |
| `enabled` | `true` | 关闭后不监听 |
| `preventDefault` | `true` | 命中后调用 `event.preventDefault()` |
| `ignoreInputs` | `true` | 忽略来自输入框/文本域等可编辑元素的按键 |

## 虚拟摇杆

移动端 / 触屏的虚拟摇杆,基于 Pointer Events(触摸与鼠标皆可用),自绘 DOM
(底盘 + 摇杆头,内联样式),零额外依赖。渲染在 3D Canvas 之外(或之上)即可。

### `createMovementInput()`

创建一个可变的移动输入引用:`{ current: { x: 0, z: 0, running: false } }`。
摇杆拖拽时把归一化的移动向量写入其中——世界轴语义与 WASD 一致
(x:−1 左 … +1 右;z:−1 前/屏幕上方 … +1 后/屏幕下方),模长 ≤ 1;
`running` 表示是否请求奔跑速度。

该形状与 `@overworld-engine/scene` 中 `<Player>` 的 `externalInput` prop(`MovementInputRef`)
**结构兼容**——两个包互不 import,靠 TypeScript 结构化类型对接:

```tsx
import { createMovementInput, VirtualJoystick } from '@overworld-engine/input'
import { Player } from '@overworld-engine/scene'

const movement = createMovementInput()

function Game() {
  return (
    <>
      <Canvas>
        {/* ... */}
        <Player externalInput={movement} />
      </Canvas>
      <VirtualJoystick target={movement} />
    </>
  )
}
```

### `<VirtualJoystick target={ref} />`

| Prop | 默认 | 说明 |
| --- | --- | --- |
| `target` | —(必填) | 摇杆写入的 `MovementInputRef` |
| `size` | `120` | 底盘直径(px) |
| `deadZone` | `0.15` | 死区:模长低于该值时写入 `{0, 0}` |
| `runThreshold` | `0.85` | 模长达到该值时 `running = true` |
| `style` / `className` | 固定左下角 | 样式/定位透传,覆盖 `position`/`left`/`bottom` 可改放置位置 |

行为细节:

- 偏移始终钳制到单位圆(模长 ≤ 1),摇杆头视觉钳制在底盘半径内。
- 拖拽期间 `touch-action: none`,不会带动页面滚动/缩放。
- 松手(pointerup / pointercancel / 失去捕获)时重置为 `{0, 0, false}`;
  组件卸载时同样自动重置,不会留下"卡住的方向"。

### 纯函数辅助(可独立使用、已单测)

- `computeJoystickVector(dx, dy, radius, deadZone?)` — 像素偏移 → 归一化向量
  `{ x, z, magnitude }`(死区 + 单位圆钳制)。
- `shouldRun(magnitude, runThreshold?)` — 是否达到奔跑阈值。
- `computeThumbOffset(dx, dy, maxDistance)` — 摇杆头显示位置钳制。
- 常量 `DEFAULT_DEAD_ZONE`(0.15)/ `DEFAULT_RUN_THRESHOLD`(0.85)。

## 注意事项

- `blockedKeys` 请使用小写键名(与 `event.key.toLowerCase()` 比较)。
- 本包无任何内部依赖,peerDependencies 为 `react` 与 `zustand`。
