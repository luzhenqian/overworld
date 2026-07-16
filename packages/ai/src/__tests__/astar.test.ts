import { describe, expect, it } from 'vitest'
import { findPath, hasLineOfSight, nearestWalkableCell, smoothPath } from '../astar'
import { createNavGrid, type NavGridConfig, type Obstacle } from '../grid'

const openGrid = (extra: Partial<NavGridConfig> = {}) =>
  createNavGrid({
    bounds: { minX: 0, maxX: 20, minZ: 0, maxZ: 20 },
    agentRadius: 0,
    ...extra,
  })

const pathLength = (path: [number, number][]): number => {
  let total = 0
  for (let i = 1; i < path.length; i++) {
    total += Math.hypot(path[i]![0] - path[i - 1]![0], path[i]![1] - path[i - 1]![1])
  }
  return total
}

describe('findPath — basics', () => {
  it('finds a straight line on an open grid, preserving exact endpoints', () => {
    const grid = openGrid()
    const path = findPath(grid, [1.5, 1.5], [18.5, 1.5])
    expect(path).not.toBeNull()
    expect(path![0]).toEqual([1.5, 1.5])
    expect(path![path!.length - 1]).toEqual([18.5, 1.5])
    // Smoothed: a clear straight run collapses to two waypoints.
    expect(path!.length).toBe(2)
  })

  it('collapses a clear diagonal to two waypoints after smoothing', () => {
    const grid = openGrid()
    const raw = findPath(grid, [0.5, 0.5], [19.5, 19.5], { smooth: false })!
    const smoothed = findPath(grid, [0.5, 0.5], [19.5, 19.5])!
    expect(raw.length).toBeGreaterThan(2)
    expect(smoothed.length).toBe(2)
    expect(pathLength(smoothed)).toBeLessThanOrEqual(pathLength(raw) + 1e-9)
  })

  it('returns [from, to] when both points share a cell', () => {
    const grid = openGrid()
    expect(findPath(grid, [3.2, 3.2], [3.8, 3.8])).toEqual([
      [3.2, 3.2],
      [3.8, 3.8],
    ])
  })

  it('routes around an obstacle without entering it', () => {
    const obstacle: Obstacle = { x: 10, z: 10, radius: 2 }
    const grid = openGrid({ obstacles: [obstacle], agentRadius: 0.5 })
    const path = findPath(grid, [10.5, 2.5], [10.5, 17.5])!
    expect(path).not.toBeNull()
    expect(pathLength(path)).toBeGreaterThan(15) // longer than the straight line
    // Every leg of the smoothed path stays in walkable cells.
    for (let i = 1; i < path.length; i++) {
      expect(hasLineOfSight(grid, path[i - 1]!, path[i]!)).toBe(true)
    }
  })

  it('returns null when the target is unreachable', () => {
    // Wall across the full width (one obstacle per cell center of row 10)
    // splits the grid in two.
    const wall: Obstacle[] = []
    for (let x = 0; x < 20; x++) wall.push({ x: x + 0.5, z: 10.5, radius: 0.1 })
    const grid = openGrid({ obstacles: wall })
    expect(findPath(grid, [2.5, 2.5], [2.5, 17.5])).toBeNull()
  })
})

describe('findPath — nearest-walkable fallback', () => {
  it('paths to the nearest walkable cell when the target cell is blocked', () => {
    const grid = openGrid({ obstacles: [{ x: 10.5, z: 10.5, radius: 1 }] })
    const path = findPath(grid, [2.5, 10.5], [10.5, 10.5])!
    expect(path).not.toBeNull()
    const end = path[path.length - 1]!
    // The endpoint is a walkable cell center near the obstacle, not inside it.
    expect(grid.isWalkable(...grid.worldToCell(end[0], end[1]))).toBe(true)
    expect(Math.hypot(end[0] - 10.5, end[1] - 10.5)).toBeLessThanOrEqual(2.5)
  })

  it('escapes a blocked start cell (agent inside an inflated obstacle)', () => {
    const grid = openGrid({ obstacles: [{ x: 5.5, z: 5.5, radius: 1 }], agentRadius: 0.5 })
    expect(grid.isWalkable(...grid.worldToCell(5.5, 5.5))).toBe(false)
    const path = findPath(grid, [5.5, 5.5], [15.5, 5.5])!
    expect(path).not.toBeNull()
    expect(path[0]).toEqual([5.5, 5.5]) // first waypoint is still the true position
    expect(path[path.length - 1]).toEqual([15.5, 5.5])
  })

  it('returns null when no walkable cell exists within fallbackRadius', () => {
    const grid = openGrid({ obstacles: [{ x: 10.5, z: 10.5, radius: 6 }] })
    expect(findPath(grid, [1.5, 1.5], [10.5, 10.5], { fallbackRadius: 2 })).toBeNull()
  })
})

describe('findPath — no diagonal corner-cutting', () => {
  it('cannot slip diagonally between two blocked cells', () => {
    // 2x2 grid; cells (1,0) and (0,1) blocked: (0,0) -> (1,1) needs a
    // corner-cut, which is disallowed => unreachable.
    const grid = createNavGrid({
      bounds: { minX: 0, maxX: 2, minZ: 0, maxZ: 2 },
      agentRadius: 0,
      obstacles: [
        { x: 1.5, z: 0.5, radius: 0.1 },
        { x: 0.5, z: 1.5, radius: 0.1 },
      ],
    })
    expect(findPath(grid, [0.5, 0.5], [1.5, 1.5], { fallbackRadius: 0 })).toBeNull()
  })

  it('goes around a single blocked corner cell instead of brushing it', () => {
    // Only (1,0) blocked: the diagonal (0,0)->(1,1) would brush its corner,
    // so the path must pass through (0,1).
    const grid = createNavGrid({
      bounds: { minX: 0, maxX: 2, minZ: 0, maxZ: 2 },
      agentRadius: 0,
      obstacles: [{ x: 1.5, z: 0.5, radius: 0.1 }],
    })
    const path = findPath(grid, [0.5, 0.5], [1.5, 1.5], { smooth: false })!
    expect(path).not.toBeNull()
    const cells = path.map(([x, z]) => grid.worldToCell(x, z))
    expect(cells).toContainEqual([0, 1])
    expect(cells).not.toContainEqual([1, 0])
  })
})

describe('smoothPath', () => {
  it('shortens zig-zag paths and preserves both endpoints', () => {
    const grid = openGrid()
    const zigzag: [number, number][] = [
      [0.5, 0.5],
      [2.5, 3.5],
      [4.5, 0.5],
      [6.5, 3.5],
      [8.5, 0.5],
    ]
    const smoothed = smoothPath(grid, zigzag)
    expect(smoothed[0]).toEqual([0.5, 0.5])
    expect(smoothed[smoothed.length - 1]).toEqual([8.5, 0.5])
    expect(smoothed.length).toBeLessThan(zigzag.length)
    expect(pathLength(smoothed)).toBeLessThan(pathLength(zigzag))
  })

  it('keeps detour waypoints that an obstacle makes necessary', () => {
    const grid = openGrid({ obstacles: [{ x: 5, z: 5, radius: 1.5 }], agentRadius: 0.5 })
    const detour: [number, number][] = [
      [1.5, 5.5],
      [2.5, 8.5],
      [5.5, 9.5],
      [8.5, 8.5],
      [9.5, 5.5],
    ]
    const smoothed = smoothPath(grid, detour)
    expect(smoothed.length).toBeGreaterThan(2) // straight line would cross the obstacle
    for (let i = 1; i < smoothed.length; i++) {
      expect(hasLineOfSight(grid, smoothed[i - 1]!, smoothed[i]!)).toBe(true)
    }
  })

  it('returns short paths unchanged (as copies)', () => {
    const grid = openGrid()
    const short: [number, number][] = [
      [1, 1],
      [2, 2],
    ]
    const smoothed = smoothPath(grid, short)
    expect(smoothed).toEqual(short)
    expect(smoothed[0]).not.toBe(short[0])
  })
})

describe('hasLineOfSight / nearestWalkableCell', () => {
  it('hasLineOfSight detects blocked and clear segments', () => {
    const grid = openGrid({ obstacles: [{ x: 10, z: 10, radius: 2 }] })
    expect(hasLineOfSight(grid, [5, 10], [15, 10])).toBe(false)
    expect(hasLineOfSight(grid, [5, 2], [15, 2])).toBe(true)
    // Leaving the grid is not walkable either.
    expect(hasLineOfSight(grid, [1, 1], [-3, 1])).toBe(false)
  })

  it('nearestWalkableCell returns the cell itself, a close neighbor, or null', () => {
    const grid = openGrid({ obstacles: [{ x: 10.5, z: 10.5, radius: 1.2 }] })
    expect(nearestWalkableCell(grid, 3, 3, 3)).toEqual([3, 3])
    const near = nearestWalkableCell(grid, 10, 10, 3)!
    expect(near).not.toBeNull()
    expect(grid.isWalkable(near[0], near[1])).toBe(true)
    const walled = openGrid({ obstacles: [{ x: 10.5, z: 10.5, radius: 5 }] })
    expect(nearestWalkableCell(walled, 10, 10, 2)).toBeNull()
  })
})
