import { describe, expect, it } from 'vitest'
import {
  selectRadarMarkers,
  computeOffscreenIndicator,
  inferHeading,
  createHeadingTracker,
  type RadarConfig,
} from '../radar'

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

describe('inferHeading', () => {
  it('points along +x movement (atan2(dx,dz) convention)', () => {
    // moving +x with no z → heading = atan2(1,0) = PI/2
    expect(inferHeading({ x: 0, z: 0 }, { x: 1, z: 0 }, 0)).toBeCloseTo(Math.PI / 2)
  })
  it('points along +z movement', () => {
    expect(inferHeading({ x: 0, z: 0 }, { x: 0, z: 1 }, 0)).toBeCloseTo(0)
  })
  it('retains the last heading when movement is within the dead zone', () => {
    expect(inferHeading({ x: 0, z: 0 }, { x: 0.0001, z: 0 }, 1.23, 0.01)).toBe(1.23)
  })
})

describe('createHeadingTracker', () => {
  it('holds heading while stationary, updates when it moves', () => {
    const t = createHeadingTracker()
    t.update({ x: 0, z: 0 })
    expect(t.update({ x: 0, z: 5 })).toBeCloseTo(0)
    expect(t.heading()).toBeCloseTo(0)
  })
})

describe('selectRadarMarkers accepts config-shaped entities', () => {
  it('takes objects with id/position (and optional kind/name) — BuildingConfig/NPCConfig shape', () => {
    const markers = selectRadarMarkers(
      {
        worldBounds: { minX: -50, maxX: 50, minZ: -50, maxZ: 50 },
        npcs: [{ id: 'guide', position: [0, 0, 5], name: 'Guide', kind: 'npc' } as any],
      },
      [0, 0, 0],
      0,
    )
    expect(markers[0]!.id).toBe('guide')
  })
})
