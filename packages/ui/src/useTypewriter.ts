import { useEffect, useState } from 'react'
import { advanceReveal } from './typewriterLogic'

/**
 * Reveal `text` one character at a time. Resets when `text` changes.
 * `skip()` reveals everything at once.
 */
export function useTypewriter(
  text: string,
  charsPerSecond = 40,
): { output: string; done: boolean; skip: () => void } {
  const [revealed, setRevealed] = useState(0)

  useEffect(() => {
    setRevealed(0)
    if (!text) return
    const interval = setInterval(
      () => {
        setRevealed((r) => {
          const next = advanceReveal(r, text.length)
          if (next.done) clearInterval(interval)
          return next.revealed
        })
      },
      Math.max(1000 / charsPerSecond, 16),
    )
    return () => clearInterval(interval)
  }, [text, charsPerSecond])

  return {
    output: text.slice(0, revealed),
    done: revealed >= text.length,
    skip: () => setRevealed(text.length),
  }
}
