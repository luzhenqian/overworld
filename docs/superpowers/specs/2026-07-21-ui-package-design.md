# @overworld-engine/ui — 设计文档

日期：2026-07-21
状态：已与需求方确认（组件范围、主题深度、包拆分、主题清单、架构方案、三节设计均获逐项批准）

## 目标

为 Overworld 提供游戏 UI 包：headless 理念（行为可逃逸、样式可全量覆盖），同时开箱即用（预置四套完整风格皮肤）。覆盖两类内容：

1. **引擎配套 UI**：为 dialogue / quest / inventory / notifications / tutorial / achievements 六个 headless 引擎提供渲染层
2. **通用 HUD 原语**：面板、窗口、血蓝条、格子、热键栏、按钮、Tooltip、Modal 等

## 非目标（v1）

- 窗口拖拽、背包拖放（列为 stretch，不进 v1）
- 虚拟摇杆（weapp 适配包已有；web 端属 scene 关注点）
- 小游戏（weapp canvas）环境支持——DOM-only
- 位图贴图资源（全部矢量内联 SVG）
- 跨系统联动逻辑（任务完成弹 toast 等属宿主胶水 + gameEvents 总线职责）

## 包结构

- 路径 `packages/ui`，包名 `@overworld-engine/ui`，单包，主题走子路径导出
- deps：仅 `@overworld-engine/core`（**零跨系统包 import 硬规则**，合入前 grep 验证）
- peerDeps：`react ^18`、`zustand ^5`
- 构建：tsup（与既有包一致）；CSS 原样拷贝进 dist
- 导出面：

```
@overworld-engine/ui              # 组件 + hooks + 结构化接口类型
@overworld-engine/ui/styles.css   # 基础层（必引）
@overworld-engine/ui/themes/xianxia.css    # 仙侠国风（致敬梦幻西游）
@overworld-engine/ui/themes/hextech.css    # 奥术魔幻（致敬 LOL）
@overworld-engine/ui/themes/tactical.css   # 军事战术（致敬 CF/现代 FPS）
@overworld-engine/ui/themes/pixel.css      # 像素复古（致敬 Stardew/老 Zelda）
```

## 架构（已选方案）

**CSS 主题化的样式组件 + 结构化引擎适配**：一套组件渲染语义化 DOM（稳定 class `ow-*` + `data-ow-*` 状态属性，近零内联样式），主题为纯 CSS 文件，可运行时热切；引擎组件通过 duck-typed 接口接收引擎实例；同时导出行为 hooks 供完全自绘。

否决的备选：
- 每主题一套组件树 —— 还原度最高但代码 ×4、不能运行时换肤，YAGNI
- JS 主题对象 + 内联样式 —— 丢伪类/动画/媒体查询；weapp 收益是伪需求（canvas 环境本就不能用 DOM）

## 组件清单（v1）

### 通用 HUD 原语

| 组件 | 说明 |
|---|---|
| `Hud` / `Hud.Anchor` | 全屏覆盖层 + 九宫格锚位；pointer-events 精细管理（覆盖层穿透、控件可点） |
| `Panel` | 主题化面板（可选标题栏/关闭钮），一切窗口的基底 |
| `GameWindow` | 可开关窗口，注册进 z-order 管理 |
| `Bar` | 血/蓝/经验条，variant=hp/mp/xp，含纯 CSS 延迟伤害残影 |
| `SlotGrid` / `Slot` | 物品格子原语（背包与热键栏共用），`data-ow-rarity` 稀有度态 |
| `Hotbar` | 格子行 + 键位角标 |
| `Button` / `IconButton` | 主题化按钮 |
| `Tooltip` | 锚定式物品提示框 |
| `Modal` | 模态层（alert/confirm 基底） |

### 引擎配套组件（结构化接口，不 import 引擎包）

| 组件 | 接口 | 内容 |
|---|---|---|
| `DialogueBox` | `DialogueEngineLike` | 头像 slot、打字机、选项列表 |
| `QuestTracker` / `QuestLogWindow` | `QuestEngineLike` | HUD 目标追踪 + 任务日志窗 |
| `InventoryWindow` | `InventoryEngineLike` | SlotGrid + 使用/丢弃 + Tooltip |
| `ToastViewport` / `AlertHost` | notifications store 形状 | toast 队列 / alert-confirm |
| `TutorialOverlay` | `TutorialEngineLike` | 高亮目标 + 步骤文案 |
| `AchievementPopup` | `AchievementsEngineLike` | 独立解锁弹窗组件：订阅成就解锁状态自行渲染（不注入 ToastViewport），外观复用 toast 样式体系 |

### hooks 逃生舱

`useTypewriter`、`useSlotGrid`、`useWindowManager` 等纯行为导出，供自绘用户使用。

### UI 自身状态

`useUiStore` 模块级单例（符合「infra/UI 用单例」约定）：窗口开闭注册、z-order、`anyWindowOpen` 标志。键盘焦点抢占不直接对接 input 包——宿主用 `anyWindowOpen` 自行接 input 优先级层。

## 主题机制

消费方式：

```tsx
import "@overworld-engine/ui/styles.css";
import "@overworld-engine/ui/themes/xianxia.css";
<Hud theme="xianxia">…</Hud>   // 设置 data-ow-theme，运行时可热切
```

1. **基础层 `styles.css`**：作用域限定 `.ow-root` 下不污染宿主；定义全套 design tokens（`--ow-color-*`、`--ow-font-*`、`--ow-radius`、`--ow-space-*`、`--ow-panel-border`、`--ow-ui-scale`）；提供布局骨架 + 中性默认外观（只引 base 即可用）。
2. **皮肤层**：每主题一个 CSS 文件，选择器挂 `.ow-root[data-ow-theme="…"]`，做三件事：覆盖 tokens；组件级质感（渐变/box-shadow/伪元素角饰）；**内联 SVG 九宫格边框**（`border-image: url("data:image/svg+xml,…")`）——祥云角花 / 切角金属框 / 斜切战术框 / 硬边像素框（pixel 配 `image-rendering: pixelated`）。零外部资源。
3. **状态样式约定**：状态一律暴露为 data 属性（`data-ow-state`、`data-ow-rarity`、`data-ow-variant`），主题与消费者均用属性选择器定制——不满意任何主题时写普通 CSS 即可全量覆盖。
4. **动效纪律**：尊重 `prefers-reduced-motion`；皮肤动效只用 CSS。

## 数据流

```
宿主创建引擎 → prop 传入组件 → useStore(engine.store, selector) 订阅
→ 交互回调引擎方法（advance/choose/useItem）→ store 更新 → 重渲
```

- 结构化接口在 ui 包内定义，镜像各引擎 `{ store, ...methods }` 工厂返回形状；真引擎实例天然满足，不匹配则编译期报错
- UI 零业务逻辑；跨系统联动归 gameEvents 总线 + 宿主

## 错误处理 / 边界

- 引擎无活动状态 → 组件渲染 `null`，不抛错
- 未引主题 CSS / 未知 theme 名 → 降级 base 外观
- 超长文本、溢出、空背包 → base.css 兜底样式

## 测试

严格遵守仓库纯逻辑测试约定（无 testing-library / jsdom，不新增测试基建依赖）：

- 纯函数抽取并以 vitest node 测试：打字机步进、SlotGrid 分页/寻位、z-order 管理器、toast 排布 reducer、tooltip 定位计算
- 组件与 CSS：typecheck + build 验证
- 文件命名规避 TS1149 大小写冲突

## 演示与验收

新增 `examples/ui-gallery`（Vite app）：全组件陈列、四主题热切换、假引擎数据。主题视觉质量以此为验收场。

## 发布

进入 changesets 固定版本组，随组发版（minor：新增包）。
