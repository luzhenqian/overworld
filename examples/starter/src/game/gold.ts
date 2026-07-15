import { create } from 'zustand'

/**
 * A tiny game-specific system (the player's gold purse). It demonstrates how
 * gameplay systems live in the GAME, not the framework — the quest/dialogue
 * engines reach it only through registered effects/conditions.
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
