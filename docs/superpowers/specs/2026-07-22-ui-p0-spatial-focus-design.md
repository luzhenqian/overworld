# @overworld-engine/ui — P0 模块 C：空间焦点导航设计

日期：2026-07-22
状态：两层架构 + `/focus` 子路径 + 可选 peerDep、forwardRef/Modal 改造、手柄合成 Enter 均已与需求方确认

## 背景

承接 [UI 组件库深度调研](https://claude.ai/code/artifact/6f7e1d8a-8eda-4451-8034-e26f8375c822) 路线图 **P0 模块 C**（A/B/C 三模块的最后一个）。模块 A（战斗 HUD）已发 `@overworld-engine/ui@2.3.0`；模块 B（导航 HUD）已合并 main、暂存待发。本模块补研究里的手柄/键盘空间焦点导航能力。

研究结论：业界做法是把空间导航做成独立交互层（自动空间算法 + 注册元素 + 命名分区），首选依赖 `@noriginmedia/norigin-spatial-navigation`（MIT、React Hooks、活跃）。已核实其 v3.2.1 真实 API：`init()`、`setFocus(focusKey)`、`navigateByDirection(dir)`、`useFocusable(config) → { ref, focused, focusSelf, focusKey, hasFocusedChild }`、`FocusContext: React.Context<string>`、`Direction = 'up'|'down'|'left'|'right'`。

现状约束：`@overworld-engine/ui` 目前 `dependencies: {}`（刻意零运行时依赖），peerDeps 仅 react/zustand；`Modal` 无焦点陷阱；`Button`/`Slot` 是普通函数组件（无 forwardRef）；`@overworld-engine/input` 有键盘层但无手柄。

## 架构决策

**两层，核心保持零依赖：**

1. **核心层（零依赖，`packages/ui/src/`）**：`Button`/`IconButton`/`Slot` 改为 `forwardRef`（让外部焦点 ref 直接挂到 DOM 按钮，无需 wrapper div；JSX 用法与行为不变）；`Modal` 加纯 DOM 焦点陷阱。均无新依赖，属通用无障碍改善。
2. **`/focus` 子路径层（可选 norigin，`packages/ui/src/focus/`）**：空间导航的 Provider/组件/hooks，从 `@overworld-engine/ui/focus` 导出（主 barrel **不** re-export），norigin 作为**可选 peerDependency**。只有用空间导航的消费方才装 norigin，核心包安装保持零依赖。与现有 themes 子路径导出同一风格。

## 核心层（零依赖）

### forwardRef 改造

`Button`、`IconButton`（`components/Button.tsx`）、`Slot`（`components/SlotGrid.tsx`）改为 `forwardRef<HTMLButtonElement, …Props>`，`ref` 转发到内部 `<button>`，用具名函数表达式设置 `displayName`。props 接口与渲染输出不变，现有用法（`SlotGrid` 渲染 `Slot`、`DialogueBox` 用 `Button`、gallery stories）继续编译。

### Modal 焦点陷阱

`Modal`（`components/Modal.tsx`）：hooks 必须无条件调用（在 `if (!open) return null` **之前**）。开启时的 `useEffect`（依赖 `[open, onDismiss]`）：
- 记住 `document.activeElement`；
- 聚焦模态内首个可聚焦元素（无则聚焦 `.ow-modal` 本身，故加 `tabIndex={-1}`）；
- 挂 `keydown`：`Escape` → `onDismiss?.()`；`Tab`/`Shift+Tab` → 用 `nextTrapIndex` 在模态内可聚焦元素间循环（`preventDefault`）；
- cleanup（关闭/卸载）：移除监听、把焦点恢复到之前记住的元素。

### 纯逻辑 `focusTrap.ts`（vitest 测）

```ts
export const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/** Tab（forward）/Shift+Tab（backward）循环时的下一索引，含环绕。current<0 表示当前不在集合内。 */
export function nextTrapIndex(count: number, current: number, forward: boolean): number
```
- `count <= 0` → `-1`；`current < 0` → `forward ? 0 : count - 1`；否则 `forward ? (current+1)%count : (current-1+count)%count`。
- 测试：`(3,0,true)=1`、`(3,2,true)=0` 环绕、`(3,0,false)=2` 反向环绕、`(3,-1,true)=0`、`(3,-1,false)=2`、`(0,x,y)=-1`。

## `/focus` 子路径层（可选 norigin）

### 纯逻辑 `gamepadAxis.ts`（vitest 测，不依赖 norigin）

```ts
export type Direction = 'up' | 'down' | 'left' | 'right'
/** 摇杆轴值 → 方向：都在死区内返回 null；否则取主轴（|x|>|y| 判左右，否则上下）。 */
export function axisToDirection(x: number, y: number, deadZone?: number): Direction | null
```
- `deadZone` 默认 0.5；`|x|<dz && |y|<dz` → null；`|x| >= |y|` → `x>0?'right':'left'`；否则 `y>0?'down':'up'`（屏幕 y 向下：正 y = 下）。
- 测试：死区内 null、右（x=0.8,y=0）、左（x=-0.8）、下（y=0.8）、上（y=-0.8）、主轴优先（x=0.9,y=0.6 → right）、边界 |x|==|y| 取水平、自定义死区。

### 组件与 hooks（`src/focus/*.tsx`，`import from '@noriginmedia/norigin-spatial-navigation'`）

```tsx
// FocusProvider — 初始化 norigin 一次并提供根 FocusContext；包住可导航区域
interface FocusProviderProps { children?: ReactNode; focusKey?: string }
// 实现：模块级 guard 调 init() 一次；const { ref, focusKey } = useFocusable({ focusKey, saveLastFocusedChild: true, trackChildren: true })
//       return <FocusContext.Provider value={focusKey}><div ref={ref} className="ow-focus-root">{children}</div></FocusContext.Provider>

// Focusable — render-prop，把 norigin 的 ref/focused 给到子元素（子元素需 forwardRef，如 Slot/Button）
// 泛型 over 元素类型，避免 ref 逆变类型错误（RefObject<HTMLElement> 不能挂到 Ref<HTMLButtonElement>）
interface FocusableProps<E extends HTMLElement = HTMLElement> {
  focusKey?: string
  onEnterPress?: () => void
  onFocus?: () => void
  children: (state: { ref: RefObject<E>; focused: boolean; focusSelf: () => void }) => ReactNode
}
// 实现：function Focusable<E extends HTMLElement = HTMLElement>(props: FocusableProps<E>) {
//         const { ref, focused, focusSelf } = useFocusable<object, E>({ focusKey, onEnterPress?, onFocus? })
//         return <>{children({ ref, focused, focusSelf })}</> }
// story 用法：<Focusable<HTMLButtonElement>>{({ ref, focused }) => <Slot ref={ref} selected={focused} />}</Focusable>

// useSpatialFocus — 轻 hook，返回命令式 API
// return { setFocus, navigate: navigateByDirection, currentFocusKey: getCurrentFocusKey }

// useGamepadFocus — Gamepad API rAF 轮询 → 方向导航 + A 键选择
interface UseGamepadFocusOptions { deadZone?: number; repeatMs?: number; enabled?: boolean }
// 实现：requestAnimationFrame 轮询 navigator.getGamepads()[0]；读 axes[0],axes[1] 经 axisToDirection，
//       或 dpad 按钮（12上/13下/14左/15右）→ 方向；带 repeatMs 去抖重复调用 navigateByDirection(dir)；
//       A 键（buttons[0]）上升沿 → window.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter'})) + keyup，
//       复用 norigin 的 onEnterPress。enabled=false 时不轮询。
```

`src/focus/index.ts` 额外 re-export norigin 的 `useFocusable`、`FocusContext`、`setFocus`、`navigateByDirection` 及类型 `Direction`，让消费方直接用 norigin 的 API（我方不重造）。

## 依赖 / 构建接法

- `packages/ui/package.json`：
  - `peerDependencies` 增 `"@noriginmedia/norigin-spatial-navigation": "^3.2.1"`；
  - `"peerDependenciesMeta": { "@noriginmedia/norigin-spatial-navigation": { "optional": true } }`；
  - `devDependencies` 增同款（供本包 build/typecheck 解析类型）；
  - `exports` 增 `"./focus": { "types": "./dist/focus/index.d.ts", "import": "./dist/focus/index.js" }`。
- `packages/ui/tsup.config.ts`：`entry: ['src/index.ts', 'src/focus/index.ts']`（tsup 默认把 peer/deps external，norigin 不打包、运行时 import；产出 `dist/index.*` 与 `dist/focus/index.*`）。build 脚本其余（拷 CSS）不变。
- `examples/ui-gallery/package.json`：增 `"@noriginmedia/norigin-spatial-navigation": "^3.2.1"`（story 运行时需要）。

## 演示

新增 `examples/ui-gallery/src/Focus.stories.tsx`（title `HUD / Focus`，storySort 已含 'HUD'）：`<FocusProvider>` 包一格 `<Focusable>` 包 `<Slot>` 的网格，方向键在格子间移动焦点（`selected={focused}` 高亮），`onEnterPress` 触发动作；挂 `useGamepadFocus()` 演示手柄。

## 测试策略

- `focusTrap.ts`、`gamepadAxis.ts` → `src/__tests__/*.test.ts`，纯 vitest node（不依赖 norigin）。
- 组件/hooks/Modal 焦点陷阱：typecheck + build + gallery typecheck（仓库无 DOM 测试；空间导航真实交互属浏览器行为，story 冒烟；可选事后浏览器验一次）。
- 文件命名规避 TS1149。
- **验证范围**：只 `@overworld-engine/ui` + `ui-gallery`（后者新增 norigin 依赖，`pnpm install` 后 gallery typecheck）。不跑全 workspace。

## 发布

`@overworld-engine/ui` minor（新 `/focus` 入口、组件 forwardRef、Modal 焦点陷阱）。属固定版本组。因模块 B 已在 main 暂存、B+C 将由同一个 Release PR 一起发一版。

## 非目标（模块 C）

- 重造空间导航算法（用 norigin）。
- 把空间导航强塞进现有组件（Slot/Button 只加 forwardRef；是否可聚焦由消费方用 `Focusable` 包裹决定，opt-in）。
- 手柄的完整按键映射/重绑（只做方向 + A 键选择的最小桥接；复杂映射归宿主）。
- 真实浏览器交互的自动化测试（超出仓库测试门；story 冒烟 + 可选人工验）。

## 开放问题

- norigin `init()` 时机：在 FocusProvider 模块级 guard 内调用一次；norigin 对 init 前注册的 focusable 有兜底处理。若实测 init 时机导致首帧焦点未就绪，可改为 `useState` 惰性初始化——属实现细节，不改对外 API。
- StrictMode 双调：`init()` 有 `initialized` guard 防重复；`useGamepadFocus` 的 rAF 循环在 cleanup 里 `cancelAnimationFrame`。
