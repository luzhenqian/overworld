import { beforeEach, describe, expect, it } from 'vitest'
import { computeProgress, useLoadingStore, type LoadingTask } from '../loadingStore'

const store = () => useLoadingStore.getState()

beforeEach(() => {
  store().reset()
})

function task(id: string, weight: number, progress: number, done = false): LoadingTask {
  return { id, weight, progress, done }
}

describe('computeProgress', () => {
  it('returns 0 with no tasks', () => {
    expect(computeProgress({})).toBe(0)
  })

  it('averages equal-weight tasks', () => {
    expect(
      computeProgress({
        a: task('a', 1, 1, true),
        b: task('b', 1, 0),
      })
    ).toBe(0.5)
  })

  it('weights tasks by their weight', () => {
    expect(
      computeProgress({
        heavy: task('heavy', 3, 0.5),
        light: task('light', 1, 1, true),
      })
    ).toBe((3 * 0.5 + 1) / 4)
  })
})

describe('task lifecycle', () => {
  it('starts idle', () => {
    expect(store().isLoading).toBe(false)
    expect(store().progress).toBe(0)
    expect(store().tasks).toEqual({})
  })

  it('beginTask registers an unfinished task and flips isLoading', () => {
    store().beginTask('models')
    expect(store().isLoading).toBe(true)
    expect(store().progress).toBe(0)
    expect(store().tasks['models']).toEqual({ id: 'models', weight: 1, progress: 0, done: false })
  })

  it('setTaskProgress updates the derived total', () => {
    store().beginTask('models')
    store().setTaskProgress('models', 0.25)
    expect(store().progress).toBe(0.25)
    expect(store().isLoading).toBe(true)
  })

  it('clamps progress to 0..1', () => {
    store().beginTask('a')
    store().setTaskProgress('a', 2)
    expect(store().progress).toBe(1)
    store().setTaskProgress('a', -1)
    expect(store().progress).toBe(0)
  })

  it('completeTask finishes a task; isLoading clears when all are done', () => {
    store().beginTask('a')
    store().beginTask('b')
    store().completeTask('a')
    expect(store().progress).toBe(0.5)
    expect(store().isLoading).toBe(true)

    store().completeTask('b')
    expect(store().progress).toBe(1)
    expect(store().isLoading).toBe(false)
  })

  it('re-beginning a task restarts its progress', () => {
    store().beginTask('a')
    store().completeTask('a')
    expect(store().isLoading).toBe(false)

    store().beginTask('a')
    expect(store().isLoading).toBe(true)
    expect(store().progress).toBe(0)
  })

  it('auto-creates unknown ids on setTaskProgress and completeTask', () => {
    store().setTaskProgress('implicit', 0.5)
    expect(store().tasks['implicit']).toEqual({
      id: 'implicit',
      weight: 1,
      progress: 0.5,
      done: false,
    })

    store().completeTask('other')
    expect(store().tasks['other']?.done).toBe(true)
  })

  it('ignores non-positive weights (falls back to 1)', () => {
    store().beginTask('a', 0)
    store().beginTask('b', -5)
    store().completeTask('a')
    expect(store().progress).toBe(0.5)
  })
})

describe('progress aggregation', () => {
  it('aggregates weighted per-phase progress into the overall total', () => {
    store().beginTask('models', 3)
    store().beginTask('audio', 1)
    store().beginTask('fonts', 1)

    store().setTaskProgress('models', 0.5)
    store().completeTask('audio')
    // (3*0.5 + 1*1 + 1*0) / 5
    expect(store().progress).toBeCloseTo(0.5)

    store().completeTask('models')
    store().completeTask('fonts')
    expect(store().progress).toBe(1)
    expect(store().isLoading).toBe(false)
  })

  it('reset drops all tasks and derived state', () => {
    store().beginTask('a')
    store().setTaskProgress('a', 0.7)
    store().reset()

    expect(store().tasks).toEqual({})
    expect(store().progress).toBe(0)
    expect(store().isLoading).toBe(false)
  })
})
