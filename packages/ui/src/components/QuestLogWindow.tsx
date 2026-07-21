import { useStore } from 'zustand'
import { GameWindow } from './GameWindow'
import { trackerRows } from '../questSelectors'
import type { QuestEngineLike } from '../engineTypes'

export interface QuestLogWindowProps {
  engine: QuestEngineLike
  /** Window registry id. @default 'quest-log' */
  id?: string
}

/** Full quest log window: active quests with progress, then completed ones. */
export function QuestLogWindow({ engine, id = 'quest-log' }: QuestLogWindowProps) {
  const definitions = useStore(engine.store, (s) => s.definitions)
  const active = useStore(engine.store, (s) => s.active)
  const completed = useStore(engine.store, (s) => s.completed)
  const rows = trackerRows(definitions, active)
  return (
    <GameWindow id={id} title="Quests">
      <div className="ow-quest-log">
        <h3 className="ow-quest-log-heading">Active</h3>
        {rows.length === 0 && <p className="ow-quest-log-empty">No active quests.</p>}
        <ul>
          {rows.map((row) => (
            <li key={row.questId} className="ow-quest-log-entry">
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
        <h3 className="ow-quest-log-heading">Completed</h3>
        <ul>
          {completed.map((questId) => (
            <li key={questId} className="ow-quest-log-entry" data-ow-state="completed">
              {definitions[questId]?.title ?? questId}
            </li>
          ))}
        </ul>
      </div>
    </GameWindow>
  )
}
