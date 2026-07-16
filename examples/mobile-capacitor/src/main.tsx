// 先注册插件的 JS 侧(registerPlugin 会挂到 window.Capacitor.Plugins),
// 平台桥全部走动态探测:App → pause/resume/backButton,Haptics → vibrate
import '@capacitor/app'
import '@capacitor/haptics'
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { platform } from './game/platform'

/**
 * 状态栏配置(动态探测 @capacitor/status-bar):
 * 让 WebView 铺到状态栏底下(overlay),配合 index.html 的 viewport-fit=cover
 * 与 HUD 的 env(safe-area-inset-*) padding,3D 画面全面屏、UI 避开系统栏。
 * 浏览器直开 / 插件缺失时静默跳过 —— 壳 SDK 只存在于模板,不进框架包。
 */
async function configureStatusBar() {
  if (platform !== 'capacitor') return
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar')
    await StatusBar.setOverlaysWebView({ overlay: true })
    await StatusBar.setStyle({ style: Style.Dark })
  } catch {
    // 插件不可用(web 环境或未安装),保持默认状态栏
  }
}

void configureStatusBar()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
