# @overworld-engine/ui — P0 战斗 HUD 与 HUD 扩展设计

日期：2026-07-21
状态：拆分与 A→B→C 顺序、模块 A 组件 API、rarity 补全均已与需求方确认

## 背景

承接 [UI 组件库深度调研](https://claude.ai/code/artifact/6f7e1d8a-8eda-4451-8034-e26f8375c822)（两轮多代理调研、47 条对抗核查结论）。核心结论：React/DOM 层不存在成熟活跃的游戏语义 headless UI 库，`@overworld-engine/ui` 处于生态空白区、定位可防守；组件广度应对标 rexUI（约 46 组件 vs 当前 17）。

当前 `@overworld-engine/ui` 有 17 个组件 + 4 套 CSS 主题（tactical/pixel/xianxia/hextech）。对照 FFXIV 官方 UI 指南、WoW HUD 与 Game UI Database 的分类体系，**战斗 HUD 是最硬的缺口**：施法条、目标框/敌方血条名牌、Buff/Debuff 栏均为商用 RPG 默认标配且完全缺失（现有 `Bar` 只有 hp/mp/xp 资源语义）。

本文档定义调研路线图的 **P0**，并详细设计 P0 的第一个子模块（模块 A：战斗 HUD 组件）。

## P0 拆分与构建顺序

P0 含三个相互独立的子系统，按内聚度与风险拆为三个模块，各自 spec → plan → 实现：

| 模块 | 内容 | 依赖 / 风险 | 状态 |
|---|---|---|---|
| **A. 战斗 HUD 组件** | CastBar、TargetFrame、Nameplate、BuffBar + rarity token 补全 | 纯 prop 驱动、零新依赖 | **本文档详细设计** |
| **B. Minimap HUD 装饰** | Compass 罗盘、MinimapFrame 边框、屏幕边缘路点指示 | 复用 minimap 包 radar，跨包用组合 | 独立 spec（后续） |
| **C. 空间焦点导航** | 引入 `@noriginmedia/norigin-spatial-navigation` + FocusProvider + 手柄桥接 + 改造 Slot/Button/Modal | 新增运行时依赖、横切改焦点管理 | 独立 spec（后续） |

**顺序理由**：A 价值最高、零风险，先立住"prop 驱动 HUD 组件"模式；C 要改造最多组件，放最后（届时组件面更全，一次性接入省去反复回填）；B 独立、小，夹中间。

### 模块 B 高层草图（延后细化）

minimap 已是独立包（marker 注册 + radar 含 `computeOffscreenIndicator` 屏幕边缘指示 + MiniMap canvas 组件）。受零跨包导入约束，UI 包**不能** import `@overworld-engine/minimap`。装饰层走**组合**：UI 包提供 `Compass`（罗盘方位条）、`MinimapFrame`（主题化边框/坐标读数外框）、`WaypointIndicator`（屏幕边缘路点箭头，消费 radar 计算出的 `angle`），app 在 gallery 里把 `<MiniMap>` 嵌进 `<MinimapFrame>`（与 `Hud.Anchor` 同一组合模式）。

### 模块 C 高层草图（延后细化）

引入 `@noriginmedia/norigin-spatial-navigation`（MIT、React Hooks、自动空间算法，调研已核查）。要点：Modal 当前无焦点陷阱；`@overworld-engine/input` 有键盘优先级层但**无手柄支持**，故需一个 Gamepad API 轮询器把手柄方向桥接为导航事件；FocusProvider + `useSpatialFocus` 焦点层；改造 Slot/Button/Modal/GameWindow 接入。因横切改动大，独立 spec 评估依赖取舍与桥接方案。

---

## 模块 A 详细设计：战斗 HUD 组件

### 架构决策（受现状约束）

仓库无 combat/status 引擎包，且有**零跨包导入硬规则** → 这四个组件全部是**展示型 prop 驱动组件**（形态同 `Bar`/`SlotGrid`），不走引擎绑定（不同于 `DialogueBox`/`QuestTracker` 的 `useStore(engine.store)` 模式）。战斗状态由宿主/游戏逻辑计算后以 prop 传入。这保持了 UI 零业务逻辑，也不引入新引擎依赖。

组件遵循既有约定：稳定 class `ow-*` + `data-ow-*` 状态属性、近零内联样式、全部走 `--ow-*` design token。

### 组件 API

```tsx
// CastBar — 施法条。复用 Bar 的填充/ghost 基建思路，但含施法语义
interface CastBarProps {
  value: number                 // 已施法时间
  max: number                   // 总施法时长（同单位）
  label?: ReactNode             // 技能名
  icon?: ReactNode              // 技能图标
  state?: 'casting' | 'channeling' | 'interrupted' | 'success'  // → data-ow-state
  channel?: boolean             // 引导法术：填充 100% → 0% 反向排空
  showRemaining?: boolean       // 显示剩余秒数文本，如 "1.4"
}

// BuffBar / Buff — 增益减益栏：图标 + 冷却扇形转轮 + 层数角标
interface BuffSpec {
  id: string
  icon?: ReactNode
  remaining?: number            // 剩余时长；省略表示永久（无转轮）
  duration?: number             // 总时长；冷却扇形 = remaining / duration
  stacks?: number               // 层数角标，<= 1 隐藏
  kind?: 'buff' | 'debuff'      // → data-ow-kind（减益红框等）
}
interface BuffBarProps {
  buffs: readonly BuffSpec[]
  max?: number                  // 最多展示数，超出截断
}

// TargetFrame — 目标框。组合 Bar（血/资源）+ BuffBar
interface TargetFrameProps {
  name: ReactNode
  level?: number | string
  hp: number
  hpMax: number
  resource?: number             // 可选第二资源（法力/能量）
  resourceMax?: number
  classification?: 'normal' | 'elite' | 'rare' | 'boss'   // → data-ow-classification
  reaction?: 'hostile' | 'neutral' | 'friendly'           // → data-ow-reaction（颜色语义）
  portrait?: ReactNode
  buffs?: readonly BuffSpec[]   // 组合 BuffBar
  castBar?: ReactNode           // 可选施法条插槽
}

// Nameplate — 敌方头顶血条名牌，TargetFrame 的轻量版
// 世界坐标 → 屏幕坐标的定位由宿主负责（放进绝对定位容器或 Hud 层）
interface NameplateProps {
  name: ReactNode
  hp: number
  hpMax: number
  level?: number | string
  reaction?: 'hostile' | 'neutral' | 'friendly'
  showLevel?: boolean
}
```

### 内部复用

- TargetFrame、Nameplate 的血条复用 `Bar`（`variant="hp"`）；TargetFrame 的资源条复用 `Bar`。
- TargetFrame 的 buff 展示复用 `BuffBar`。
- `Buff` 单元格与 `Slot` 视觉体系一致（方形、可带 rarity 边框），但独立组件（Buff 有冷却转轮 + 层数、无按钮语义）。

### 纯逻辑抽取（vitest node 测试，无 testing-library）

遵循仓库约定：非平凡逻辑抽成纯函数并单测；组件本身靠 typecheck + build + Storybook 验证。

**`castProgress.ts`**
```ts
function castProgress(
  value: number,
  max: number,
  opts?: { channel?: boolean },
): { fillPct: number; remainingSeconds: number }
```
- `max <= 0` → `{ fillPct: 0, remainingSeconds: 0 }`
- ratio = clamp(value / max, 0, 1)
- `fillPct` = channel ? (1 - ratio) * 100 : ratio * 100
- `remainingSeconds` = max(0, max - value)
- 测试：普通填充、channel 反向、clamp 越界（value>max、负值）、max=0 守卫

**`buffTimer.ts`**
```ts
function buffSweepPct(remaining: number, duration: number): number
function formatBuffTime(seconds: number): string
```
- `buffSweepPct`：`duration <= 0` → 0（永久，无转轮）；否则 clamp(remaining/duration, 0, 1) * 100（表示"剩余"比例，供 conic-gradient 扇形）
- `formatBuffTime`（紧凑倒计时文本）：
  - `s >= 60` → `"M:SS"`（如 83 → `"1:23"`，秒数两位补零）
  - `10 <= s < 60` → `"Ns"`（四舍五入整数，如 `"45s"`）
  - `0 < s < 10` → 一位小数、无单位（如 `"3.2"`）
  - `s <= 0` → `""`（空串，不渲染）
- 测试：三档边界（59.5/60/9.9/10）、补零、小数、<=0 空串

`unitFrame` 类的血量百分比计算不单独抽取（`Bar` 已处理 pct，抽取属过度设计）。

### rarity token 补全（纳入模块 A 的共享基础）

现状：`--ow-color-rarity-*` 仅 4 档（common/rare/epic/legendary），`Slot` 有 `data-ow-rarity` 钩子、base CSS 有 `.ow-slot[data-ow-rarity="..."]` 边框映射（4 条），但档位对不上调研里 WoW 的 6 档事实标准。

改动：扩为 **6 档** `{ poor, common, uncommon, rare, epic, legendary }`。base 主题取"可辨识但克制"的中性值（贴近 WoW 语义：poor 灰 / common 近白 / uncommon 绿 / rare 蓝 / epic 紫 / legendary 橙），4 套主题各自 override。base CSS 的 `.ow-slot[data-ow-rarity]` 补齐 poor/uncommon 两条；`Buff` 与未来物品浮层可复用同一组 token。

- **行为变更提示**：`--ow-color-rarity-common` 从灰（#9aa0b0）改为近白，语义更贴 WoW；属有意变更。
- **色盲无障碍**（调研结论，记录为约定、P0 不实装）：rarity 不应只靠颜色。文档中约定消费方可叠加形状/图标/边框纹理冗余编码；组件保留 `data-ow-rarity` 钩子使其可行。实装冗余编码属后续，YAGNI 出 P0。

### 样式

- base 层 `styles.css` 新增 `.ow-castbar / .ow-buffbar / .ow-buff / .ow-target-frame / .ow-nameplate`，全部走现有 `--ow-*` token；冷却扇形用 `conic-gradient`；施法条 interrupted/success 态用 `data-ow-state` 属性选择器变色。
- 4 套主题按需加点缀（至少确保继承 token 无破样）；hextech/pixel 等成本低处加质感。
- 尊重 `prefers-reduced-motion`；动效只用 CSS。

### 导出与演示

- `src/index.ts` 具名导出四组件 + props 类型 + 两个纯逻辑函数（与既有导出面一致，如 `trackerRows`/`slotRows` 均导出）。
- 新增 `examples/ui-gallery/src/CombatHud.stories.tsx`（title `HUD / Combat`）：CastBar（含 channel/interrupted 态与播放控制）、BuffBar（含冷却倒计时）、TargetFrame（各 classification/reaction）、Nameplate。真实用法即编译期验证。

### 测试策略

- `castProgress.ts`、`buffTimer.ts` → `src/__tests__/*.test.ts`，纯 vitest node。
- 组件 + CSS：typecheck + build + gallery 编译。
- 文件命名规避 TS1149 大小写冲突。
- **验证范围**：只 build/test `@overworld-engine/ui` + 其依赖方（ui-gallery），不跑全 workspace。

### 发布

`@overworld-engine/ui` minor（新增组件，属 changesets 固定版本组）。

## 非目标（模块 A）

- 施法/Buff 的状态机与计时器逻辑（属宿主/游戏循环；组件只渲染传入的瞬时值）
- 伤害飘字（floating combat text）——归后续（高频创建销毁，需对象池 + transform/opacity 方案，另行评估）
- Nameplate 的世界→屏幕坐标投影（宿主职责）
- rarity 色盲冗余编码的具体实装（保留钩子，实装延后）
- 模块 B、C 的实现（各自独立 spec）

## 开放问题

- 无阻塞性问题。formatBuffTime 的 <10s 小数格式已锁定为无单位一位小数；如后续需与主题联动（如 pixel 主题整数化），走 data 属性 + 消费方覆盖，不改逻辑层。
