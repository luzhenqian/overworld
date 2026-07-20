import { useEffect, useState } from 'react'
import { inputLock } from '@overworld-engine/core'

/** Reactive input-lock state for HUD (e.g. dim controls while a modal is open). */
export function useInputLocked(): boolean {
  const [locked, setLocked] = useState(inputLock.isLocked())
  useEffect(() => inputLock.subscribe((l) => setLocked(l)), [])
  return locked
}
