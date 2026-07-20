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
})
