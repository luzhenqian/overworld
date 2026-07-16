import { create } from 'zustand'

/**
 * 游戏侧的小系统(玩家金币)。演示玩法系统属于游戏而非框架 ——
 * 任务/对话引擎只能通过注册的效果/条件触达它。
 */
interface GoldState {
  gold: number
  add: (amount: number) => void
  spend: (amount: number) => boolean
}

export const useGoldStore = create<GoldState>((set, get) => ({
  gold: 0,
  add: (amount) => set((s) => ({ gold: s.gold + amount })),
  spend: (amount) => {
    if (get().gold < amount) return false
    set((s) => ({ gold: s.gold - amount }))
    return true
  },
}))
