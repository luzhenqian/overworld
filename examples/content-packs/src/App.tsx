import { useEffect, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { useStore } from 'zustand'
import { useShallow } from 'zustand/react/shallow'
import type { ApplyContentPackResult } from '@overworld-engine/content'
import { formatReport } from '@overworld-engine/devtools'
import {
  achievements,
  applyInvalid,
  applyV2,
  baseApply,
  dialogue,
  inventory,
  quests,
  tracker,
} from './game/engines'
import { V2_NEW_DIALOGUE_ID, V2_NEW_QUEST_ID } from './game/packs'

/**
 * 内容包 + 存档迁移工具集(v1.5)旗舰示例。
 *
 * 启动时以 applyContentPack 应用基础包 town@1;点「热更新 v2」从 /packs/v2.json
 * 拉取 town@2 并校验后注册 —— 新任务(丰收节委托)与新对话(商人)实时出现,
 * 进行中的任务进度不丢。点「应用非法内容」演示校验门禁拒绝坏数据、引擎不变。
 *
 * window.__cp 暴露引擎与操作句柄,供 e2e 无头断言。
 */

// 最近一次 applyContentPack 结果 —— window.__cp.lastApply 通过 getter 读取。
const lastApplyRef: { current: ApplyContentPackResult | null } = { current: baseApply }

declare global {
  interface Window {
    __cp?: {
      quests: typeof quests
      dialogue: typeof dialogue
      inventory: typeof inventory
      achievements: typeof achievements
      tracker: typeof tracker
      applyV2: () => Promise<ApplyContentPackResult>
      applyInvalid: () => ApplyContentPackResult
      lastApply: ApplyContentPackResult | null
    }
  }
}

/** 一个漂浮方块代表一个已注册任务(新任务出现即多一个方块)。 */
function QuestBlocks({ ids }: { ids: string[] }) {
  return (
    <>
      {ids.map((id, i) => (
        <mesh key={id} position={[(i - (ids.length - 1) / 2) * 2.2, 1.2, 0]} castShadow>
          <boxGeometry args={[1.2, 1.2, 1.2]} />
          <meshStandardMaterial color={id === V2_NEW_QUEST_ID ? '#f59e0b' : '#38bdf8'} />
        </mesh>
      ))}
    </>
  )
}

export default function App() {
  const questIds = useStore(quests.store, useShallow((s) => Object.keys(s.definitions)))
  const dialogueIds = useStore(dialogue.store, useShallow((s) => Object.keys(s.dialogues)))
  const [report, setReport] = useState<string>(baseApply.report.issues.length ? formatReport(baseApply.report) : '基础包 town@1 已应用')
  const [status, setStatus] = useState<{ ok: boolean; text: string }>({
    ok: baseApply.ok,
    text: baseApply.ok ? `基础包 town@1 已应用(${baseApply.applied.join(', ')})` : '基础包应用失败',
  })

  const doApplyV2 = async () => {
    const result = await applyV2()
    lastApplyRef.current = result
    setReport(formatReport(result.report))
    setStatus({
      ok: result.ok,
      text: result.ok
        ? `已热更到 town@2:新增任务「${V2_NEW_QUEST_ID}」+ 对话「${V2_NEW_DIALOGUE_ID}」`
        : `热更被拒绝:${result.report.errors[0]?.message ?? '校验失败'}`,
    })
    return result
  }

  const doApplyInvalid = () => {
    const result = applyInvalid()
    lastApplyRef.current = result
    setReport(formatReport(result.report))
    setStatus({
      ok: result.ok,
      text: result.ok
        ? '非法包意外通过(不应发生)'
        : `校验拒绝非法包:${result.report.errors.length} 个错误,引擎保持不变`,
    })
    return result
  }

  useEffect(() => {
    window.__cp = {
      quests,
      dialogue,
      inventory,
      achievements,
      tracker,
      applyV2: doApplyV2,
      applyInvalid: doApplyInvalid,
      get lastApply() {
        return lastApplyRef.current
      },
    }
    return () => {
      delete window.__cp
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <Canvas shadows camera={{ position: [0, 6, 12], fov: 50 }}>
        <color attach="background" args={['#0b0e1a']} />
        <ambientLight intensity={0.7} />
        <directionalLight position={[8, 14, 6]} intensity={1.1} castShadow />
        {/* 地面 */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
          <planeGeometry args={[60, 60]} />
          <meshStandardMaterial color="#111827" />
        </mesh>
        {/* 村长(回退胶囊)*/}
        <mesh position={[0, 1, -4]} castShadow>
          <capsuleGeometry args={[0.5, 1, 8, 16]} />
          <meshStandardMaterial color="#a78bfa" />
        </mesh>
        {/* 每个已注册任务一个方块 */}
        <QuestBlocks ids={questIds} />
      </Canvas>

      <div style={panelStyle}>
        <div style={{ fontWeight: 600, fontSize: 15 }}>内容包热更 · Content Packs</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button data-testid="apply-v2" style={buttonStyle} onClick={() => void doApplyV2()}>
            热更新 v2
          </button>
          <button
            data-testid="apply-invalid"
            style={{ ...buttonStyle, background: '#7f1d1d' }}
            onClick={() => doApplyInvalid()}
          >
            应用非法内容
          </button>
        </div>
        <div data-testid="status" style={{ fontSize: 12, color: status.ok ? '#4ade80' : '#f87171' }}>
          {status.ok ? '✓ ' : '✗ '}
          {status.text}
        </div>
        <div style={{ fontSize: 12, color: '#cbd5e1' }}>
          已注册任务({questIds.length}):{questIds.join(', ') || '—'}
          <br />
          已注册对话({dialogueIds.length}):{dialogueIds.join(', ') || '—'}
        </div>
        <pre style={reportStyle}>{report}</pre>
      </div>
    </div>
  )
}

const panelStyle: React.CSSProperties = {
  position: 'fixed',
  top: 16,
  left: 16,
  zIndex: 10,
  width: 360,
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

const reportStyle: React.CSSProperties = {
  margin: 0,
  maxHeight: 160,
  overflow: 'auto',
  padding: 8,
  borderRadius: 6,
  background: '#020617',
  color: '#cbd5e1',
  fontSize: 11,
  whiteSpace: 'pre-wrap',
}
