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
  <EditorScene groundSize={120} y={0} snap={0.5} />
</Canvas>
<EditorPanel />
<EditorToggle hotkey="F2" />   {/* 悬浮按钮 + 可选快捷键开关编辑器 */}
```

`<EditorScene>` 的 props:`groundSize`(可点击地面边长,默认 100)、
`y`(地面高度,默认 0)、`snap`(网格吸附步长,默认 0.5,传 0 关闭吸附)。

## 交互

- **放置模式**:点击地面,在命中点新建当前 `placingKind` 的实体(自动吸附网格)。
- **选择模式**:点击占位网格选中(高亮 + 地面光环);按住拖拽即可在 XZ 平面移动;
  点击空地取消选中。
- 占位形状:NPC = 胶囊体,建筑 = 立方体,装饰 = 圆柱体。
- 面板中可编辑坐标、旋转、缩放、名称、模型路径、碰撞半径,并删除实体。
  **注意:面板里的旋转以「度」显示,store 中的 `rotationY` 存的是弧度。**

## 无头 store

```ts
import { useEditorStore } from '@overworld/editor'

const store = useEditorStore.getState()
store.setEnabled(true)
store.setMode('place')                    // 'select' | 'place'
store.setPlacingKind('building')          // 'npc' | 'building' | 'decoration'
const e = store.addEntity({ position: [4, 0, -2], name: '银行' })  // id 自动生成:building-1
store.updateEntity(e.id, { rotationY: Math.PI / 2 })
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
