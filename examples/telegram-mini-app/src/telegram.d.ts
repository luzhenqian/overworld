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

/** CloudStorage(Bot API ≥ 6.9);模板只用来探测其"是否存在"。 */
interface TelegramWebAppCloudStorage {
  setItem: (
    key: string,
    value: string,
    callback?: (error: string | null, success?: boolean) => void
  ) => void
  getItem: (key: string, callback: (error: string | null, value?: string) => void) => void
  getItems: (
    keys: string[],
    callback: (error: string | null, values?: Record<string, string>) => void
  ) => void
  removeItem: (key: string, callback?: (error: string | null, success?: boolean) => void) => void
  removeItems: (keys: string[], callback?: (error: string | null, success?: boolean) => void) => void
  getKeys: (callback: (error: string | null, keys?: string[]) => void) => void
}

interface TelegramWebApp {
  initData: string
  ready: () => void
  expand: () => void
  close: () => void
  themeParams?: Record<string, string | undefined>
  BackButton?: TelegramWebAppBackButton
  openLink?: (url: string) => void
  /** 云存档(Bot API ≥ 6.9);老客户端 / 浏览器直开时不存在。 */
  CloudStorage?: TelegramWebAppCloudStorage
}

interface Window {
  Telegram?: { WebApp?: TelegramWebApp }
  /** E2E / 调试句柄(main.tsx 挂载) */
  __overworld?: Record<string, unknown>
}
