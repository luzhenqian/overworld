import { useEffect, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { EditorPanel, EditorScene, EditorToggle, useEditorStore } from '@overworld-engine/editor'
import { SceneFromJson, type SceneJson } from '@overworld-engine/scene'
import { validateScene, formatReport, type ValidationReport } from '@overworld-engine/devtools'
import { SEED_SCENE } from './seed'

/**
 * 编辑器 ↔ SceneShell 授权往返(v1.4 旗舰示例)。
 *
 * 左侧:在运行中的游戏里用 `@overworld-engine/editor` 摆放 / 编辑实体。
 * 「导出并校验」:对 `exportScene()` 跑 `validateScene`,展示 ok / 错误。
 * 「从 JSON 渲染」:把上一次导出的 JSON 交给 `<SceneFromJson>` 实时渲染,
 * 证明「编辑 → 导出 → 校验 → 渲染」闭环成立。
 */

// 渲染画布的场景引用,供 window.__authoring.renderedMeshCount() 统计网格数量。
const renderSceneRef: { current: THREE.Scene | null } = { current: null }
const lastExportRef: { current: SceneJson | null } = { current: null }
const lastReportRef: { current: ValidationReport | null } = { current: null }

declare global {
  interface Window {
    __authoring?: {
      editorStore: typeof useEditorStore
      lastExport: SceneJson | null
      lastReport: ValidationReport | null
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
  const [renderMode, setRenderMode] = useState(false)
  const [exported, setExported] = useState<SceneJson | null>(null)

  // 启动:开启编辑器并载入初始场景(演示 loadSceneConfig 的导入方向)。
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
      renderedMeshCount,
    }
    return () => {
      delete window.__authoring
    }
  }, [])

  const handleExport = () => {
    // exportScene() 产出 EditorSceneJSON —— 与 scene 的 SceneJson 结构等价,直接可用。
    const json: SceneJson = useEditorStore.getState().exportScene()
    const result = validateScene(json)
    lastExportRef.current = json
    lastReportRef.current = result
    setExported(json)
    setReport(result)
    // 校验通过前不允许进入渲染模式;失败时退出渲染。
    if (!result.ok) setRenderMode(false)
  }

  const handleToggleRender = () => {
    // 首次进入渲染前若尚未导出,先导出一次。
    if (!renderMode && lastExportRef.current === null) handleExport()
    setRenderMode((on) => !on)
  }

  const npcCount = exported?.npcs.length ?? 0
  const buildingCount = exported?.buildings?.length ?? 0

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

      {/* 顶部工具条:导出并校验 + 从 JSON 渲染 */}
      <div style={toolbarStyle}>
        <div style={{ fontWeight: 600, fontSize: 15 }}>场景授权往返 · Scene Authoring</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button data-testid="export-btn" style={buttonStyle} onClick={handleExport}>
            导出并校验
          </button>
          <button
            data-testid="render-toggle"
            style={{ ...buttonStyle, background: renderMode ? '#16a34a' : '#334155' }}
            onClick={handleToggleRender}
          >
            {renderMode ? '关闭渲染' : '从 JSON 渲染'}
          </button>
        </div>
        <div data-testid="status" style={statusStyle}>
          {report === null ? (
            <span style={{ color: '#94a3b8' }}>尚未导出。放置 / 移动实体后点「导出并校验」。</span>
          ) : report.ok ? (
            <span style={{ color: '#4ade80' }}>
              ✓ 校验通过 · {npcCount} NPC / {buildingCount} 建筑 · {report.warnings.length} 警告
            </span>
          ) : (
            <span style={{ color: '#f87171' }}>
              ✗ {report.errors.length} 个错误 —— {report.errors[0]?.message}
            </span>
          )}
        </div>
        {report !== null && (
          <pre style={reportStyle}>{formatReport(report)}</pre>
        )}
      </div>

      {/* 从 JSON 渲染:把上一次导出挂到独立 Canvas,证明 export → validate → render */}
      {renderMode && exported && (
        <div data-testid="render-canvas" style={renderPanelStyle}>
          <div style={renderTitleStyle}>从 JSON 渲染(&lt;SceneFromJson&gt;)</div>
          <div style={{ flex: 1, minHeight: 0 }}>
            <Canvas shadows camera={{ position: [0, 10, 16], fov: 50 }}>
              <color attach="background" args={['#0f172a']} />
              <ambientLight intensity={0.7} />
              <directionalLight position={[8, 16, 6]} intensity={1.1} castShadow />
              <SceneFromJson json={exported} player={null}>
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
  width: 340,
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
  left: 16,
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
