import { describe, expect, it } from 'vitest'
import { pickNpcClipName } from '../animationClips'

const names = ['idle_breath', 'walk_cycle', 'run_cycle']

describe('pickNpcClipName', () => {
  it('maps state -> requested clip via the animationMap', () => {
    const map = { idle: 'idle_breath', walk: 'walk_cycle', run: 'run_cycle' }
    expect(pickNpcClipName(names, map, 'walk')).toBe('walk_cycle')
    expect(pickNpcClipName(names, map, 'run')).toBe('run_cycle')
  })
  it('falls back to idle when walk/run are unmapped', () => {
    const map = { idle: 'idle_breath' }
    expect(pickNpcClipName(names, map, 'walk')).toBe('idle_breath')
    expect(pickNpcClipName(names, map, 'run')).toBe('idle_breath')
  })
  it('uses index-0 idle when no map given', () => {
    expect(pickNpcClipName(names, undefined, 'idle')).toBe('idle_breath')
  })
})
