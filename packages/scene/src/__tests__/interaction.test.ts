import { beforeEach, describe, expect, it, vi } from 'vitest'
import { gameEvents } from '@overworld-engine/core'
import { useSceneStore } from '../sceneStore'
import { interact } from '../interaction'

describe('interact()', () => {
  beforeEach(() => {
    useSceneStore.setState({ currentScene: null, nearbyNpcId: null, nearbyBuildingId: null })
    gameEvents.clear('entity:interact')
    gameEvents.clear('interact')
  })

  it('emits entity:interact for the nearby NPC', () => {
    const listener = vi.fn()
    gameEvents.on('entity:interact', listener)
    useSceneStore.getState().setNearbyNpc('npc-1')

    expect(interact()).toBe(true)
    expect(listener).toHaveBeenCalledWith({ kind: 'npc', id: 'npc-1' })
  })

  it('dual-emits: entity:interact and the deprecated interact each fire exactly once', () => {
    const modern = vi.fn()
    const legacy = vi.fn()
    gameEvents.on('entity:interact', modern)
    gameEvents.on('interact', legacy)
    useSceneStore.getState().setNearbyNpc('npc-1')

    expect(interact()).toBe(true)
    expect(modern).toHaveBeenCalledTimes(1)
    expect(legacy).toHaveBeenCalledTimes(1)
    expect(modern).toHaveBeenCalledWith({ kind: 'npc', id: 'npc-1' })
    expect(legacy).toHaveBeenCalledWith({ kind: 'npc', id: 'npc-1' })
  })

  it('falls back to the nearby building when no NPC is nearby', () => {
    const modern = vi.fn()
    const legacy = vi.fn()
    gameEvents.on('entity:interact', modern)
    gameEvents.on('interact', legacy)
    useSceneStore.getState().setNearbyBuilding('bank')

    expect(interact()).toBe(true)
    expect(modern).toHaveBeenCalledTimes(1)
    expect(modern).toHaveBeenCalledWith({ kind: 'building', id: 'bank' })
    expect(legacy).toHaveBeenCalledTimes(1)
    expect(legacy).toHaveBeenCalledWith({ kind: 'building', id: 'bank' })
  })

  it('prefers the NPC when both are nearby', () => {
    const listener = vi.fn()
    gameEvents.on('entity:interact', listener)
    useSceneStore.getState().setNearbyNpc('npc-1')
    useSceneStore.getState().setNearbyBuilding('bank')

    interact()
    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledWith({ kind: 'npc', id: 'npc-1' })
  })

  it('returns false and emits nothing when nothing is nearby', () => {
    const modern = vi.fn()
    const legacy = vi.fn()
    gameEvents.on('entity:interact', modern)
    gameEvents.on('interact', legacy)

    expect(interact()).toBe(false)
    expect(modern).not.toHaveBeenCalled()
    expect(legacy).not.toHaveBeenCalled()
  })
})
