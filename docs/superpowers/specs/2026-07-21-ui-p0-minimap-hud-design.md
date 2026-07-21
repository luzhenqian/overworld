# @overworld-engine/ui — P0 模块 B：Minimap HUD 装饰层设计

日期：2026-07-21
状态：三组件 API、gallery 加 minimap 依赖均已与需求方确认

## 背景

承接 [UI 组件库深度调研](https://claude.ai/code/artifact/6f7e1d8a-8eda-4451-8034-e26f8375c822) 路线图的 **P0 模块 B**（[总 spec](2026-07-21-ui-p0-combat-hud-design.md) 里 A/B/C 三模块拆分的第二个）。模块 A（战斗 HUD）已实现并发布 `@overworld-engine/ui@2.3.0`。

研究里对照 Game UI Database 的导航类屏幕，Overworld 缺三个导航 HUD 类别：**Compass 罗盘**、**Waypoints and Markers 路点标记**、以及小地图的 **HUD 装饰层**。`@overworld-engine/minimap` 已是独立包（marker 注册 store + radar 含 `computeOffscreenIndicator` 屏幕边缘指示 + `<MiniMap>` canvas 组件），本模块补的是它之上的 HUD 装饰与导航辅助组件。

## 架构决策（受现状约束）

1. **prop 驱动**（同模块 A）：三个组件都是展示型、只吃 prop，不绑引擎、不含业务逻辑。玩家朝向/坐标/目标方位由宿主算好传入。
2. **跨包用组合，不用 import**：零跨包导入硬规则下，UI 包**不能** import `@overworld-engine/minimap`。装饰层通过组合落地——UI 提供外框/罗盘/路点箭头，app 把 `<MiniMap>` 嵌进 `<MinimapFrame>`（与 `Hud.Anchor` 同一组合模式）。角度约定已核对：radar 的 `computeOffscreenIndicator().angle`（`atan2(rx,rz)`，0=正前方、顺时针）正好是 `WaypointIndicator.angle` 与 `edgeAnchor` 的输入，宿主直接透传、无需换算。
3. 组件遵循既有约定：`ow-*` class + `data-ow-*` 状态属性、近零内联样式、`--ow-*` token。

## 组件 API

```tsx
// MinimapFrame — 主题化外框，包住 app 传入的 <MiniMap>（或任意方形地图部件）
interface MinimapFrameProps {
  children?: ReactNode              // app 把 <MiniMap> 放这里
  label?: ReactNode                 // 区域/地名，显示在框头
  coords?: { x: number; z: number } // 玩家坐标读数，渲染成 "X 42  Z -18"（各分量 Math.round）
  controls?: ReactNode              // 缩放/按钮插槽（角落）
}

// Compass — 水平罗盘方位条，随玩家朝向滚动
interface CompassMarker {
  id: string
  bearing: number                   // 世界方位角（弧度，0=北/上，与 heading 同约定）
  icon?: ReactNode
  color?: string
}
interface CompassProps {
  heading: number                   // 玩家朝向弧度（three.js：0 = 面向 -Z = 北）
  fov?: number                      // 可见条的角度视野，默认 Math.PI（180°）
  markers?: readonly CompassMarker[]// 沿条分布的方位 pip（任务点/POI）
}

// WaypointIndicator — 屏幕边缘箭头，指向屏外目标（自定位覆盖元素）
interface WaypointIndicatorProps {
  angle: number                     // 屏幕方位角（弧度，0=上，顺时针）= radar computeOffscreenIndicator().angle
  label?: ReactNode
  icon?: ReactNode
  distance?: ReactNode              // 距离读数，如 "42m"
  color?: string
}
```

内部约定：`MinimapFrame` 的 coords 读数把 `x`/`z` 各 `Math.round` 后渲染（trivial，不抽函数）。`WaypointIndicator` 用绝对定位，位置/旋转由 `edgeAnchor` 算出；宿主把它放进 `position: relative` 的 HUD 容器（如 `Hud`）里。

## 纯逻辑抽取（vitest node 测试，无 testing-library）

**`compassStrip.ts`**
```ts
/** 归一化角度到 [-π, π]。 */
function normalizeAngle(radians: number): number   // 内部用，可导出供测试

/** 某方位在罗盘条上的归一化横坐标 [0,1]，超出视野返回 null；处理 ±π 环绕。 */
function compassOffset(bearing: number, heading: number, fov: number): number | null

interface CompassTick { label: string; offset: number; major: boolean }
/** 生成落在可见视野内的八方位刻度（N/NE/E/SE/S/SW/W/NW），N/E/S/W 为 major。 */
function compassTicks(heading: number, fov: number): CompassTick[]
```
- `compassOffset`：`rel = normalizeAngle(bearing - heading)`；`|rel| > fov/2` → `null`；否则 `0.5 + rel / fov`（正前方 rel=0 → 0.5 居中）。
- 测试：正前方居中(0.5)、右侧 rel=+fov/2 → 1.0 边界、超视野 → null、±π 环绕（heading=3.0、bearing=-3.0 相邻应可见且接近而非跨屏）、compassTicks 只返回可见刻度且 major 标记正确。

**`edgeAnchor.ts`**
```ts
/** 屏幕方位角 → 屏幕矩形边缘锚点。angle 弧度，0=上，顺时针正。 */
function edgeAnchor(angle: number, opts?: { inset?: number }): {
  xPct: number      // [0,1]，0=左 1=右
  yPct: number      // [0,1]，0=上 1=下
  rotationDeg: number
}
```
- 方向向量 `dir = (sin(angle), -cos(angle))`（屏幕 y 向下，0=上）；与中心为原点的单位方框求交，`t = 1 / max(|dir.x|, |dir.y|)`；原始边缘点 `edge = dir * t`（触边的分量恰为 ±1）；转成 `[0,1]` 百分比 `raw = (edge + 1) / 2`（触边分量恰为 0 或 1）；再把 `xPct`、`yPct` 各自 `clamp` 到 `[inset, 1 - inset]` 得到留边后的锚点；`rotationDeg = angle * 180 / Math.PI`。`inset` 表示离屏幕边缘的百分比边距，默认 0.06。
- 测试（`inset=0.06`）：angle 0 → 顶部居中 `{0.5, 0.06}`、π/2 → 右侧居中 `{0.94, 0.5}`、π → 底部居中 `{0.5, 0.94}`、-π/2 → 左侧居中 `{0.06, 0.5}`；对角线（如 π/4）→ 角附近两分量都被 clamp；rotationDeg 换算（π/2 → 90）。用 `toBeCloseTo` 断言浮点。

## 样式

- base 层 `styles.css` 新增 `.ow-minimap-frame / .ow-compass / .ow-waypoint`（及子元素），全部走 `--ow-*` token。Compass pip 与 tick 用绝对定位 + `left: calc(offset * 100%)`；WaypointIndicator 用 `left/top` 百分比 + `transform: rotate(...)`。
- 4 套主题按需加点缀（至少继承 token 无破样）。
- 尊重 `prefers-reduced-motion`；罗盘滚动/箭头脉冲等动效只用 CSS 且在 reduce 下降级。

## 导出与演示

- `src/index.ts` 具名导出三组件 + props 类型（含 `CompassMarker`）+ 纯逻辑函数（`compassOffset`、`compassTicks`、`edgeAnchor`、`normalizeAngle`），与既有导出面一致。
- **gallery 加依赖**：给 `examples/ui-gallery/package.json` 加 `"@overworld-engine/minimap": "workspace:*"`，以在 story 里嵌真 `<MiniMap>` 证明跨包组合编译通过。
- 新增 `examples/ui-gallery/src/Navigation.stories.tsx`（title `HUD / Navigation`，storySort 已含 'HUD'）：一个带坐标读数与区域名的 `<MinimapFrame>` 内嵌真 `<MiniMap>` + 注册几个 marker；一个动画 `heading` 驱动的 `<Compass>` 带若干 bearing pip；几个 `<WaypointIndicator>` 分布在屏幕边缘。

## 测试策略

- `compassStrip.ts`、`edgeAnchor.ts` → `src/__tests__/*.test.ts`，纯 vitest node。
- 组件 + CSS：typecheck + build + gallery typecheck（组件无渲染测试，同仓库约定）。
- 文件命名规避 TS1149 大小写冲突。
- **验证范围**：只 build/test `@overworld-engine/ui` + 其依赖方 `ui-gallery`（后者现新增依赖 minimap，需先 build minimap 才能 gallery typecheck；用 workspace `-r` 或先 `pnpm --filter @overworld-engine/minimap build`）。不跑全 workspace。

## 发布

`@overworld-engine/ui` minor（新增组件，属 changesets 固定版本组）。

## 非目标（模块 B）

- 世界→屏幕/朝向的推导（属宿主/scene；`inferHeading`/`createHeadingTracker` 已在 minimap 包，宿主自行接）。
- 小地图缩放/平移的交互逻辑（`controls` 只是插槽，行为归宿主）。
- 修改 `@overworld-engine/minimap` 包本身（本模块只在其之上加装饰层）。
- 模块 C（空间焦点导航）——独立 spec。

## 开放问题

- 无阻塞性问题。Compass 默认八方位刻度 + fov=π；若某主题想改刻度密度，走 data 属性 + 消费方覆盖，不改逻辑层。
