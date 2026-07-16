import React from 'react'
import ReactDOM from 'react-dom/client'
import { createSaveSlots, gameEvents, type EnumerableStorage } from '@overworld-engine/core'
import type { TelegramBridge } from '@overworld-engine/platform'
import { bridge, platform } from './game/platform'
import { setSaveStorage } from './game/save-storage'

/**
 * 云端/文件存档是异步写回的(setItem 先更内存镜像,再串行队列落云端)。
 * FlushableStorage(createTelegramCloudStorage / createTauriFileStorage 返回)
 * 带 flush():等待写回队列排空。切后台前 await flush() 才能保证存档已到云端。
 * localStorage 兜底没有 flush(),这里做特性探测,返回统一的 Promise。
 */
function flushSaveStorage(storage: EnumerableStorage): Promise<void> {
  const maybe = storage as Partial<{ flush: () => Promise<void> }>
  return typeof maybe.flush === 'function' ? maybe.flush() : Promise.resolve()
}

// ---- Telegram 主题 → HUD CSS 变量 -----------------------------------------
// themeParams 优先走桥的 getTheme()(telegramBridge 暴露),
// 桥未暴露时回退到 window.Telegram.WebApp.themeParams;浏览器直开时两者皆无,
// HUD 使用 CSS 变量的回退值。

/** #rrggbb → 带透明度的面板底色(保持 HUD 的半透明质感) */
function toPanelBackground(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!m || !m[1]) return hex
  const n = parseInt(m[1], 16)
  return `rgba(${(n >> 16) & 0xff}, ${(n >> 8) & 0xff}, ${n & 0xff}, 0.85)`
}

function applyTelegramTheme() {
  const theme: Record<string, string | undefined> | undefined =
    'getTheme' in bridge
      ? (bridge as TelegramBridge).getTheme()
      : window.Telegram?.WebApp?.themeParams
  if (!theme || Object.keys(theme).length === 0) return
  const root = document.documentElement.style
  const bg = theme['secondary_bg_color'] ?? theme['bg_color']
  if (bg) root.setProperty('--hud-panel-bg', toPanelBackground(bg))
  if (theme['hint_color']) root.setProperty('--hud-panel-border', theme['hint_color'])
  if (theme['text_color']) root.setProperty('--hud-text', theme['text_color'])
  const accentColor = theme['accent_text_color'] ?? theme['button_color']
  if (accentColor) root.setProperty('--hud-accent', accentColor)
}

/**
 * 解析存档存储:Telegram 端且客户端支持 CloudStorage(Bot API ≥ 6.9)时,
 * 用跨设备云存档(getKeys → getItems 拉起内存镜像,之后同步读写、异步写回);
 * 否则(浏览器直开 / 老客户端 / 初始化失败)回退桥的默认存储(localStorage)。
 */
async function resolveSaveStorage(): Promise<EnumerableStorage> {
  if (platform === 'telegram' && 'cloudStorage' in bridge && window.Telegram?.WebApp?.CloudStorage) {
    try {
      return await (bridge as TelegramBridge).cloudStorage()
    } catch (err) {
      console.error('[telegram-mini-app] CloudStorage 初始化失败,回退 localStorage', err)
    }
  }
  return bridge.storage()
}

/**
 * 异步引导模式:Telegram CloudStorage 是异步创建的(先把云端 key 拉进内存镜像),
 * 而持久化引擎在其模块求值时就需要 storage。因此先 await 出 storage、setSaveStorage,
 * 再动态 import 引擎与 App(engines.ts 求值时 getSaveStorage() 才有值)。
 *
 * 浏览器直开(pnpm dev / pnpm preview)时 platform === 'web',回退到桥的默认
 * 存储(localStorage),同一份代码无需条件编译。
 */
async function bootstrap() {
  const storage = await resolveSaveStorage()
  setSaveStorage(storage)

  // 引擎装配必须在 setSaveStorage() 之后 import(见 save-storage.ts)。
  const { dialogue, quests } = await import('./game/engines')

  // ---- 命名存档槽位(createSaveSlots)-------------------------------------
  // saveSlots 在任意 EnumerableStorage 上工作,这里直接复用上面解析出的 storage
  // (Telegram 端 = CloudStorage 云存档镜像,浏览器直开 = localStorage)。
  // 槽位落在 overworld:slots:<slot> —— 与 quest 引擎的 overworld:quest 同前缀,
  // 因此 saveTo 会把当前任务进度整体拷进槽位,loadFrom 再整体恢复。
  const slots = createSaveSlots({ storage })

  // ---- 切后台前 flush 云端存档 --------------------------------------------
  // Telegram deactivated / 浏览器 visibilitychange 都会经桥的 bindLifecycle
  // 打到总线的 app:paused。CloudStorage 写回是异步的,切后台前 await flush()
  // 才能保证最后一次存档已抵达云端(localStorage 兜底时 flush 为 no-op)。
  gameEvents.on('app:paused', () => {
    void flushSaveStorage(storage)
  })

  applyTelegramTheme()

  // ---- Telegram BackButton 可见性跟随对话状态 ------------------------------
  // telegramBridge 已把 BackButton 点击接到总线的 app:back(engines.ts 里关对话),
  // 且 bindLifecycle 时默认 show()。何时"显示"返回键是游戏的决定:
  // 本模板约定对话打开才显示,所以这里覆盖为跟随对话状态(启动时先隐藏)。
  if (platform === 'telegram' && window.Telegram?.WebApp?.BackButton) {
    const backButton = window.Telegram.WebApp.BackButton
    const syncBackButton = (active: boolean) => {
      if (active) backButton.show()
      else backButton.hide()
    }
    syncBackButton(dialogue.getState().activeDialogue !== null)
    dialogue.store.subscribe((state) => syncBackButton(state.activeDialogue !== null))
  }

  // ---- E2E / 调试句柄 ------------------------------------------------------
  // slots:命名存档槽位;flush():强制排空云端写回队列(切后台/关页前调用)。
  window.__overworld = {
    platform,
    bridge,
    dialogue,
    quests,
    gameEvents,
    slots,
    flush: () => flushSaveStorage(storage),
  }

  const { default: App } = await import('./App')
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
}

void bootstrap()
