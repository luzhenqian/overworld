import type { EnumerableStorage } from '@overworld-engine/core'

/**
 * 存档存储的装配点。Telegram CloudStorage 是异步创建的
 * (getKeys → getItems 先把云端 key 拉进内存镜像),而持久化引擎在模块
 * 求值时就要拿到 storage —— 所以 main.tsx 采用"异步引导"模式:
 * 先 await 出 storage 放进这里,再动态 import 引擎装配(engines.ts)。
 *
 * Telegram 端 → CloudStorage(跨设备云存档);浏览器直开或初始化失败 →
 * 回退桥的默认存储(localStorage)。同一份代码,两种存档介质。
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
