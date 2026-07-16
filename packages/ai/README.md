# @overworld/ai

网格 A* 寻路 + NPC 转向行为(巡逻/游荡/跟随)。纯函数的网格与寻路、
无头 agent 引擎,加上可选的 R3F 驱动组件 —— 视觉模型由游戏注入。

## 安装

```bash
pnpm add @overworld/ai @overworld/core
# peers: react three @react-three/fiber
```

## 快速开始

```tsx
import { createNavGrid, createAgent, NPCWalker, collidersToObstacles } from '@overworld/ai'

const grid = createNavGrid({
  bounds: { minX: 0, maxX: 40, minZ: 0, maxZ: 40 },
  cellSize: 1,                       // 默认 1
  agentRadius: 0.5,                  // 障碍按此半径膨胀(默认 0.5)
  // 结构化兼容 scene 的碰撞表:collidersToObstacles(colliders.values())
  obstacles: [{ x: 10, z: 12, radius: 2 }],
})

const guard = createAgent({ grid, position: [4, 4], speed: 1.5 })
guard.patrol([[4, 4], [20, 4], [20, 20]], { pauseMs: 800 })   // loop: false = 往返

function Guard() {
  return (
    <NPCWalker agent={guard} onArrive={(i) => console.log('到达路点', i)}>
      <GuardModel />   {/* 视觉由游戏提供 */}
    </NPCWalker>
  )
}
```

## 网格与 A*(纯函数)

- `createNavGrid(config)` → `NavGrid`:圆形障碍栅格化(**格子中心**落在
  `障碍半径 + agentRadius` 内即阻塞),提供 `isWalkable(cx, cz)`、
  `worldToCell` / `cellToWorld`(中心点)、动态 `blockCircle(x, z, radius)`、
  `unblockAll()` 与 `rebuild(obstacles?)`(整体重刷,省参则恢复创建时的障碍)。
- `findPath(grid, from, to, options?)` → `[x, z][] | null`:A* + octile 启发式,
  8 方向且**禁止斜穿角**(斜向要求两个正交邻格均可走)。起点/终点格被阻塞时,
  在 `fallbackRadius`(默认 3 格)内回退到最近可走格 —— 此时路径终点是该格中心
  而非精确目标;首个路点恒为精确 `from`,目标格可走时末路点为精确 `to`。
  找不到路(或回退失败)返回 `null`。默认自动平滑,`smooth: false` 关闭。
- `smoothPath(grid, path)`:拉绳式平滑(基于 `hasLineOfSight` 的网格射线,
  1/4 格步进采样),保端点、不增长。`hasLineOfSight` / `nearestWalkableCell` 亦导出。

## 无头 agent(`createAgent`)

`createAgent({ position?, speed?, grid?, random? })` → `Agent`。配置了 `grid`
时每段行程走 A*,否则直线。用 `update(deltaMs)` 驱动,返回 `AgentStatus`
(`behavior` / `position` / `heading` / `isMoving` / `arrived?`)。

**约定**:`speed` 单位是**世界单位/秒**(与帧率无关,一次 `update` 内的
剩余时间会跨到达/停顿结转);`heading = Math.atan2(dx, dz)`(弧度,`0` 朝 **+Z**、
`π/2` 朝 **+X**,与 scene 的 Player 一致,可直接赋给 `rotation.y`,模型默认朝 +Z)。

- `patrol(waypoints, { loop?, pauseMs? })` — `loop: true`(默认)循环,
  `false` 往返(ping-pong);每个路点停 `pauseMs`;到达时 `arrived` = 路点下标。
- `wander({ center, radius, pauseMsRange?, random? })` — 在圆内随机取可达点,
  两段之间随机停顿。`random` 可注入以获得确定性,消耗顺序:角度、距离
  (寻路被拒时每段最多重掷 5 次),有 `pauseMsRange` 时再掷 1 次停顿时长。
- `follow(target, { stopDistance?, repathMs? })` — `target` 为
  `{ current: [x, y, z] }` 形状的引用(结构化兼容 scene 的 `playerPositionRef`)
  或 `() => [x, z]` 函数;最多每 `repathMs`(默认 500)且目标移动超过约 0.1
  单位时才重寻路;进入 `stopDistance`(默认 1)即停,目标走远后自动恢复。
- `idle()` — 停在原地,保留朝向。`position` / `speed` 均可运行期直接改写。

## R3F 组件

- `<NPCWalker agent y? rotationOffset? rotationLerp? onArrive?>{children}</NPCWalker>`
  — 每帧调 `agent.update(delta * 1000)`,把 group 放到 `[x, y, z]`(`y` 默认 0)
  并沿最短弧平滑转向 `heading`;`rotationOffset` 适配非 +Z 朝向的模型;
  `onArrive(waypointIndex)` 在到达行为级目的地那一帧触发。
- `useAgentDriver(agent, options?)` — 同逻辑的 hook 形式,返回挂到自建
  `<group>` 上的 ref。
- `collidersToObstacles(colliders)` — 把 scene 碰撞表形状的碰撞体
  (`{ position: { x, z }, radius }`,结构化类型,不依赖 @overworld/scene)
  映射成 `createNavGrid` 的障碍数组。

## 测试

```bash
pnpm test        # vitest,44 个用例覆盖栅格化/A*/平滑/巡逻/游荡/跟随
```
