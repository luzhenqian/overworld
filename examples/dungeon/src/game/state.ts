import { create } from 'zustand'

/**
 * 游戏专属状态(血量 / 金币 / 宝箱 / 计时)。演示"玩法系统住在游戏里,
 * 不住在框架里":任务/对话引擎只能通过注册的 effect/condition 碰到它。
 */
export interface DungeonGameState {
  hearts: number
  maxHearts: number
  gold: number
  dead: boolean
  chestOpened: boolean
  /** 本局开始的时间戳(ms)。 */
  startedAt: number
  /** 通关耗时(ms);未通关为 null。 */
  finishedMs: number | null
  damage: (amount: number) => void
  addGold: (amount: number) => void
  openChest: () => void
  finish: () => void
}

export const useGameStore = create<DungeonGameState>((set, get) => ({
  hearts: 3,
  maxHearts: 3,
  gold: 0,
  dead: false,
  chestOpened: false,
  startedAt: Date.now(),
  finishedMs: null,

  damage: (amount) =>
    set((s) => {
      if (s.dead || s.finishedMs !== null) return s
      const hearts = Math.max(0, s.hearts - amount)
      return { hearts, dead: hearts === 0 }
    }),

  addGold: (amount) => set((s) => ({ gold: s.gold + amount })),

  openChest: () => set({ chestOpened: true }),

  finish: () => {
    if (get().finishedMs !== null) return
    set((s) => ({ finishedMs: Date.now() - s.startedAt }))
  },
}))
