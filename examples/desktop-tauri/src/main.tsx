import React from 'react'
import ReactDOM from 'react-dom/client'
import { createTauriFileStorage } from '@overworld-engine/platform'
import { bridge, platform } from './game/platform'
import { setSaveStorage } from './game/save-storage'

/**
 * 异步引导模式:Tauri 的文件存储是异步创建的(动态加载
 * @tauri-apps/plugin-fs、准备应用数据目录),而持久化引擎在其模块求值时
 * 就需要 storage。因此先 await 出 storage,再动态 import 引擎与 App。
 *
 * 浏览器直开(pnpm dev / pnpm preview)时 platform === 'web',
 * 回退到桥的默认存储(localStorage),同一份代码无需条件编译。
 */
async function bootstrap() {
  const storage = platform === 'tauri' ? await createTauriFileStorage() : bridge.storage()
  setSaveStorage(storage)

  const { default: App } = await import('./App')
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
}

void bootstrap()
