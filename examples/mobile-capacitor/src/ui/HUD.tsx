import { useStore } from 'zustand'
import { useToastStore } from '@overworld-engine/notifications'
import { interact, useSceneStore } from '@overworld-engine/scene'
import { VirtualJoystick } from '@overworld-engine/input'
import { inventory, movementInput, quests } from '../game/engines'
import { showTouchControls } from '../game/platform'
import { useGoldStore } from '../game/gold'

/**
 * 安全区适配:index.html 用 viewport-fit=cover 让 WebView 铺满刘海/圆角屏,
 * 状态栏在 main.tsx 里配置为悬浮(overlay),所以 HUD 的每个角都要用
 * env(safe-area-inset-*) 让出系统 UI 的位置。
 */
const safeTop = 'calc(16px + env(safe-area-inset-top, 0px))'
const safeLeft = 'calc(16px + env(safe-area-inset-left, 0px))'
const safeRight = 'calc(16px + env(safe-area-inset-right, 0px))'
const safeBottom = 'calc(16px + env(safe-area-inset-bottom, 0px))'

const panelStyle: React.CSSProperties = {
  background: 'rgba(10, 14, 26, 0.82)',
  border: '1px solid #2b3652',
  borderRadius: 10,
  padding: '10px 14px',
  color: '#dbe4ff',
  fontSize: 13,
  fontFamily: 'system-ui, sans-serif',
  pointerEvents: 'auto',
}

/** 任务追踪器 —— 订阅任务引擎状态渲染进度 */
function QuestTracker() {
  const active = useStore(quests.store, (s) => s.active)
  const definitions = useStore(quests.store, (s) => s.definitions)
  const entries = Object.values(active)
  if (entries.length === 0) return null

  return (
    <div style={{ ...panelStyle, width: 240 }}>
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
  const gold = useGoldStore((s) => s.gold)
  return (
    <div style={{ ...panelStyle, display: 'flex', gap: 16, alignItems: 'center' }}>
      <span>💰 {gold}</span>
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
        top: safeTop,
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

/** 触屏交互按钮:靠近 NPC 时出现,点按等价于桌面端的 E 键 */
function InteractButton() {
  const nearbyNpcId = useSceneStore((s) => s.nearbyNpcId)
  if (!nearbyNpcId) return null
  return (
    <button
      id="interact-button"
      onClick={() => interact()}
      style={{
        ...panelStyle,
        position: 'absolute',
        bottom: 'calc(120px + env(safe-area-inset-bottom, 0px))',
        left: '50%',
        transform: 'translateX(-50%)',
        cursor: 'pointer',
        fontSize: 15,
      }}
    >
      💬 交谈
    </button>
  )
}

export function HUD() {
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', top: safeTop, left: safeLeft }}>
        <QuestTracker />
      </div>
      <div style={{ position: 'absolute', top: safeTop, right: safeRight }}>
        <StatusBar />
      </div>
      {/* 手机触屏环境 shouldShowTouchControls() 为 true,虚拟摇杆默认挂载 */}
      {showTouchControls && (
        <div id="joystick" style={{ pointerEvents: 'auto' }}>
          <VirtualJoystick
            target={movementInput}
            size={110}
            style={{
              position: 'absolute',
              left: 'calc(24px + env(safe-area-inset-left, 0px))',
              bottom: 'calc(96px + env(safe-area-inset-bottom, 0px))',
            }}
          />
        </div>
      )}
      <div style={{ position: 'absolute', bottom: safeBottom, left: safeLeft }}>
        <InventoryBar />
      </div>
      <div
        style={{
          ...panelStyle,
          position: 'absolute',
          bottom: safeBottom,
          right: safeRight,
          pointerEvents: 'none',
          opacity: 0.8,
        }}
      >
        摇杆移动 · 靠近 NPC 点击交谈
      </div>
      <Toasts />
      <InteractButton />
    </div>
  )
}
