import { useEffect, useRef, useState } from 'react'
import { useStore } from 'zustand'
import { newlyUnlocked } from '../achievementDiff'
import type { AchievementsEngineLike } from '../engineTypes'

export interface AchievementPopupProps {
  engine: AchievementsEngineLike
  /** How long each unlock card stays, in ms. @default 4000 */
  duration?: number
}

let popupKey = 0

/**
 * Standalone unlock popup stack: watches the achievements store, queues a
 * card per newly-unlocked id, auto-dismisses after `duration` ms. Styled by
 * the toast look but independent of the notifications queue.
 */
export function AchievementPopup({ engine, duration = 4000 }: AchievementPopupProps) {
  const unlocked = useStore(engine.store, (s) => s.unlocked)
  const prevRef = useRef(unlocked)
  const [cards, setCards] = useState<{ id: string; key: number }[]>([])
  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set())

  useEffect(() => {
    const fresh = newlyUnlocked(prevRef.current, unlocked)
    prevRef.current = unlocked
    if (fresh.length === 0) return
    const added = fresh.map((id) => ({ id, key: ++popupKey }))
    setCards((c) => [...c, ...added])
    const keys = added.map((a) => a.key)
    const timer = setTimeout(() => {
      timersRef.current.delete(timer)
      setCards((c) => c.filter((card) => !keys.includes(card.key)))
    }, duration)
    timersRef.current.add(timer)
  }, [unlocked, duration])

  // Cancel all pending dismissal timers on unmount only.
  useEffect(() => {
    const timers = timersRef.current
    return () => {
      timers.forEach((t) => clearTimeout(t))
    }
  }, [])

  if (cards.length === 0) return null
  return (
    <ol className="ow-achievements">
      {cards.map((card) => {
        const def = engine.getDefinition(card.id)
        return (
          <li key={card.key} className="ow-achievement">
            {def?.icon && (
              <span className="ow-achievement-icon" aria-hidden="true">
                {def.icon}
              </span>
            )}
            <div>
              <span className="ow-achievement-kicker">Achievement unlocked</span>
              <span className="ow-achievement-title">{def?.title ?? card.id}</span>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
