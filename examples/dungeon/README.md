# Overworld Dungeon — 程序化地牢爬行示例

自顶向下视角的黑暗地牢爬行游戏,约 3 分钟一局。与 `examples/starter` 互补:
starter 演示"手摆村庄 + i18n + 联机 presence",本示例演示**程序化生成 + 寻路/行为树 + 黑暗氛围**,
且全程中文字面量、**不接 i18n**(title/text 对引擎是不透明字符串,两条路都成立)。

## 玩法

- 出生在地牢的第一个房间,旁边的**幽灵向导**(E 对话)会给你提示。
- 跟着地上的**引导微光**深入地牢,捡到最深处的**钥匙**(任务「探索地牢」自动开始)。
- 带着钥匙回到**宝箱**前按 E 打开(链式任务「打开宝箱」),即通关并显示耗时。
- 沿途散落**金币**(+20/枚);2~3 个**骷髅守卫**在房间里巡逻,靠近(5 格)会被追击,
  甩开(9 格)后它们放弃并走回岗位。被抓到一次 -1 ❤️ 并击退;3 颗心扣完游戏结束,可一键重开。

## 种子玩法

地图由 URL 参数驱动:`?seed=任意整数`(默认 42)。同一种子永远生成同一座地牢——
可以拿来"竞速":`http://localhost:5173/?seed=2024`。通关后可直接点「换一座地牢」。

## 本示例验证了框架哪些能力(相对 starter 的增量)

| 能力 | 用法 |
| --- | --- |
| `@overworld-engine/ai` NavGrid | 生成器的墙格逐格 `blockCircle` 进 NavGrid,碰撞与寻路共享同一份网格数据 |
| `@overworld-engine/ai` 行为树 | 守卫 = `createBehaviorTree`(selector/sequence/parallel/patrolAction)+ `tickTreeWithAgent`,巡逻→追击→放弃回岗 |
| `@overworld-engine/ai` HPA* | `createHierarchicalGrid` + `findPathHierarchical` 每 0.8s 重算"玩家→当前目标"的引导路径 |
| `@overworld-engine/core` 事件声明合并 | 游戏自定义事件 `dungeon:player-hit` / `dungeon:chest-opened` 类型安全地并入框架事件表 |
| `@overworld-engine/quest` 任务链 | `autoStart` + `chainNext` + `prerequisites.conditions`(`inventory.has` 自注册条件),宝箱任务由自定义事件触发 |
| `@overworld-engine/scene` 碰撞 | 数百个墙格通过 `decorationCollisions`(圆形碰撞体半径 0.55 近似方格)一次性声明注册 |
| `@overworld-engine/scene` 交互 | 宝箱不是 NPC 也不是 Building 组件:自绘网格 + `useProximityDetection` + `interact` 事件 |
| `@overworld-engine/environment` | 时间锁定午夜 + `setPaused(true)`,`DayNightLighting` 常驻夜间;火把 = 挂在 Player children 上的点光源 |
| `@overworld-engine/minimap` | 钥匙/金币/宝箱/守卫(移动)/NPC 全部打标记,玩家箭头内建 |
| 其余 | quest 追踪 HUD、toast、虚拟摇杆、键盘层(对话阻断移动)、质量预设、场景编辑器、devtools 内容校验,与 starter 同款 |

starter 有而本示例刻意没有的:i18n、联机 presence、NPC 日程(昼夜相位)、成就。

## 工程

```bash
pnpm dev        # 开发
pnpm test       # 生成器纯函数单测(确定性/连通性/摆放/墙密度,22 例)
pnpm typecheck  # TS strict
pnpm build      # tsc --noEmit && vite build
```

生成器(`src/game/dungeon.ts`)是纯函数:mulberry32 种子 → 不重叠房间 → 2 格宽 L 形走廊
(1 格走廊会被半径 0.55 的墙碰撞圆卡死,故意加宽)→ BFS 选最远房间放钥匙/宝箱 → 守卫与金币。
所有导出都不依赖 three.js/React,直接可测。

调试:开发模式下 `window.__game` 暴露 quests/inventory/enemies/playerPositionRef/dungeonSeed/gameStore 等句柄。
