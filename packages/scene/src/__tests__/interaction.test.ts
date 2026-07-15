import { beforeEach, describe, expect, it, vi } from 'vitest'
import { gameEvents } from '@overworld/core'
import { useSceneStore } from '../sceneStore'
import { interact } from '../interaction'

describe('interact()', () => {
  beforeEach(() => {
    useSceneStore.setState({ currentScene: null, nearbyNpcId: null, nearbyBuildingId: null })
    gameEvents.clear('interact')
  })

  it('emits interact for the nearby NPC', () => {
    const listener = vi.fn()
    gameEvents.on('interact', listener)
    useSceneStore.getState().setNearbyNpc('npc-1')

    expect(interact()).toBe(true)
    expect(listener).toHaveBeenCalledWith({ kind: 'npc', id: 'npc-1' })
  })

  it('falls back to the nearby building when no NPC is nearby', () => {
    const listener = vi.fn()
    gameEvents.on('interact', listener)
    useSceneStore.getState().setNearbyBuilding('bank')

    expect(interact()).toBe(true)
    expect(listener).toHaveBeenCalledWith({ kind: 'building', id: 'bank' })
  })

  it('prefers the NPC when both are nearby', () => {
    const listener = vi.fn()
    gameEvents.on('interact', listener)
    useSceneStore.getState().setNearbyNpc('npc-1')
    useSceneStore.getState().setNearbyBuilding('bank')

    interact()
    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledWith({ kind: 'npc', id: 'npc-1' })
  })

  it('returns false and emits nothing when nothing is nearby', () => {
    const listener = vi.fn()
    gameEvents.on('interact', listener)

    expect(interact()).toBe(false)
    expect(listener).not.toHaveBeenCalled()
  })
})
