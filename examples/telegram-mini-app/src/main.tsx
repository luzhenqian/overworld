import React from 'react'
import ReactDOM from 'react-dom/client'
import { gameEvents } from '@overworld-engine/core'
import type { TelegramBridge } from '@overworld-engine/platform'
import App from './App'
import { bridge, platform } from './game/platform'
import { dialogue, quests } from './game/engines'

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

applyTelegramTheme()

// ---- Telegram BackButton 可见性跟随对话状态 --------------------------------
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

// ---- E2E / 调试句柄 --------------------------------------------------------
window.__overworld = { platform, bridge, dialogue, quests, gameEvents }

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
