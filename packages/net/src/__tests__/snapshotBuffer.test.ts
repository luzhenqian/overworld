import { describe, expect, it } from 'vitest'
import { createSnapshotBuffer } from '../snapshotBuffer'

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

/** Buffer with a manually driven clock. */
function makeBuffer(config: { delayMs?: number; maxSnapshots?: number } = {}) {
  let time = 0
  const buffer = createSnapshotBuffer<number>({ ...config, now: () => time })
  return {
    buffer,
    setTime: (t: number) => {
      time = t
    },
    pushAt: (t: number, value: number) => {
      time = t
      buffer.push(value)
    },
  }
}

describe('createSnapshotBuffer', () => {
  it('empty buffer samples to null and has size 0', () => {
    const { buffer } = makeBuffer({ delayMs: 100 })
    expect(buffer.size).toBe(0)
    expect(buffer.sample(lerp)).toBeNull()
  })

  it('a single snapshot is returned as-is regardless of the render time', () => {
    const { buffer, pushAt, setTime } = makeBuffer({ delayMs: 100 })
    pushAt(0, 7)
    // Render time is negative (0 - 100) — still returns the lone snapshot.
    expect(buffer.sample(lerp)).toBe(7)
    setTime(5000)
    expect(buffer.sample(lerp)).toBe(7)
    expect(buffer.size).toBe(1)
  })

  it('interpolates between bracketing snapshots (t = 0.5 at the midpoint)', () => {
    const { buffer, pushAt, setTime } = makeBuffer({ delayMs: 100 })
    pushAt(0, 0)
    pushAt(100, 10)
    setTime(150) // render time = 50 → midway between the snapshots
    expect(buffer.sample(lerp)).toBeCloseTo(5)
    setTime(125) // render time = 25 → t = 0.25
    expect(buffer.sample(lerp)).toBeCloseTo(2.5)
    setTime(200) // render time = 100 → exactly the last snapshot
    expect(buffer.sample(lerp)).toBe(10)
  })

  it('respects the delay window: returns null before the first snapshot', () => {
    const { buffer, pushAt, setTime } = makeBuffer({ delayMs: 100 })
    pushAt(0, 0)
    pushAt(100, 10)
    setTime(99) // render time = -1, still before the first snapshot
    expect(buffer.sample(lerp)).toBeNull()
    setTime(100) // render time = 0 → first snapshot reached
    expect(buffer.sample(lerp)).toBe(0)
  })

  it('uses the default 120 ms delay', () => {
    const { buffer, pushAt, setTime } = makeBuffer()
    pushAt(0, 0)
    pushAt(100, 10)
    setTime(170) // render time = 50 only if delayMs === 120
    expect(buffer.sample(lerp)).toBeCloseTo(5)
  })

  it('clamps to the last snapshot when the sender stalls', () => {
    const { buffer, pushAt, setTime } = makeBuffer({ delayMs: 100 })
    pushAt(0, 0)
    pushAt(100, 10)
    setTime(10_000) // render time is far past the newest snapshot
    expect(buffer.sample(lerp)).toBe(10)
  })

  it('trims to maxSnapshots, dropping the oldest first', () => {
    const { buffer, pushAt, setTime } = makeBuffer({ delayMs: 0, maxSnapshots: 3 })
    for (let i = 0; i < 5; i += 1) pushAt(i * 10, i + 1) // values 1..5 at t = 0..40
    expect(buffer.size).toBe(3) // only t = 20/30/40 (values 3/4/5) survive
    setTime(15) // before the oldest retained snapshot
    expect(buffer.sample(lerp)).toBeNull()
    setTime(25) // between values 3 and 4
    expect(buffer.sample(lerp)).toBeCloseTo(3.5)
    setTime(40)
    expect(buffer.sample(lerp)).toBe(5)
  })

  it('clear() empties the buffer', () => {
    const { buffer, pushAt } = makeBuffer({ delayMs: 100 })
    pushAt(0, 1)
    pushAt(50, 2)
    buffer.clear()
    expect(buffer.size).toBe(0)
    expect(buffer.sample(lerp)).toBeNull()
  })

  it('two snapshots at the same timestamp resolve to the newer one', () => {
    const { buffer, pushAt, setTime } = makeBuffer({ delayMs: 0 })
    pushAt(10, 1)
    pushAt(10, 2)
    setTime(10)
    expect(buffer.sample(lerp)).toBe(2)
  })
})
