import React from 'react'
import ReactDOM from 'react-dom/client'
import { createTauriFileStorage } from '@overworld-engine/platform'
import { createSteamBridge, bridgeSteamAchievements } from '@overworld-engine/adapters-steam'
import { bridge, platform } from './game/platform'
import { setSaveStorage } from './game/save-storage'

/**
 * 异步引导模式:Tauri 的文件存储是异步创建的(动态加载
 * @tauri-apps/plugin-fs、准备应用数据目录),而持久化引擎在其模块求值时
 * 就需要 storage。因此先 await 出 storage,再动态 import 引擎与 App。
 *
 * 浏览器直开(pnpm dev / pnpm preview)时 platform === 'web',
 * 回退到桥的默认存储(localStorage),同一份代码无需条件编译。
 *
 * Steam 接线:createSteamBridge().ready() 在非 Steam 环境(包括浏览器直开、
 * 或 Tauri 但未从 Steam 客户端启动)会静默解析为 false,cloudStorage()
 * 相应恒为 undefined —— 下面用 ?? 显式回退到原有的存档介质,同一份代码
 * 三种环境(浏览器/Tauri/Steam)都能跑。
 */
async function bootstrap() {
  const steam = createSteamBridge()
  await steam.ready()
  bridgeSteamAchievements(steam)

  const fallbackStorage =
    platform === 'tauri' ? await createTauriFileStorage() : bridge.storage()
  const storage = steam.cloudStorage() ?? fallbackStorage
  setSaveStorage(storage)

  steam.setRichPresence('status', 'Exploring')

  const { default: App } = await import('./App')
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
}

void bootstrap()
