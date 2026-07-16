import { useEffect, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { EditorPanel, EditorScene, EditorToggle, useEditorStore } from '@overworld-engine/editor'
import type { SceneProjectJson } from '@overworld-engine/editor'
import { SceneFromJson, pickScene, type SceneJson } from '@overworld-engine/scene'
import {
  validateScene,
  validateSceneProject,
  formatReport,
  type ValidationReport,
} from '@overworld-engine/devtools'
import { SEED_SCENE } from './seed'

/**
 * 编辑器多关卡授权往返(v1.5 旗舰示例)。
 *
 * 左侧:在运行中的游戏里用 `@overworld-engine/editor` 摆放 / 编辑实体。
 * 「关卡」面板:新建 / 重命名 / 删除 / 切换命名场景(每个场景一套独立实体)。
 * 「导出并校验」:对当前场景 `exportScene()` 跑 `validateScene`。
 * 「导出项目」:对 `exportProject()`(全部关卡)跑 `validateSceneProject`。
 * 「从 JSON 渲染 / 预览关卡」:把当前场景 / 选中关卡交给 `<SceneFromJson>` 渲染,
 * 证明「编辑 → 导出 → 校验 → 渲染」多关卡闭环成立。
 */

// 渲染画布的场景引用,供 window.__authoring.renderedMeshCount() 统计网格数量。
const renderSceneRef: { current: THREE.Scene | null } = { current: null }
const lastExportRef: { current: SceneJson | null } = { current: null }
const lastReportRef: { current: ValidationReport | null } = { current: null }
const lastProjectReportRef: { current: ValidationReport | null } = { current: null }

declare global {
  interface Window {
    __authoring?: {
      editorStore: typeof useEditorStore
      lastExport: SceneJson | null
      lastReport: ValidationReport | null
      /** 当前多关卡项目快照(每次调用都重新导出)。 */
      exportProject: () => SceneProjectJson
      /** 最近一次「导出项目」的 validateSceneProject 报告。 */
      lastProjectReport: ValidationReport | null
      renderedMeshCount: () => number
    }
  }
}

/** 统计渲染画布场景图中的网格数量(证明真的出图)。 */
function renderedMeshCount(): number {
  const scene = renderSceneRef.current
  if (!scene) return 0
  let count = 0
  scene.traverse((object) => {
    if ((object as THREE.Mesh).isMesh) count += 1
  })
  return count
}

/** 挂在渲染 `<Canvas>` 内,抓取其场景引用供无头统计。 */
function SceneCapture() {
  const scene = useThree((state) => state.scene)
  useEffect(() => {
    renderSceneRef.current = scene
    return () => {
      if (renderSceneRef.current === scene) renderSceneRef.current = null
    }
  }, [scene])
  return null
}

export default function App() {
  const [report, setReport] = useState<ValidationReport | null>(null)
  const [projectReport, setProjectReport] = useState<ValidationReport | null>(null)
  const [rendered, setRendered] = useState<SceneJson | null>(null)
  const [renderVisible, setRenderVisible] = useState(false)
  const [renderLabel, setRenderLabel] = useState('从 JSON 渲染')
  const [previewId, setPreviewId] = useState('')

  // 订阅多关卡状态(scenes / activeSceneId / 当前实体)以驱动关卡面板。
  const scenes = useEditorStore((s) => s.scenes)
  const activeSceneId = useEditorStore((s) => s.activeSceneId)
  const entities = useEditorStore((s) => s.entities)

  // 启动:开启编辑器并把初始场景载入默认关卡(演示 loadSceneConfig 的导入方向)。
  useEffect(() => {
    const store = useEditorStore.getState()
    store.setEnabled(true)
    store.loadSceneConfig(SEED_SCENE)
    window.__authoring = {
      editorStore: useEditorStore,
      get lastExport() {
        return lastExportRef.current
      },
      get lastReport() {
        return lastReportRef.current
      },
      exportProject: () => useEditorStore.getState().exportProject(),
      get lastProjectReport() {
        return lastProjectReportRef.current
      },
      renderedMeshCount,
    }
    return () => {
      delete window.__authoring
    }
  }, [])

  const handleExport = () => {
    // exportScene() 产出当前关卡的 EditorSceneJSON —— 结构等价于 scene 的 SceneJson。
    const json: SceneJson = useEditorStore.getState().exportScene()
    const result = validateScene(json)
    lastExportRef.current = json
    lastReportRef.current = result
    setReport(result)
    if (renderVisible && renderLabel === '从 JSON 渲染') setRendered(json)
    if (!result.ok && renderLabel === '从 JSON 渲染') setRenderVisible(false)
  }

  const handleToggleRender = () => {
    if (renderVisible && renderLabel === '从 JSON 渲染') {
      setRenderVisible(false)
      return
    }
    // 渲染当前关卡:确保已导出一次。
    const json: SceneJson = useEditorStore.getState().exportScene()
    lastExportRef.current = json
    setRendered(json)
    setRenderLabel('从 JSON 渲染')
    setRenderVisible(true)
  }

  const handleExportProject = () => {
    // exportProject() 汇总全部关卡;validateSceneProject 校验项目结构 + 每个内嵌场景。
    const project = useEditorStore.getState().exportProject()
    const result = validateSceneProject(project)
    lastProjectReportRef.current = result
    setProjectReport(result)
  }

  const handlePreviewLevel = () => {
    const project = useEditorStore.getState().exportProject()
    const target = previewId || activeSceneId
    const scene = pickScene(project, target)
    if (!scene) return
    setRendered(scene)
    setRenderLabel(`预览关卡:${target}`)
    setRenderVisible(true)
  }

  const store = useEditorStore.getState()
  const npcCount = rendered?.npcs.length ?? 0
  const buildingCount = rendered?.buildings?.length ?? 0
  const previewValue = previewId || activeSceneId

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {/* 左:可编辑场景(EditorScene 挂在 Canvas 内)*/}
      <Canvas shadows camera={{ position: [0, 16, 20], fov: 50 }}>
        <color attach="background" args={['#0b0e1a']} />
        <ambientLight intensity={0.7} />
        <directionalLight position={[10, 18, 8]} intensity={1.1} castShadow />
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
          <planeGeometry args={[80, 80]} />
          <meshStandardMaterial color="#111827" />
        </mesh>
        {/* 场景编辑层(未启用时不渲染)*/}
        <EditorScene groundSize={80} />
      </Canvas>

      {/* 编辑器 DOM 覆盖层:属性面板 + 悬浮开关(来自 @overworld-engine/editor)*/}
      <EditorPanel />
      <EditorToggle hotkey="F2" />

      {/* 顶部工具条:关卡管理 + 导出/校验/渲染 */}
      <div style={toolbarStyle}>
        <div style={{ fontWeight: 600, fontSize: 15 }}>多关卡授权 · Scene / Level Authoring</div>

        {/* 关卡面板:列出 / 新建 / 重命名 / 删除 / 切换 */}
        <div data-testid="scenes-panel" style={scenesPanelStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 600, fontSize: 12 }}>关卡({scenes.length})</span>
            <button data-testid="add-scene" style={smallButtonStyle} onClick={() => store.newScene()}>
              ＋ 新建关卡
            </button>
          </div>
          {scenes.map((scene) => {
            const active = scene.id === activeSceneId
            const count = active ? entities.length : scene.entities.length
            return (
              <div
                key={scene.id}
                data-testid={`scene-row-${scene.id}`}
                style={{ ...sceneRowStyle, ...(active ? sceneRowActiveStyle : {}) }}
              >
                <input
                  data-testid={`scene-name-${scene.id}`}
                  style={sceneNameStyle}
                  value={scene.name}
                  onChange={(e) => store.renameScene(scene.id, e.target.value)}
                />
                <span style={{ color: '#94a3b8', fontSize: 11 }}>{count}</span>
                <button
                  data-testid={`scene-switch-${scene.id}`}
                  style={smallButtonStyle}
                  disabled={active}
                  onClick={() => store.switchScene(scene.id)}
                >
                  {active ? '当前' : '切换'}
                </button>
                <button
                  data-testid={`scene-delete-${scene.id}`}
                  style={smallDangerStyle}
                  disabled={scenes.length <= 1}
                  onClick={() => store.deleteScene(scene.id)}
                >
                  删除
                </button>
              </div>
            )
          })}
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button data-testid="export-btn" style={buttonStyle} onClick={handleExport}>
            导出并校验
          </button>
          <button data-testid="export-project-btn" style={buttonStyle} onClick={handleExportProject}>
            导出项目
          </button>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            data-testid="render-toggle"
            style={{
              ...buttonStyle,
              background: renderVisible && renderLabel === '从 JSON 渲染' ? '#16a34a' : '#334155',
            }}
            onClick={handleToggleRender}
          >
            {renderVisible && renderLabel === '从 JSON 渲染' ? '关闭渲染' : '从 JSON 渲染'}
          </button>
          <select
            data-testid="level-select"
            style={selectStyle}
            value={previewValue}
            onChange={(e) => setPreviewId(e.target.value)}
          >
            {scenes.map((scene) => (
              <option key={scene.id} value={scene.id}>
                {scene.name}
              </option>
            ))}
          </select>
          <button data-testid="preview-level" style={buttonStyle} onClick={handlePreviewLevel}>
            预览关卡
          </button>
        </div>

        <div data-testid="status" style={statusStyle}>
          {report === null ? (
            <span style={{ color: '#94a3b8' }}>尚未导出。放置 / 移动实体后点「导出并校验」。</span>
          ) : report.ok ? (
            <span style={{ color: '#4ade80' }}>
              ✓ 当前关卡校验通过 · {report.warnings.length} 警告
            </span>
          ) : (
            <span style={{ color: '#f87171' }}>
              ✗ {report.errors.length} 个错误 —— {report.errors[0]?.message}
            </span>
          )}
        </div>

        <div data-testid="project-status" style={statusStyle}>
          {projectReport === null ? (
            <span style={{ color: '#64748b' }}>「导出项目」= 对全部关卡跑 validateSceneProject。</span>
          ) : projectReport.ok ? (
            <span style={{ color: '#4ade80' }}>
              ✓ 项目校验通过 · {scenes.length} 关卡 · {projectReport.warnings.length} 警告
            </span>
          ) : (
            <span style={{ color: '#f87171' }}>
              ✗ 项目 {projectReport.errors.length} 个错误 —— {projectReport.errors[0]?.message}
            </span>
          )}
        </div>

        {(report ?? projectReport) !== null && (
          <pre style={reportStyle}>{formatReport((projectReport ?? report)!)}</pre>
        )}
      </div>

      {/* 渲染面板:把当前关卡 / 选中关卡挂到独立 Canvas,证明 export → validate → render */}
      {renderVisible && rendered && (
        <div data-testid="render-canvas" style={renderPanelStyle}>
          <div style={renderTitleStyle}>
            {renderLabel}(&lt;SceneFromJson&gt;)· {npcCount} NPC / {buildingCount} 建筑
          </div>
          <div style={{ flex: 1, minHeight: 0 }}>
            <Canvas shadows camera={{ position: [0, 10, 16], fov: 50 }}>
              <color attach="background" args={['#0f172a']} />
              <ambientLight intensity={0.7} />
              <directionalLight position={[8, 16, 6]} intensity={1.1} castShadow />
              <SceneFromJson json={rendered} player={null}>
                <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
                  <planeGeometry args={[80, 80]} />
                  <meshStandardMaterial color="#1e293b" />
                </mesh>
              </SceneFromJson>
              <SceneCapture />
            </Canvas>
          </div>
        </div>
      )}
    </div>
  )
}

const toolbarStyle: React.CSSProperties = {
  position: 'fixed',
  top: 16,
  left: 16,
  zIndex: 10001,
  width: 360,
  maxHeight: 'calc(100vh - 32px)',
  overflow: 'auto',
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  padding: 12,
  borderRadius: 10,
  background: 'rgba(15, 23, 42, 0.92)',
  color: '#e2e8f0',
  font: '13px/1.5 system-ui, sans-serif',
  boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
}

const scenesPanelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  padding: 8,
  borderRadius: 8,
  background: 'rgba(2, 6, 23, 0.6)',
}

const sceneRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 6,
  alignItems: 'center',
  padding: '4px 6px',
  borderRadius: 6,
  border: '1px solid transparent',
}

const sceneRowActiveStyle: React.CSSProperties = {
  border: '1px solid #38bdf8',
  background: 'rgba(56, 189, 248, 0.1)',
}

const sceneNameStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  padding: '3px 6px',
  borderRadius: 4,
  border: '1px solid #475569',
  background: '#0f172a',
  color: '#e2e8f0',
  fontSize: 12,
}

const buttonStyle: React.CSSProperties = {
  flex: 1,
  padding: '8px 10px',
  borderRadius: 6,
  border: '1px solid #475569',
  background: '#334155',
  color: '#e2e8f0',
  cursor: 'pointer',
  fontSize: 13,
}

const smallButtonStyle: React.CSSProperties = {
  padding: '3px 8px',
  borderRadius: 4,
  border: '1px solid #475569',
  background: '#334155',
  color: '#e2e8f0',
  cursor: 'pointer',
  fontSize: 11,
}

const smallDangerStyle: React.CSSProperties = {
  ...smallButtonStyle,
  border: '1px solid #7f1d1d',
  background: '#450a0a',
  color: '#fca5a5',
}

const selectStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  padding: '7px 8px',
  borderRadius: 6,
  border: '1px solid #475569',
  background: '#0f172a',
  color: '#e2e8f0',
  fontSize: 12,
}

const statusStyle: React.CSSProperties = {
  fontSize: 12,
  minHeight: 18,
}

const reportStyle: React.CSSProperties = {
  margin: 0,
  maxHeight: 140,
  overflow: 'auto',
  padding: 8,
  borderRadius: 6,
  background: '#020617',
  color: '#cbd5e1',
  fontSize: 11,
  whiteSpace: 'pre-wrap',
}

const renderPanelStyle: React.CSSProperties = {
  position: 'fixed',
  right: 16,
  bottom: 16,
  zIndex: 10001,
  width: 480,
  height: 340,
  display: 'flex',
  flexDirection: 'column',
  borderRadius: 10,
  overflow: 'hidden',
  border: '1px solid #334155',
  boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
}

const renderTitleStyle: React.CSSProperties = {
  padding: '6px 10px',
  background: 'rgba(15, 23, 42, 0.95)',
  color: '#7dd3fc',
  font: '600 12px/1.5 system-ui, sans-serif',
}
