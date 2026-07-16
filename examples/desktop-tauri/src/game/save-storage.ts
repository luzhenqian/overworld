import type { EnumerableStorage } from '@overworld-engine/core'

/**
 * 存档存储的装配点。Tauri 的文件存储是异步创建的
 * (动态加载 @tauri-apps/plugin-fs 并准备存档目录),而持久化引擎在模块
 * 求值时就要拿到 storage —— 所以 main.tsx 采用"异步引导"模式:
 * 先 await 出 storage 放进这里,再动态 import 引擎装配(engines.ts)。
 */

let storage: EnumerableStorage | null = null

export function setSaveStorage(next: EnumerableStorage): void {
  storage = next
}

export function getSaveStorage(): EnumerableStorage {
  if (!storage) {
    throw new Error('save storage 未初始化:必须先 setSaveStorage() 再 import 引擎模块(见 main.tsx)')
  }
  return storage
}
