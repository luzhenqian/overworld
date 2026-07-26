import { useStore } from 'zustand'
import { useTranslation } from 'react-i18next'
import { useToastStore } from '@overworld-engine/notifications'
import { playerPositionRef, playerRotationRef, useSceneStore } from '@overworld-engine/scene'
import { MiniMap } from '@overworld-engine/minimap'
import { VirtualJoystick } from '@overworld-engine/input'
import type { PresenceSync } from '@overworld-engine/net'
import { achievements, inventory, movementInput, presence, quests } from '../game/engines'
import { useGoldStore } from '../game/gold'
import { ACHIEVEMENTS } from '../game/content'

type IconName =
  | 'achievement'
  | 'check'
  | 'chevron'
  | 'coin'
  | 'compass'
  | 'crystal'
  | 'globe'
  | 'people'
  | 'quest'

function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, React.ReactNode> = {
    achievement: (
      <>
        <path d="M8 4h8v4a4 4 0 0 1-8 0V4Z" />
        <path d="M8 6H5v1a4 4 0 0 0 4 4M16 6h3v1a4 4 0 0 1-4 4M12 12v4M8.5 20h7M10 16h4" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    chevron: <path d="m9 18 6-6-6-6" />,
    coin: (
      <>
        <circle cx="12" cy="12" r="8" />
        <path d="M9.5 9.5c.6-1 1.5-1.5 2.7-1.5 1.6 0 2.8.8 2.8 2 0 3-5.8 1.2-5.8 4 0 1.2 1.2 2 2.8 2 1.3 0 2.3-.5 2.9-1.5M12 6.5v11" />
      </>
    ),
    compass: (
      <>
        <circle cx="12" cy="12" r="8.5" />
        <path d="m15.5 8.5-2 5-5 2 2-5 5-2Z" />
      </>
    ),
    crystal: (
      <>
        <path d="m12 2 6 7-6 13L6 9l6-7Z" />
        <path d="m6 9 6 3 6-3M12 2v10M12 12v10" />
      </>
    ),
    globe: (
      <>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M3.5 12h17M12 3.5c2.2 2.3 3.3 5.1 3.3 8.5S14.2 18.2 12 20.5C9.8 18.2 8.7 15.4 8.7 12S9.8 5.8 12 3.5Z" />
      </>
    ),
    people: (
      <>
        <circle cx="9" cy="9" r="3" />
        <path d="M3.5 19c.6-3 2.4-4.5 5.5-4.5s4.9 1.5 5.5 4.5M15 6.5a3 3 0 0 1 0 5.8M16.5 15c2.2.4 3.5 1.7 4 4" />
      </>
    ),
    quest: (
      <>
        <path d="M7 3.5h10a2 2 0 0 1 2 2V19l-3-2-4 2-4-2-3 2V5.5a2 2 0 0 1 2-2Z" />
        <path d="M9 8h6M9 12h4" />
      </>
    ),
  }

  return (
    <svg
      aria-hidden="true"
      className="hud-icon"
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
    >
      <g stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7">
        {paths[name]}
      </g>
    </svg>
  )
}

/** 任务追踪器 —— 订阅任务引擎状态渲染进度;title/description 是 i18n key,渲染时翻译 */
function QuestTracker() {
  const { t } = useTranslation()
  const active = useStore(quests.store, (s) => s.active)
  const definitions = useStore(quests.store, (s) => s.definitions)
  const entries = Object.values(active)
  if (entries.length === 0) return null

  return (
    <section className="hud-panel quest-tracker" aria-label={t('hud.quests')}>
      <div className="hud-panel-glint" />
      <header className="quest-header">
        <span className="quest-header-icon">
          <Icon name="quest" size={16} />
        </span>
        <span className="hud-kicker">{t('hud.currentObjective')}</span>
        <span className="quest-pulse" />
      </header>
      {entries.map((quest, questIndex) => {
        const def = definitions[quest.questId]
        if (!def) return null
        const objectiveProgress = def.objectives.map((obj) => {
          const progress = quest.objectives[obj.id]
          return Math.min(progress?.current ?? 0, obj.target) / obj.target
        })
        const overall =
          objectiveProgress.length > 0
            ? objectiveProgress.reduce((sum, value) => sum + value, 0) / objectiveProgress.length
            : 0
        return (
          <article className="quest-entry" key={quest.questId}>
            {questIndex > 0 && <div className="quest-divider" />}
            <div className="quest-title-row">
              <h2>{def.title ? t(def.title) : def.id}</h2>
              <span>{Math.round(overall * 100)}%</span>
            </div>
            <div className="quest-progress" aria-hidden="true">
              <span style={{ width: `${overall * 100}%` }} />
            </div>
            <div className="quest-objectives">
              {def.objectives.map((obj) => {
                const progress = quest.objectives[obj.id]
                const current = Math.floor(progress?.current ?? 0)
                const done = progress?.completed
                return (
                  <div className={`quest-objective${done ? ' is-done' : ''}`} key={obj.id}>
                    <span className="objective-marker">
                      {done ? <Icon name="check" size={12} /> : <span />}
                    </span>
                    <span className="objective-copy">
                      {obj.description ? t(obj.description) : obj.id}
                    </span>
                    <span className="objective-count">
                      {Math.min(current, obj.target)}
                      <i>/</i>
                      {obj.target}
                    </span>
                  </div>
                )
              })}
            </div>
          </article>
        )
      })}
    </section>
  )
}

/** 其他标签页在线的玩家数(BroadcastChannel presence) */
function PeerCount({ sync }: { sync: PresenceSync }) {
  const peers = useStore(sync.store)
  return <>{Object.keys(peers).length + 1}</>
}

function StatusBar() {
  const { i18n, t } = useTranslation()
  const gold = useGoldStore((s) => s.gold)
  const unlocked = useStore(achievements.store, (s) => s.unlocked)
  return (
    <div className="status-cluster">
      <div className="status-bar">
        <div className="status-item status-gold" title={t('hud.gold')}>
          <Icon name="coin" size={17} />
          <strong>{gold}</strong>
        </div>
        <span className="status-separator" />
        <div className="status-item" title={t('hud.achievements')}>
          <Icon name="achievement" size={17} />
          <strong>{Object.keys(unlocked).length}</strong>
          <small>/ {ACHIEVEMENTS.length}</small>
        </div>
        {presence && (
          <>
            <span className="status-separator" />
            <div className="status-item" title={t('hud.online')}>
              <Icon name="people" size={17} />
              <strong>
                <PeerCount sync={presence} />
              </strong>
              <span className="online-dot" />
            </div>
          </>
        )}
      </div>
      <button
        aria-label={t('hud.switchLanguage')}
        className="language-toggle"
        id="lang-toggle"
        onClick={() => void i18n.changeLanguage(i18n.language === 'zh' ? 'en' : 'zh')}
        type="button"
      >
        <Icon name="globe" size={16} />
        <span>{i18n.language === 'zh' ? 'EN' : '中文'}</span>
      </button>
    </div>
  )
}

function InventoryBar() {
  const { t } = useTranslation()
  const slots = useStore(inventory.store, (s) => s.slots)
  const displaySlots = Array.from({ length: 4 }, (_, index) => slots[index])

  return (
    <div className="inventory-wrap">
      <span className="inventory-label">{t('hud.inventory')}</span>
      <div className="inventory-bar" aria-label={t('hud.inventory')}>
        {displaySlots.map((slot, index) => {
          const def = slot ? inventory.getDefinition(slot.itemId) : undefined
          const name = slot ? (def?.name ? t(def.name) : slot.itemId) : t('hud.emptySlot')
          return (
            <div
              aria-label={name}
              className={`inventory-slot${slot ? ' has-item' : ''}`}
              key={slot?.itemId ?? `empty-${index}`}
              title={name}
            >
              <span className="slot-key">{index + 1}</span>
              {slot && (
                <>
                  <span className={`item-glyph item-${slot.itemId}`}>
                    {slot.itemId === 'crystal' ? (
                      <Icon name="crystal" size={23} />
                    ) : (
                      <span className="pebble-glyph" />
                    )}
                  </span>
                  <strong className="slot-quantity">{slot.quantity}</strong>
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** Toast message 是 { key, params } 结构;title/name 参数本身也是 key,在此翻译 */
function Toasts() {
  const { t } = useTranslation()
  const toasts = useToastStore((s) => s.toasts)
  const render = (message: unknown): string => {
    if (message && typeof message === 'object' && 'key' in message) {
      const { key, params } = message as { key: string; params?: Record<string, unknown> }
      const resolved: Record<string, unknown> = { ...params }
      for (const field of ['title', 'name']) {
        const value = resolved[field]
        if (typeof value === 'string') resolved[field] = t(value)
      }
      return t(key, resolved)
    }
    return String(message)
  }

  return (
    <div className="toast-stack" aria-live="polite">
      {toasts.map((toast) => (
        <div className={`game-toast toast-${toast.variant}`} key={toast.id}>
          <span className="toast-mark">
            {toast.variant === 'success' ? (
              <Icon name="check" size={14} />
            ) : (
              <Icon name="crystal" size={14} />
            )}
          </span>
          <span>{render(toast.message)}</span>
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
    <div className="interact-hint">
      <span className="keycap">E</span>
      <span>
        <small>{t('hud.interact')}</small>
        <strong>{t('hud.talk')}</strong>
      </span>
      <Icon name="chevron" size={15} />
    </div>
  )
}

function MiniMapFrame() {
  const { t } = useTranslation()
  return (
    <div className="minimap-frame">
      <div className="minimap-heading">
        <span>
          <Icon name="compass" size={14} />
          {t('hud.location')}
        </span>
        <strong>VALLEY · 01</strong>
      </div>
      <div className="minimap-viewport">
        <MiniMap
          playerPosition={playerPositionRef}
          playerRotation={playerRotationRef}
          size={150}
          style={{ pointerEvents: 'none' }}
          worldBounds={{ minX: -20, maxX: 20, minZ: -20, maxZ: 20 }}
        />
        <span className="minimap-corner corner-a" />
        <span className="minimap-corner corner-b" />
        <span className="minimap-corner corner-c" />
        <span className="minimap-corner corner-d" />
      </div>
    </div>
  )
}

export function HUD() {
  const { t } = useTranslation()
  return (
    <div className="game-hud">
      <div className="screen-vignette" />
      <div className="hud-top-left">
        <QuestTracker />
      </div>
      <div className="hud-top-right">
        <StatusBar />
        <MiniMapFrame />
      </div>
      <div className="joystick-shell" id="joystick">
        <VirtualJoystick
          size={112}
          style={{ position: 'absolute', inset: 0 }}
          target={movementInput}
        />
      </div>
      <div className="hud-bottom-center">
        <InventoryBar />
      </div>
      <div className="controls-hint">
        <span><kbd>WASD</kbd> {t('hud.move')}</span>
        <i />
        <span><kbd>SHIFT</kbd> {t('hud.run')}</span>
        <i />
        <span><kbd>E</kbd> {t('hud.action')}</span>
      </div>
      <Toasts />
      <InteractHint />
    </div>
  )
}
