import { afterEach, describe, expect, it } from 'vitest'
import { inputLock } from '@overworld-engine/core'
import { resolveInputBlocked } from '../inputBlocked'

afterEach(() => inputLock.releaseAll())

describe('resolveInputBlocked', () => {
  it('uses the explicit callback when provided', () => {
    const fn = resolveInputBlocked(() => true)
    expect(fn()).toBe(true)
  })
  it('falls back to inputLock when no callback given', () => {
    const fn = resolveInputBlocked(undefined)
    expect(fn()).toBe(false)
    inputLock.acquire('dialogue')
    expect(fn()).toBe(true)
  })
})
