import type { ReactNode } from 'react'
import { useStore } from 'zustand'
import { Button } from './Button'
import { Panel } from './Panel'
import { useTypewriter } from '../useTypewriter'
import type { DialogueEngineLike } from '../engineTypes'

export interface DialogueBoxProps {
  engine: DialogueEngineLike
  /** Typewriter speed. @default 40 */
  charsPerSecond?: number
  /** Optional portrait slot rendered beside the text. */
  portrait?: (speaker: string | undefined) => ReactNode
}

/**
 * Renders the active dialogue node: typewriter text, speaker tag and choice
 * buttons. First click skips the typewriter; the next advances linear nodes.
 * Renders nothing while no dialogue is active.
 */
export function DialogueBox({ engine, charsPerSecond = 40, portrait }: DialogueBoxProps) {
  const node = useStore(engine.store, (s) => s.currentNode)
  const responses = useStore(engine.store, (s) => s.availableResponses)
  const { output, done, skip } = useTypewriter(node?.text ?? '', charsPerSecond)
  if (!node) return null

  const showChoices = done && responses.length > 0
  const advance = () => {
    if (!done) skip()
    else if (responses.length === 0) engine.advance()
  }

  return (
    <div className="ow-dialogue" data-ow-state={done ? 'done' : 'typing'}>
      <Panel>
        <div className="ow-dialogue-layout" onClick={advance}>
          {portrait && <div className="ow-dialogue-portrait">{portrait(node.speaker)}</div>}
          <div className="ow-dialogue-main">
            {node.speaker && <div className="ow-dialogue-speaker">{node.speaker}</div>}
            <p className="ow-dialogue-text">{output}</p>
            {done && responses.length === 0 && (
              <span className="ow-dialogue-continue" aria-hidden="true">
                ▼
              </span>
            )}
          </div>
        </div>
        {showChoices && (
          <ol className="ow-dialogue-choices">
            {responses.map((r) => (
              <li key={r.id}>
                <Button variant="ghost" onClick={() => engine.choose(r.id)}>
                  {r.text}
                </Button>
              </li>
            ))}
          </ol>
        )}
      </Panel>
    </div>
  )
}
