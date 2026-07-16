/**
 * Telegram WebApp 全局对象的最小类型面 —— 模板只用到这些成员。
 * 完整类型可安装 telegram-web-app 类型包,此处刻意保持零依赖。
 */
interface TelegramWebAppBackButton {
  isVisible: boolean
  show: () => void
  hide: () => void
  onClick: (fn: () => void) => void
  offClick: (fn: () => void) => void
}

interface TelegramWebApp {
  initData: string
  ready: () => void
  expand: () => void
  close: () => void
  themeParams?: Record<string, string | undefined>
  BackButton?: TelegramWebAppBackButton
  openLink?: (url: string) => void
}

interface Window {
  Telegram?: { WebApp?: TelegramWebApp }
  /** E2E / 调试句柄(main.tsx 挂载) */
  __overworld?: Record<string, unknown>
}
