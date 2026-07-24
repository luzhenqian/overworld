import { describe, expect, it } from 'vitest'
import { createSeededRng } from '../rng'

describe('createSeededRng', () => {
  it('produces values in [0, 1)', () => {
    const rng = createSeededRng(1)
    for (let i = 0; i < 200; i++) {
      const v = rng.next()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('is deterministic: same seed produces the same sequence', () => {
    const a = createSeededRng(42)
    const b = createSeededRng(42)
    const seqA = Array.from({ length: 20 }, () => a.next())
    const seqB = Array.from({ length: 20 }, () => b.next())
    expect(seqA).toEqual(seqB)
  })

  it('different seeds produce different sequences', () => {
    const a = createSeededRng(1)
    const b = createSeededRng(2)
    const seqA = Array.from({ length: 10 }, () => a.next())
    const seqB = Array.from({ length: 10 }, () => b.next())
    expect(seqA).not.toEqual(seqB)
  })

  it('does not repeat the first value across many consecutive calls (basic spread check)', () => {
    const rng = createSeededRng(7)
    const values = new Set(Array.from({ length: 50 }, () => rng.next()))
    // Not a statistical quality test — just confirms it isn't stuck returning
    // the same value or a tiny cycle.
    expect(values.size).toBeGreaterThan(40)
  })
})
