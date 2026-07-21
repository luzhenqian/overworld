import { describe, expect, it } from 'vitest'
import { resolveClip } from '../animationClips'

const names = ['Run', 'Idle', 'Walk']

describe('resolveClip', () => {
  it('returns the requested name when present', () => {
    expect(resolveClip(names, 'Walk', 1)).toBe('Walk')
  })
  it('falls back to the index convention when requested is missing/undefined', () => {
    expect(resolveClip(names, undefined, 1)).toBe('Idle')
    expect(resolveClip(names, 'Nope', 0)).toBe('Run')
  })
  it('returns undefined when the fallback index is out of range', () => {
    expect(resolveClip(names, undefined, 9)).toBeUndefined()
    expect(resolveClip([], undefined, 0)).toBeUndefined()
  })
})
