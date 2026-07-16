import { useStore } from 'zustand'
import { useTranslation } from 'react-i18next'
import { useToastStore } from '@overworld/notifications'
import { playerPositionRef, playerRotationRef, useSceneStore } from '@overworld/scene'
import { MiniMap } from '@overworld/minimap'
import { VirtualJoystick } from '@overworld/input'
import type { PresenceSync } from '@overworld/net'
import { achievements, inventory, movementInput, presence, quests } from '../game/engines'
import { useGoldStore } from '../game/gold'
import { ACHIEVEMENTS } from '../game/content'

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

/** 任务追踪器 —— 订阅任务引擎状态渲染进度;title/description 是 i18n key,渲染时翻译 */
function QuestTracker() {
  const { t } = useTranslation()
  const active = useStore(quests, (s) => s.active)
  const definitions = useStore(quests, (s) => s.definitions)
  const entries = Object.values(active)
  if (entries.length === 0) return null

  return (
    <div style={{ ...panelStyle, width: 240 }}>
      <div style={{ fontWeight: 700, marginBottom: 6, color: '#facc15' }}>{t('hud.quests')}</div>
      {entries.map((quest) => {
        const def = definitions[quest.questId]
        if (!def) return null
        return (
          <div key={quest.questId} style={{ marginBottom: 8 }}>
            <div style={{ fontWeight: 600 }}>{def.title ? t(def.title) : def.id}</div>
            {def.objectives.map((obj) => {
              const progress = quest.objectives[obj.id]
              const current = Math.floor(progress?.current ?? 0)
              const done = progress?.completed
              return (
                <div key={obj.id} style={{ opacity: done ? 0.55 : 1, marginTop: 2 }}>
                  {done ? '✅' : '▫️'} {obj.description ? t(obj.description) : obj.id}(
                  {Math.min(current, obj.target)}/
                  {obj.target})
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

/** 其他标签页在线的玩家数(BroadcastChannel presence) */
function PeerCount({ sync }: { sync: PresenceSync }) {
  const peers = useStore(sync.store)
  return <span>👥 {Object.keys(peers).length + 1}</span>
}

function StatusBar() {
  const { i18n } = useTranslation()
  const gold = useGoldStore((s) => s.gold)
  const unlocked = useStore(achievements.store, (s) => s.unlocked)
  return (
    <div style={{ ...panelStyle, display: 'flex', gap: 16, alignItems: 'center' }}>
      <span>💰 {gold}</span>
      <span>
        🏆 {Object.keys(unlocked).length}/{ACHIEVEMENTS.length}
      </span>
      {presence && <PeerCount sync={presence} />}
      <button
        id="lang-toggle"
        onClick={() => void i18n.changeLanguage(i18n.language === 'zh' ? 'en' : 'zh')}
        style={{
          background: '#1c2740',
          color: '#cfe0ff',
          border: '1px solid #35548f',
          borderRadius: 6,
          padding: '2px 8px',
          cursor: 'pointer',
          fontSize: 12,
        }}
      >
        {i18n.language === 'zh' ? 'EN' : '中文'}
      </button>
    </div>
  )
}

function InventoryBar() {
  const { t } = useTranslation()
  const slots = useStore(inventory.store, (s) => s.slots)
  if (slots.length === 0) return null
  return (
    <div style={{ ...panelStyle, display: 'flex', gap: 10 }}>
      {slots.map((slot, i) => {
        const def = inventory.getDefinition(slot.itemId)
        return (
          <span key={i}>
            🔹 {def?.name ? t(def.name) : slot.itemId} ×{slot.quantity}
          </span>
        )
      })}
    </div>
  )
}

/** Toast message 是 { key, params } 结构;title/name 参数本身也是 key,在此翻译 */
function Toasts() {
  const { t } = useTranslation()
  const toasts = useToastStore((s) => s.toasts)
  const render = (m: unknown): string => {
    if (m && typeof m === 'object' && 'key' in m) {
      const { key, params } = m as { key: string; params?: Record<string, unknown> }
      const resolved: Record<string, unknown> = { ...params }
      for (const field of ['title', 'name']) {
        const value = resolved[field]
        if (typeof value === 'string') resolved[field] = t(value)
      }
      return t(key, resolved)
    }
    return String(m)
  }
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
          {render(toast.message)}
        </div>
      ))}
    </div>
  )
}

function InteractHint() {
  const { t } = useTranslation()
  const nearbyNpcId = useSceneStore((s) => s.nearbyNpcId)
  if (!nearbyNpcId) return null
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
      {t('hud.talkHint')}
    </div>
  )
}

export function HUD() {
  const { t } = useTranslation()
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
          worldBounds={{ minX: -20, maxX: 20, minZ: -20, maxZ: 20 }}
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
        {t('hud.controls')}
      </div>
      <Toasts />
      <InteractHint />
    </div>
  )
}
