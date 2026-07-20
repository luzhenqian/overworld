import { describe, expect, it } from 'vitest'
import { selectRadarMarkers, computeOffscreenIndicator, type RadarConfig } from '../radar'

const config: RadarConfig = {
  worldBounds: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 },
  buildings: [{ id: 'hq', position: [10, 0, 0] }],
  npcs: [{ id: 'guide', position: [0, 0, 200] }],
  range: 50,
}

describe('selectRadarMarkers', () => {
  it('maps entities to radar space centred on the player', () => {
    const markers = selectRadarMarkers(config, [0, 0, 0], 0)
    const hq = markers.find((m) => m.id === 'hq')!
    expect(hq.kind).toBe('building')
    expect(hq.offScreen).toBe(false)
    expect(Math.abs(hq.x)).toBeLessThanOrEqual(1)
  })

  it('flags entities beyond range as offScreen with an angle', () => {
    const markers = selectRadarMarkers(config, [0, 0, 0], 0)
    const guide = markers.find((m) => m.id === 'guide')!
    expect(guide.offScreen).toBe(true)
    expect(typeof guide.angle).toBe('number')
  })
})

describe('computeOffscreenIndicator', () => {
  it('marks in-range targets as not on the edge', () => {
    const r = computeOffscreenIndicator([10, 0, 0], [0, 0, 0], 0, 50)
    expect(r.edge).toBe(false)
  })
  it('marks out-of-range targets on the edge', () => {
    const r = computeOffscreenIndicator([0, 0, 200], [0, 0, 0], 0, 50)
    expect(r.edge).toBe(true)
  })
})
