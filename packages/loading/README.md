# @overworld/loading

资源加载进度管理:一个纯逻辑的加权任务进度 store,外加两个 React/drei 辅助
Hook(GLTF 预加载、three.js 加载进度桥接)。纯 store 与 React 部分位于不同
模块,store 可在无 React / 无浏览器环境下直接使用与测试。

## 纯 store:`useLoadingStore`

以"任务(task)"为单位跟踪加载:每个阶段或资源组注册一个任务,可设置权重,
store 自动推导整体进度与加载状态。

```ts
import { useLoadingStore } from '@overworld/loading'

const { beginTask, setTaskProgress, completeTask } = useLoadingStore.getState()

beginTask('models', 3)          // 权重 3
beginTask('audio')              // 权重默认 1
setTaskProgress('models', 0.5)  // 任务内进度 0–1
completeTask('audio')

useLoadingStore.getState().progress   // (3*0.5 + 1*1) / 4 = 0.625
useLoadingStore.getState().isLoading  // true(models 未完成)
```

API:

- `beginTask(id, weight?)` — 开始(或重新开始)一个任务;权重决定其在总进度中的占比。
- `setTaskProgress(id, progress)` — 更新任务内进度(自动钳制到 0–1;未知 id 会自动创建)。
- `completeTask(id)` — 标记任务完成(进度置 1)。
- `reset()` — 清空全部任务。
- 派生字段:`progress`(0–1 加权总进度)、`isLoading`(存在未完成任务时为 true)、
  `tasks`(按 id 索引的任务表)。
- `computeProgress(tasks)` — 纯函数,可独立复用聚合逻辑。

已完成的任务在 `reset()` 之前保持注册,保证总进度分母稳定、不会回跳。

## React 辅助(`@react-three/drei`)

```tsx
import { useAssetPreload, useSceneLoadProgress } from '@overworld/loading'

// 预加载 GLTF(封装 useGLTF.preload,每个 URL 仅预加载一次)
useAssetPreload(['/models/player.glb', '/models/portal.glb'])

// 在 Canvas 内桥接 drei useProgress → loadingStore(任务 id 默认 'scene-assets')
function LoadTracker() {
  const { active, progress } = useSceneLoadProgress()
  return null
}
```

`useSceneLoadProgress(taskId?)` 会在 three.js 加载器活跃期间把进度写入对应
任务,加载器空闲后自动 `completeTask`,并返回 drei 的原始进度快照
`{ active, progress, item, loaded, total }`。

## 依赖

peerDependencies:`react`、`zustand`、`@react-three/drei`。
纯 store(`useLoadingStore` / `computeProgress`)只依赖 `zustand`。
