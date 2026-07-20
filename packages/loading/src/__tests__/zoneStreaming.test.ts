import { describe, expect, it } from 'vitest'
import { orderZonesByDistance, type ZoneManifest } from '../zoneStreaming'

const zone = (id: string, priority: number, cx: number, cz: number): ZoneManifest => ({
  id,
  priority,
  manifest: {},
  bounds: { minX: cx - 5, maxX: cx + 5, minZ: cz - 5, maxZ: cz + 5 },
})

describe('orderZonesByDistance', () => {
  it('orders by distance to player, nearest first', () => {
    const zones = [zone('far', 1, 100, 0), zone('near', 1, 5, 0)]
    expect(orderZonesByDistance(zones, [0, 0, 0]).map((z) => z.id)).toEqual(['near', 'far'])
  })

  it('breaks ties by higher priority first', () => {
    const zones = [zone('lo', 1, 10, 0), zone('hi', 5, 10, 0)]
    expect(orderZonesByDistance(zones, [0, 0, 0]).map((z) => z.id)).toEqual(['hi', 'lo'])
  })

  it('zones without bounds sort last', () => {
    const noBounds: ZoneManifest = { id: 'nb', priority: 9, manifest: {} }
    const zones = [noBounds, zone('near', 1, 5, 0)]
    expect(orderZonesByDistance(zones, [0, 0, 0]).map((z) => z.id)).toEqual(['near', 'nb'])
  })
})
