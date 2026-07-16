import { beforeEach, describe, expect, it, vi } from 'vitest'
import { gameEvents } from '@overworld-engine/core'
import { useSceneStore } from '../sceneStore'

describe('sceneStore', () => {
  beforeEach(() => {
    useSceneStore.setState({ currentScene: null, nearbyNpcId: null, nearbyBuildingId: null })
    gameEvents.clear('scene:changed')
  })

  it('starts with no scene and no nearby entities', () => {
    const state = useSceneStore.getState()
    expect(state.currentScene).toBeNull()
    expect(state.nearbyNpcId).toBeNull()
    expect(state.nearbyBuildingId).toBeNull()
  })

  it('setScene updates currentScene and emits scene:changed with from/to', () => {
    const listener = vi.fn()
    gameEvents.on('scene:changed', listener)

    useSceneStore.getState().setScene('hub')
    expect(useSceneStore.getState().currentScene).toBe('hub')
    expect(listener).toHaveBeenCalledWith({ from: null, to: 'hub' })

    useSceneStore.getState().setScene('downtown')
    expect(useSceneStore.getState().currentScene).toBe('downtown')
    expect(listener).toHaveBeenCalledWith({ from: 'hub', to: 'downtown' })
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('setScene is a no-op when the scene is already active', () => {
    const listener = vi.fn()
    useSceneStore.getState().setScene('hub')
    gameEvents.on('scene:changed', listener)

    useSceneStore.getState().setScene('hub')
    expect(listener).not.toHaveBeenCalled()
  })

  it('setScene clears nearby entities', () => {
    const state = useSceneStore.getState()
    state.setNearbyNpc('npc-1')
    state.setNearbyBuilding('bank')
    state.setScene('hub')

    expect(useSceneStore.getState().nearbyNpcId).toBeNull()
    expect(useSceneStore.getState().nearbyBuildingId).toBeNull()
  })

  it('tracks nearby NPC and building independently', () => {
    const state = useSceneStore.getState()
    state.setNearbyNpc('npc-1')
    expect(useSceneStore.getState().nearbyNpcId).toBe('npc-1')
    expect(useSceneStore.getState().nearbyBuildingId).toBeNull()

    state.setNearbyBuilding('bank')
    expect(useSceneStore.getState().nearbyBuildingId).toBe('bank')

    state.setNearbyNpc(null)
    expect(useSceneStore.getState().nearbyNpcId).toBeNull()
    expect(useSceneStore.getState().nearbyBuildingId).toBe('bank')
  })
})
