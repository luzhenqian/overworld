import { useStore } from 'zustand'
import { trackerRows } from '../questSelectors'
import type { QuestEngineLike } from '../engineTypes'

export interface QuestTrackerProps {
  engine: QuestEngineLike
  /** Maximum quests shown. @default 3 */
  max?: number
}

/** Compact HUD objective tracker. Renders nothing when no quests are active. */
export function QuestTracker({ engine, max = 3 }: QuestTrackerProps) {
  const definitions = useStore(engine.store, (s) => s.definitions)
  const active = useStore(engine.store, (s) => s.active)
  const rows = trackerRows(definitions, active, max)
  if (rows.length === 0) return null
  return (
    <ul className="ow-quest-tracker">
      {rows.map((row) => (
        <li key={row.questId} className="ow-quest-tracker-quest">
          <span className="ow-quest-tracker-title">{row.title}</span>
          <ul>
            {row.objectives.map((o) => (
              <li
                key={o.id}
                className="ow-quest-objective"
                data-ow-state={o.completed ? 'completed' : 'active'}
              >
                <span className="ow-quest-objective-text">{o.text}</span>
                <span className="ow-quest-objective-count">
                  {o.current}/{o.target}
                </span>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  )
}
