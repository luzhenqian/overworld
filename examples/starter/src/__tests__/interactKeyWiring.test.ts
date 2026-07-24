// @vitest-environment jsdom
import { gameEvents } from '@overworld-engine/core'
import { useInteractKey, useSceneStore } from '@overworld-engine/scene'
import { createEventRecorder, renderHook } from '@overworld-engine/test-kit'
import { afterEach, describe, expect, it } from 'vitest'

afterEach(() => {
  useSceneStore.setState({ currentScene: null, nearbyNpcId: null, nearbyBuildingId: null })
  gameEvents.clear('entity:interact')
  gameEvents.clear('interact')
})

describe('interact key wiring: pressing "e" near an NPC emits entity:interact', () => {
  it('fires entity:interact when useInteractKey is actually mounted', () => {
    useSceneStore.setState({ nearbyNpcId: 'npc-1', nearbyBuildingId: null })
    const recorder = createEventRecorder(gameEvents)

    const { unmount } = renderHook(useInteractKey, 'e', { isInputBlocked: () => false })
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'e' }))

    expect(recorder.events.map((e) => e.event)).toContain('entity:interact')

    unmount()
    recorder.stop()
  })

  it('does not fire when the hook is never mounted — proves the harness catches a missing binding', () => {
    useSceneStore.setState({ nearbyNpcId: 'npc-1', nearbyBuildingId: null })
    const recorder = createEventRecorder(gameEvents)

    // Deliberately not calling renderHook(useInteractKey, ...) here — this
    // mirrors a "forgot to wire the key binding" bug: the key press has
    // nowhere to go.
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'e' }))

    expect(recorder.events.map((e) => e.event)).not.toContain('entity:interact')
    recorder.stop()
  })
})
