import { describe, expect, it } from 'vitest'
import { selectLodLevel } from '../lod'

const levels = [
  { distance: 0, modelPath: 'hi.glb' },
  { distance: 20, modelPath: 'mid.glb' },
  { distance: 50, modelPath: 'lo.glb' },
]

describe('selectLodLevel', () => {
  it('picks the nearest level below the first threshold', () => {
    expect(selectLodLevel(5, levels, { prevIndex: 0 }).index).toBe(0)
  })
  it('switches to a farther level past its threshold + hysteresis', () => {
    expect(selectLodLevel(23, levels, { prevIndex: 0, hysteresis: 2 }).index).toBe(1)
  })
  it('stays on the current level within the hysteresis band', () => {
    // was at index 1 (mid), distance dips just under 20 but within the 2-unit band
    expect(selectLodLevel(19, levels, { prevIndex: 1, hysteresis: 2 }).index).toBe(1)
  })
  it('caps to deviceCap index for low-tier devices', () => {
    expect(selectLodLevel(5, levels, { prevIndex: 0, deviceCap: 1 }).index).toBe(1)
  })
  it('a multi-level jump past several thresholds never snaps back to a more-detailed level', () => {
    // 51 clears both the 20 and 50 thresholds; must NOT return index 0 (hi.glb)
    expect(selectLodLevel(51, levels, { prevIndex: 0 }).index).toBe(1) // within band of the 1↔2 boundary (50+2)
    expect(selectLodLevel(53, levels, { prevIndex: 0 }).index).toBe(2) // clear of the top band
  })
  it('clamps an out-of-range prevIndex instead of throwing', () => {
    expect(() => selectLodLevel(5, levels, { prevIndex: 99 })).not.toThrow()
    expect(selectLodLevel(5, levels, { prevIndex: 99 }).index).toBe(0)
  })
})
