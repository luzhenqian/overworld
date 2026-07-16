# @overworld/editor

游戏内场景编辑器**雏形**:在运行中的游戏里摆放/移动 NPC、建筑、装饰物,
调整属性,一键导出场景 JSON。由三部分组成:

- `useEditorStore` —— 无头工作集(zustand 单例),含 JSON 导入/导出,可脱离渲染层单测;
- `<EditorScene>` —— 挂在 `<Canvas>` 内的 R3F 编辑层(地面拾取、占位网格、拖拽移动);
- `<EditorPanel>` / `<EditorToggle>` —— Canvas 外的 DOM 面板与悬浮开关按钮。

编辑器关闭时(`enabled === false`)三者都不渲染任何内容,可以常驻在开发构建里。

## 快速开始

```tsx
import { Canvas } from '@react-three/fiber'
import { EditorScene, EditorPanel, EditorToggle } from '@overworld/editor'

<Canvas>
  <MyScene />
  <EditorScene groundSize={120} y={0} />
</Canvas>
<EditorPanel />
<EditorToggle hotkey="F2" />   {/* 悬浮按钮 + 可选快捷键开关编辑器 */}
```

`<EditorScene>` 的 props:`groundSize`(可点击地面边长,默认 100)、
`y`(地面高度,默认 0)、`snap`(**覆盖项**:传入时优先于 store 里的
可调 `snap`;不传则跟随面板的「吸附」输入,初始 0.5,0 关闭吸附)。

## 交互

- **放置模式**:点击地面,在命中点新建当前 `placingKind` 的实体(自动吸附网格)。
- **选择模式**:点击占位网格选中(高亮 + 地面光环);按住拖拽即可在 XZ 平面移动;
  点击空地取消选中。整次拖拽只算**一步**撤销。
- 占位形状:NPC = 胶囊体,建筑 = 立方体,装饰 = 圆柱体。
- 面板中可编辑坐标、旋转、缩放、名称、模型路径、碰撞半径,并删除实体。
  **注意:面板里的旋转以「度」显示,store 中的 `rotationY` 存的是弧度。**

## 撤销 / 重做

- 每个变更操作(`addEntity` / `removeEntity` / `updateEntity` / `duplicate` /
  `loadEntities` / `importScene` / `clear`)在执行前把当前实体快照压入撤销栈,
  并清空重做栈;栈上限 **100** 条,超出丢最旧的。
- `updateEntity(id, patch, { transient: true })` 为**瞬时更新**:只改实体、
  不进历史(用于拖拽 / 输入过程中);burst 开始前的快照会被记住,
  `commitTransient()` 把整个 burst 合并成一步撤销。未提交 burst 时执行任何
  非瞬时操作(或 undo/redo)会先自动提交它。
- `undo()` / `redo()` 恢复快照;若选中的实体在恢复后不存在,自动取消选中。
  `canUndo` / `canRedo` 是与栈同步的布尔状态,UI 可直接订阅。
- id 计数器**不**随撤销回退(与「删除后不复用 id」的约定一致),重做/新增
  永远不会产生重复 id。
- 面板工具栏提供「撤销 / 重做」按钮;快捷键(仅编辑器开启时,输入框内不生效):
  `Ctrl/Cmd+Z` 撤销,`Ctrl/Cmd+Shift+Z` 或 `Ctrl/Cmd+Y` 重做。

## 复制

`duplicate(id)` 以相同的 id 计数机制克隆实体(`npc-1` → `npc-4` 之类),
位置偏移 `[+1, 0, +1]`,克隆体自动选中,可撤销。面板工具栏的「复制」按钮
(有选中时可用)和 `Ctrl/Cmd+D` 都会复制当前选中的实体。

## 吸附与网格

- `snap` 现在存放在 store 里(默认 0.5,`setSnap(v)` 修改,0 = 关闭;
  负数/非法值按 0 处理),面板工具栏的「吸附」数字输入(步长 0.1)直接改它。
  `<EditorScene snap={...}>` 传了 prop 时以 prop 为准。
- `showGrid`(默认 true,`setShowGrid` / 面板「网格」勾选框)控制
  `<EditorScene>` 里的吸附网格(`gridHelper`):格距跟随生效的 snap,
  分割数上限 200(极小 snap 不会撑爆渲染),略微抬高 0.02 避免与地面 z-fighting。

## 无头 store

```ts
import { useEditorStore } from '@overworld/editor'

const store = useEditorStore.getState()
store.setEnabled(true)
store.setMode('place')                    // 'select' | 'place'
store.setPlacingKind('building')          // 'npc' | 'building' | 'decoration'
const e = store.addEntity({ position: [4, 0, -2], name: '银行' })  // id 自动生成:building-1
store.updateEntity(e.id, { rotationY: Math.PI / 2 })
store.updateEntity(e.id, { scale: 2 }, { transient: true })  // 瞬时:不进历史
store.commitTransient()                   // 把瞬时 burst 合并成一步撤销
store.duplicate(e.id)                     // 克隆(偏移 [+1, 0, +1],自动选中)
store.undo(); store.redo()                // 撤销 / 重做(见上文)
store.setSnap(1)                          // 吸附步长(0 = 关)
store.setShowGrid(false)                  // 网格显隐
store.select(e.id)                        // 或 select(null) 取消选中
store.removeEntity(e.id)
store.loadEntities(entities)              // 整体替换(重置选中与 id 计数器)
store.clear()                             // 清空
```

id 按类型递增(`npc-1`、`npc-2`、`building-1`…),`loadEntities` 会从已有 id
重新播种计数器,不会产生重复 id。

## 导出 / 导入 JSON

```ts
const json = store.exportScene()   // 纯函数,也可直接用 exportEntities(entities)
store.importScene(json)            // 逆操作(尽力解析,跳过坏条目;根不是对象时抛错)
```

导出形状:

```jsonc
{
  "npcs":      [{ "id", "modelPath", "position", "rotation", "scale?", "name?" }],
  "buildings": [{ "id", "name", "modelPath", "position", "rotation", "scale", "collisionRadius" }],
  "decorations": { "tree": { "radius": 0.8, "instances": [{ "position", "rotation?", "scale?" }] } }
}
```

约定:`rotation` 一律为 `[0, rotationY, 0]`;`modelPath` 缺省导出为 `''`;
建筑 `name` 缺省取 id、`collisionRadius` 缺省为 2;装饰按 `name` 分组
(未命名归入 `"decoration"` 组),组内 `radius` 取该组最后一个显式的
`collisionRadius`(缺省 2)。`导出 → 导入 → 再导出` 结果稳定。

面板的「导出 JSON」按钮会同时复制到剪贴板并下载 `.json` 文件;
「导入 JSON」从文本框解析,结果(含错误)显示在面板内的状态行上。

## 与 @overworld/scene 的关系

按架构分层规则,本包**不 import** `@overworld/scene`。导出的
`npcs` / `buildings` / `decorations` 分别是 `NPCConfig` / `BuildingConfig` /
`DecorationInstance` 的**结构化拷贝**,可以直接喂给 `<SceneShell>`:

```tsx
const scene = store.exportScene()
<SceneShell npcs={scene.npcs} buildings={scene.buildings}
            decorationCollisions={scene.decorations} />
```

## 已知边界(雏形)

- 只支持 XZ 平面拖拽;旋转/缩放需在面板中输入,没有 3D gizmo。
- 占位网格不加载 GLTF 模型,`modelPath` 只是随 JSON 导出的元数据。
- 编辑器状态不持久化 —— 产物就是导出的 JSON,不是存档。
