import { beforeEach, describe, expect, it } from 'vitest'
import { useSceneLoadStore, aggregateSceneProgress } from '../sceneLoadStore'

describe('sceneLoadStore', () => {
  beforeEach(() => useSceneLoadStore.getState().reset())

  it('starts idle at 0', () => {
    const s = useSceneLoadStore.getState()
    expect(s.phase).toBe('idle')
    expect(s.progress).toBe(0)
  })

  it('advances phase to the earliest incomplete phase', () => {
    const st = useSceneLoadStore.getState()
    st.completePhase('module')
    expect(useSceneLoadStore.getState().phase).toBe('geometry')
    st.completePhase('geometry')
    st.completePhase('texture')
    st.completePhase('first-frame')
    expect(useSceneLoadStore.getState().phase).toBe('ready')
  })

  it('aggregate progress weights the four loading phases equally, ready gates on all done', () => {
    expect(aggregateSceneProgress({
      idle: { progress: 1, done: true },
      module: { progress: 1, done: true },
      geometry: { progress: 0.5, done: false },
      texture: { progress: 0, done: false },
      'first-frame': { progress: 0, done: false },
      ready: { progress: 0, done: false },
    })).toBeCloseTo((1 + 0.5 + 0 + 0) / 4)
  })

  it('failZone records an error and retryZone clears it', () => {
    const st = useSceneLoadStore.getState()
    st.failZone('north', 'timeout')
    expect(useSceneLoadStore.getState().errors).toEqual([{ zone: 'north', message: 'timeout' }])
    st.retryZone('north')
    expect(useSceneLoadStore.getState().errors).toEqual([])
  })
})
