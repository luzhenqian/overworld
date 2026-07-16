import { useStore } from 'zustand'
import { useToastStore } from '@overworld-engine/notifications'
import { playerPositionRef, playerRotationRef, useSceneStore } from '@overworld-engine/scene'
import { MiniMap } from '@overworld-engine/minimap'
import { VirtualJoystick } from '@overworld-engine/input'
import { dungeonSeed, inventory, layout, movementInput, quests } from '../game/engines'
import { useGameStore } from '../game/state'

const panelStyle: React.CSSProperties = {
  background: 'rgba(6, 9, 18, 0.85)',
  border: '1px solid #2b3652',
  borderRadius: 10,
  padding: '10px 14px',
  color: '#dbe4ff',
  fontSize: 13,
  fontFamily: 'system-ui, sans-serif',
  pointerEvents: 'auto',
}

/** 任务追踪器 —— 订阅任务引擎;title/description 是中文字面量,直接渲染。 */
function QuestTracker() {
  const active = useStore(quests.store, (s) => s.active)
  const definitions = useStore(quests.store, (s) => s.definitions)
  const entries = Object.values(active)
  if (entries.length === 0) return null

  return (
    <div style={{ ...panelStyle, width: 230 }}>
      <div style={{ fontWeight: 700, marginBottom: 6, color: '#facc15' }}>任务</div>
      {entries.map((quest) => {
        const def = definitions[quest.questId]
        if (!def) return null
        return (
          <div key={quest.questId} style={{ marginBottom: 8 }}>
            <div style={{ fontWeight: 600 }}>{def.title ?? def.id}</div>
            {def.objectives.map((obj) => {
              const progress = quest.objectives[obj.id]
              const current = Math.floor(progress?.current ?? 0)
              const done = progress?.completed
              return (
                <div key={obj.id} style={{ opacity: done ? 0.55 : 1, marginTop: 2 }}>
                  {done ? '✅' : '▫️'} {obj.description ?? obj.id}(
                  {Math.min(current, obj.target)}/{obj.target})
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

function StatusBar() {
  const hearts = useGameStore((s) => s.hearts)
  const maxHearts = useGameStore((s) => s.maxHearts)
  const gold = useGameStore((s) => s.gold)
  return (
    <div style={{ ...panelStyle, display: 'flex', gap: 16, alignItems: 'center' }}>
      <span id="hearts" style={{ letterSpacing: 2 }}>
        {'❤️'.repeat(hearts)}
        <span style={{ opacity: 0.25 }}>{'🖤'.repeat(Math.max(0, maxHearts - hearts))}</span>
      </span>
      <span>💰 {gold}</span>
      <span style={{ opacity: 0.7 }}>种子 {dungeonSeed}</span>
    </div>
  )
}

function InventoryBar() {
  const slots = useStore(inventory.store, (s) => s.slots)
  if (slots.length === 0) return null
  return (
    <div style={{ ...panelStyle, display: 'flex', gap: 10 }}>
      {slots.map((slot, i) => {
        const def = inventory.getDefinition(slot.itemId)
        return (
          <span key={i}>
            🔹 {def?.name ?? slot.itemId} ×{slot.quantity}
          </span>
        )
      })}
    </div>
  )
}

/** 无 i18n:toast message 直接是字符串。 */
function Toasts() {
  const toasts = useToastStore((s) => s.toasts)
  const colors: Record<string, string> = {
    info: '#38bdf8',
    success: '#4ade80',
    warning: '#facc15',
    error: '#f87171',
  }
  return (
    <div
      style={{
        position: 'absolute',
        top: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        alignItems: 'center',
      }}
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          style={{
            ...panelStyle,
            borderColor: colors[toast.variant] ?? '#2b3652',
            pointerEvents: 'none',
          }}
        >
          {String(toast.message)}
        </div>
      ))}
    </div>
  )
}

function InteractHint() {
  const nearbyNpcId = useSceneStore((s) => s.nearbyNpcId)
  const nearbyBuildingId = useSceneStore((s) => s.nearbyBuildingId)
  const hint = nearbyNpcId ? '按 E 与幽灵对话' : nearbyBuildingId === 'chest' ? '按 E 打开宝箱' : null
  if (!hint) return null
  return (
    <div
      style={{
        ...panelStyle,
        position: 'absolute',
        bottom: 120,
        left: '50%',
        transform: 'translateX(-50%)',
        pointerEvents: 'none',
      }}
    >
      {hint}
    </div>
  )
}

const overlayStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  background: 'rgba(3, 4, 10, 0.82)',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 16,
  color: '#e8eeff',
  fontFamily: 'system-ui, sans-serif',
  pointerEvents: 'auto',
}

const overlayButtonStyle: React.CSSProperties = {
  background: '#1c2740',
  color: '#cfe0ff',
  border: '1px solid #35548f',
  borderRadius: 8,
  padding: '10px 24px',
  cursor: 'pointer',
  fontSize: 15,
}

/** 0 血:重开覆盖层(重载页面即重开同一颗种子的地牢)。 */
function DeathOverlay() {
  const dead = useGameStore((s) => s.dead)
  if (!dead) return null
  return (
    <div style={overlayStyle} id="death-overlay">
      <div style={{ fontSize: 40 }}>💀</div>
      <div style={{ fontSize: 20, fontWeight: 700 }}>你倒在了地牢里……</div>
      <button style={overlayButtonStyle} onClick={() => window.location.reload()}>
        重新开始
      </button>
    </div>
  )
}

/** 通关覆盖层:显示耗时,可重开或换种子。 */
function VictoryOverlay() {
  const finishedMs = useGameStore((s) => s.finishedMs)
  if (finishedMs === null) return null
  const nextSeed = Math.floor(Math.random() * 100000)
  return (
    <div style={overlayStyle} id="victory-overlay">
      <div style={{ fontSize: 40 }}>🏆</div>
      <div style={{ fontSize: 22, fontWeight: 700 }}>通关!</div>
      <div style={{ opacity: 0.85 }}>
        用时 {(finishedMs / 1000).toFixed(1)} 秒 · 种子 {dungeonSeed}
      </div>
      <div style={{ display: 'flex', gap: 12 }}>
        <button style={overlayButtonStyle} onClick={() => window.location.reload()}>
          再来一局
        </button>
        <button
          style={overlayButtonStyle}
          onClick={() => {
            window.location.search = `?seed=${nextSeed}`
          }}
        >
          换一座地牢
        </button>
      </div>
    </div>
  )
}

export function HUD() {
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', top: 16, left: 16 }}>
        <QuestTracker />
      </div>
      <div
        style={{
          position: 'absolute',
          top: 16,
          right: 16,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: 10,
        }}
      >
        <StatusBar />
        <MiniMap
          worldBounds={layout.bounds}
          size={150}
          playerPosition={playerPositionRef}
          playerRotation={playerRotationRef}
          style={{ pointerEvents: 'none', border: '1px solid #2b3652' }}
        />
      </div>
      <div id="joystick" style={{ pointerEvents: 'auto' }}>
        <VirtualJoystick
          target={movementInput}
          size={110}
          style={{ position: 'absolute', left: 24, bottom: 96 }}
        />
      </div>
      <div style={{ position: 'absolute', bottom: 16, left: 16 }}>
        <InventoryBar />
      </div>
      <div
        style={{
          ...panelStyle,
          position: 'absolute',
          bottom: 16,
          right: 16,
          pointerEvents: 'none',
          opacity: 0.8,
        }}
      >
        WASD 移动 · Shift 跑 · E 交互
      </div>
      <Toasts />
      <InteractHint />
      <DeathOverlay />
      <VictoryOverlay />
    </div>
  )
}
