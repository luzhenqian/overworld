import { useLayoutEffect, useState } from 'react'
import { useStore } from 'zustand'
import { Button } from './Button'
import { Panel } from './Panel'
import { highlightBox } from '../highlightBox'
import type { TutorialEngineLike } from '../engineTypes'

export interface TutorialOverlayProps {
  engine: TutorialEngineLike
}

/**
 * Tutorial coach overlay: a spotlight ring around the step's `target`
 * element (a DOM selector) plus a card with the step copy and Next/Skip.
 */
export function TutorialOverlay({ engine }: TutorialOverlayProps) {
  const activeTutorialId = useStore(engine.store, (s) => s.activeTutorialId)
  const stepIndex = useStore(engine.store, (s) => s.stepIndex)
  const step = activeTutorialId ? engine.currentStep() : null
  const [box, setBox] = useState<ReturnType<typeof highlightBox> | null>(null)

  useLayoutEffect(() => {
    if (!step?.target) {
      setBox(null)
      return
    }
    const el = document.querySelector(step.target)
    if (!el) {
      setBox(null)
      return
    }
    const r = el.getBoundingClientRect()
    setBox(highlightBox({ x: r.x, y: r.y, width: r.width, height: r.height }))
  }, [activeTutorialId, stepIndex, step?.target])

  if (!step) return null
  return (
    <div className="ow-tutorial">
      {box && (
        <div
          className="ow-tutorial-highlight"
          style={{ left: box.left, top: box.top, width: box.width, height: box.height }}
        />
      )}
      <div className="ow-tutorial-card">
        <Panel>
          {step.content && <p className="ow-tutorial-content">{step.content}</p>}
          <footer className="ow-tutorial-actions">
            <Button variant="ghost" onClick={() => engine.skip()}>
              Skip
            </Button>
            <Button onClick={() => engine.next()}>Next</Button>
          </footer>
        </Panel>
      </div>
    </div>
  )
}
