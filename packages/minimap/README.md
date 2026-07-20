# @overworld-engine/minimap

通用俯视小地图:无头标记(marker)注册表 + 基于 DOM `<canvas>` 的 `<MiniMap>` 组件。
不依赖 three.js —— 玩家位置通过结构化的 ref(`{ current: [x, y, z] }`)传入,可直接
使用 `@overworld-engine/scene` 的 `playerPositionRef` / `playerRotationRef`,也可以传任何
形状相同的对象。

## 标记注册表(无头)

```ts
import { useMinimapStore } from '@overworld-engine/minimap'

const { registerMarker, unregisterMarker, setMarkerPosition, clearMarkers } =
  useMinimapStore.getState()

registerMarker({
  id: 'npc:yi-he',
  kind: 'npc',              // 自由分类,用于 markerColors 配色
  position: [4, 0, -2],     // 世界坐标,仅投影 X/Z
  color: '#60a5fa',         // 可选:直接指定颜色,优先于 kind 配色
  label: '易禾',            // 可选:默认渲染器不绘制,供自定义 UI 使用
})

setMarkerPosition('npc:yi-he', [6, 0, 1])   // 移动实体(巡逻 NPC 等)
unregisterMarker('npc:yi-he')
clearMarkers()                              // 场景卸载时清空
```

相同 `id` 重复注册会整体替换;对不存在的 id 调用后两者是 no-op。

## `<MiniMap>` 组件

```tsx
import { MiniMap } from '@overworld-engine/minimap'
import { playerPositionRef, playerRotationRef } from '@overworld-engine/scene'

<MiniMap
  worldBounds={{ minX: -50, maxX: 50, minZ: -50, maxZ: 50 }}
  size={160}                                   // 画布边长 px,默认 160
  playerPosition={playerPositionRef}           // { current: [x, y, z] }
  playerRotation={playerRotationRef}           // 可选,{ current: 弧度 }
  markerColors={{ npc: '#60a5fa', shop: '#f472b6' }}
  background="rgba(15, 20, 30, 0.8)"
  borderRadius={12}
  refreshMs={100}                              // 轮询重绘间隔,默认 100ms
/>
```

行为:

- **朝北固定**:地图本身不旋转;世界 X → 画布右,世界 −Z(北)→ 画布上。
- 玩家绘制为按 `playerRotation` 旋转的三角形(three.js 约定:0 = 朝 −Z)。
- 标记绘制为圆点,颜色取 `marker.color ?? markerColors[kind] ?? 默认黄色`。
- 按 `refreshMs` 用 `setInterval` 轮询玩家 ref 重绘;标记 store 变化时立即重绘;
  卸载时清理定时器与订阅。
- 组件在 three.js Canvas **之外**渲染(普通 DOM 覆盖层),支持 `style` / `className`。
- `<canvas>` 元素带稳定的 `data-testid`(prop `testId`,默认 `'ow-minimap'`),供 E2E 断言存在性/截图。

## 投影辅助(纯函数)

```ts
import { projectToCanvas, projectionScale } from '@overworld-engine/minimap'

projectToCanvas(x, z, { worldBounds, size })   // → [px, py]
projectionScale({ worldBounds, size })         // → 每世界单位像素数
```

非正方形世界按等比缩放并居中(letterbox,不拉伸);越界坐标钳制在 `[0, size]`
(钉在地图边缘);退化边界(零面积)投影到画布中心。

## 依赖

依赖 `@overworld-engine/core`(仅类型);peer:`react`、`zustand`。不依赖 three.js。

## 本版本新增:雷达选择器(radar)

无头纯函数,把世界实体转换成"以玩家为中心、朝向向上"的雷达标记,供自定义
雷达 HUD(独立于 `<MiniMap>`)使用。

```ts
import { selectRadarMarkers } from '@overworld-engine/minimap'

const markers = selectRadarMarkers(
  { worldBounds, npcs: [{ id: 'guide', position: [4, 0, -2] }], range: 40 },
  playerPositionRef.current,
  playerHeading
)
// → [{ id: 'guide', kind: 'npc', x, y, offScreen, angle? }]
```

- `selectRadarMarkers(config, playerPos, playerHeading)` — 建筑 + NPC 列表 →
  按玩家朝向旋转、按 `range` 钳制到边缘的标记数组;超出范围的标记
  `offScreen: true` 并带 `angle`。
- `computeOffscreenIndicator(worldPos, playerPos, playerHeading, range)` —
  单个实体的越界指示角度,供边缘箭头一类的 UI 使用。
