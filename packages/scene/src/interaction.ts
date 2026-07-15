/**
 * Interaction helpers: turn "the player is near something and pressed the
 * interact key" into an `interact` event on the global bus. Dialogue
 * engines, building panels etc. subscribe to that event — nothing imports
 * anything.
 */
import { useEffect, useRef } from 'react'
import { gameEvents } from '@overworld/core'
import { useSceneStore } from './sceneStore'

/**
 * Emit an `interact` event for the entity the player is currently near.
 * NPCs take precedence over buildings. Returns true when an event was
 * emitted, false when nothing is nearby.
 */
export function interact(): boolean {
  const { nearbyNpcId, nearbyBuildingId } = useSceneStore.getState()
  if (nearbyNpcId) {
    gameEvents.emit('interact', { kind: 'npc', id: nearbyNpcId })
    return true
  }
  if (nearbyBuildingId) {
    gameEvents.emit('interact', { kind: 'building', id: nearbyBuildingId })
    return true
  }
  return false
}

export interface UseInteractKeyOptions {
  /**
   * Return true to ignore the key press (e.g. while a dialogue or modal is
   * open). Wire this to your input-priority system — the scene package does
   * not depend on one.
   */
  isInputBlocked?: () => boolean
}

/**
 * Listen for the interact key (default "e") and call {@link interact} when
 * pressed while an NPC or building is nearby.
 */
export function useInteractKey(key = 'e', options: UseInteractKeyOptions = {}): void {
  const optionsRef = useRef(options)
  optionsRef.current = options

  useEffect(() => {
    if (typeof window === 'undefined') return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return
      if (e.key.toLowerCase() !== key.toLowerCase()) return
      if (optionsRef.current.isInputBlocked?.()) return
      interact()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [key])
}
