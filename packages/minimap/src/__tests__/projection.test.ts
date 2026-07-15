import { describe, expect, it } from 'vitest'
import { projectionScale, projectToCanvas, type ProjectionConfig } from '../projection'

const square: ProjectionConfig = {
  worldBounds: { minX: -50, maxX: 50, minZ: -50, maxZ: 50 },
  size: 200,
}

describe('projectionScale', () => {
  it('fits the largest world dimension to the canvas', () => {
    expect(projectionScale(square)).toBe(2)
    expect(
      projectionScale({ worldBounds: { minX: 0, maxX: 400, minZ: 0, maxZ: 100 }, size: 100 })
    ).toBe(0.25)
  })

  it('returns 0 for degenerate bounds', () => {
    expect(
      projectionScale({ worldBounds: { minX: 5, maxX: 5, minZ: 5, maxZ: 5 }, size: 100 })
    ).toBe(0)
  })
})

describe('projectToCanvas', () => {
  it('maps corners of a square world to canvas corners', () => {
    expect(projectToCanvas(-50, -50, square)).toEqual([0, 0])
    expect(projectToCanvas(50, 50, square)).toEqual([200, 200])
    expect(projectToCanvas(50, -50, square)).toEqual([200, 0])
    expect(projectToCanvas(-50, 50, square)).toEqual([0, 200])
  })

  it('maps the world center to the canvas center', () => {
    expect(projectToCanvas(0, 0, square)).toEqual([100, 100])
    const offCenter: ProjectionConfig = {
      worldBounds: { minX: 10, maxX: 30, minZ: -40, maxZ: 0 },
      size: 160,
    }
    expect(projectToCanvas(20, -20, offCenter)).toEqual([80, 80])
  })

  it('preserves aspect ratio by centering the smaller dimension (letterboxing)', () => {
    // World is 200 wide but only 100 deep: scale 0.5, Z is centered.
    const wide: ProjectionConfig = {
      worldBounds: { minX: 0, maxX: 200, minZ: 0, maxZ: 100 },
      size: 100,
    }
    expect(projectToCanvas(0, 0, wide)).toEqual([0, 25])
    expect(projectToCanvas(200, 100, wide)).toEqual([100, 75])
    expect(projectToCanvas(100, 50, wide)).toEqual([50, 50])

    // Deeper than wide: X is centered instead.
    const deep: ProjectionConfig = {
      worldBounds: { minX: 0, maxX: 100, minZ: 0, maxZ: 200 },
      size: 100,
    }
    expect(projectToCanvas(0, 0, deep)).toEqual([25, 0])
    expect(projectToCanvas(100, 200, deep)).toEqual([75, 100])
  })

  it('clamps out-of-bounds positions to the canvas edges', () => {
    expect(projectToCanvas(-999, 0, square)).toEqual([0, 100])
    expect(projectToCanvas(999, 999, square)).toEqual([200, 200])
    expect(projectToCanvas(0, -999, square)).toEqual([100, 0])
  })

  it('projects everything to the center for degenerate bounds', () => {
    const point: ProjectionConfig = {
      worldBounds: { minX: 5, maxX: 5, minZ: 5, maxZ: 5 },
      size: 100,
    }
    expect(projectToCanvas(123, -456, point)).toEqual([50, 50])
  })
})
