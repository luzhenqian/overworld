import { describe, expect, it } from 'vitest'
import { collidersToObstacles, createNavGrid } from '../grid'

describe('createNavGrid — dimensions and coordinates', () => {
  it('derives cols/rows from bounds and cellSize', () => {
    const grid = createNavGrid({ bounds: { minX: 0, maxX: 10, minZ: 0, maxZ: 6 } })
    expect(grid.cols).toBe(10)
    expect(grid.rows).toBe(6)

    const half = createNavGrid({
      bounds: { minX: -2, maxX: 2, minZ: -1, maxZ: 1 },
      cellSize: 0.5,
    })
    expect(half.cols).toBe(8)
    expect(half.rows).toBe(4)
  })

  it('worldToCell / cellToWorld round-trip through cell centers', () => {
    const grid = createNavGrid({
      bounds: { minX: -5, maxX: 5, minZ: -5, maxZ: 5 },
      cellSize: 0.5,
    })
    for (const [cx, cz] of [
      [0, 0],
      [3, 7],
      [grid.cols - 1, grid.rows - 1],
    ] as const) {
      const [wx, wz] = grid.cellToWorld(cx, cz)
      expect(grid.worldToCell(wx, wz)).toEqual([cx, cz])
    }
  })

  it('worldToCell maps world points to the containing cell', () => {
    const grid = createNavGrid({ bounds: { minX: 0, maxX: 10, minZ: 0, maxZ: 10 } })
    expect(grid.worldToCell(0.1, 0.9)).toEqual([0, 0])
    expect(grid.worldToCell(1.0, 0.0)).toEqual([1, 0])
    expect(grid.worldToCell(9.99, 9.99)).toEqual([9, 9])
  })

  it('worldToCell clamps out-of-bounds positions to edge cells', () => {
    const grid = createNavGrid({ bounds: { minX: 0, maxX: 10, minZ: 0, maxZ: 10 } })
    expect(grid.worldToCell(-100, -100)).toEqual([0, 0])
    expect(grid.worldToCell(100, 100)).toEqual([9, 9])
  })

  it('isWalkable is false outside the grid', () => {
    const grid = createNavGrid({ bounds: { minX: 0, maxX: 4, minZ: 0, maxZ: 4 } })
    expect(grid.isWalkable(-1, 0)).toBe(false)
    expect(grid.isWalkable(0, -1)).toBe(false)
    expect(grid.isWalkable(4, 0)).toBe(false)
    expect(grid.isWalkable(0, 4)).toBe(false)
    expect(grid.isWalkable(0, 0)).toBe(true)
  })

  it('rejects invalid configuration', () => {
    expect(() =>
      createNavGrid({ bounds: { minX: 0, maxX: 0, minZ: 0, maxZ: 4 } })
    ).toThrow()
    expect(() =>
      createNavGrid({ bounds: { minX: 0, maxX: 4, minZ: 0, maxZ: 4 }, cellSize: 0 })
    ).toThrow()
  })
})

describe('createNavGrid — obstacle rasterization', () => {
  it('blocks cells whose center lies within radius + agentRadius', () => {
    // Obstacle at (5, 5) radius 1, agentRadius 0.5 => blocking radius 1.5.
    const grid = createNavGrid({
      bounds: { minX: 0, maxX: 10, minZ: 0, maxZ: 10 },
      obstacles: [{ x: 5, z: 5, radius: 1 }],
      agentRadius: 0.5,
    })
    // Cell (4,4) center (4.5,4.5): distance ~0.707 <= 1.5 => blocked.
    expect(grid.isWalkable(4, 4)).toBe(false)
    expect(grid.isWalkable(5, 5)).toBe(false)
    // Cell (3,4) center (3.5,4.5): distance ~1.58 > 1.5 => walkable.
    expect(grid.isWalkable(3, 4)).toBe(true)
    // Cell (3,5) center (3.5,5.5): distance ~1.58 > 1.5 => walkable.
    expect(grid.isWalkable(3, 5)).toBe(true)
  })

  it('agentRadius inflates obstacles', () => {
    const bounds = { minX: 0, maxX: 10, minZ: 0, maxZ: 10 }
    const obstacles = [{ x: 5.5, z: 5.5, radius: 1 }]
    const thin = createNavGrid({ bounds, obstacles, agentRadius: 0 })
    const fat = createNavGrid({ bounds, obstacles, agentRadius: 1 })
    // Cell (7,5) center (7.5,5.5): distance 2 — outside radius 1, inside 1+1.
    expect(thin.isWalkable(7, 5)).toBe(true)
    expect(fat.isWalkable(7, 5)).toBe(false)

    const count = (grid: typeof thin): number => {
      let blocked = 0
      for (let cz = 0; cz < grid.rows; cz++) {
        for (let cx = 0; cx < grid.cols; cx++) {
          if (!grid.isWalkable(cx, cz)) blocked++
        }
      }
      return blocked
    }
    expect(count(fat)).toBeGreaterThan(count(thin))
  })

  it('blockCircle blocks dynamically and unblockAll clears everything', () => {
    const grid = createNavGrid({
      bounds: { minX: 0, maxX: 6, minZ: 0, maxZ: 6 },
      obstacles: [{ x: 1.5, z: 1.5, radius: 0.4 }],
      agentRadius: 0,
    })
    expect(grid.isWalkable(1, 1)).toBe(false)
    grid.blockCircle(4.5, 4.5, 0.4)
    expect(grid.isWalkable(4, 4)).toBe(false)
    grid.unblockAll()
    expect(grid.isWalkable(1, 1)).toBe(true)
    expect(grid.isWalkable(4, 4)).toBe(true)
  })

  it('rebuild restores the creation obstacles, or applies a new set', () => {
    const grid = createNavGrid({
      bounds: { minX: 0, maxX: 6, minZ: 0, maxZ: 6 },
      obstacles: [{ x: 1.5, z: 1.5, radius: 0.4 }],
      agentRadius: 0,
    })
    grid.blockCircle(4.5, 4.5, 0.4)
    grid.rebuild()
    expect(grid.isWalkable(1, 1)).toBe(false) // config obstacle back
    expect(grid.isWalkable(4, 4)).toBe(true) // dynamic block gone

    grid.rebuild([{ x: 4.5, z: 4.5, radius: 0.4 }])
    expect(grid.isWalkable(1, 1)).toBe(true)
    expect(grid.isWalkable(4, 4)).toBe(false)
  })
})

describe('collidersToObstacles', () => {
  it('maps collision-store-shaped colliders (Vector3-like positions)', () => {
    const colliders = new Map([
      ['a', { id: 'a', position: { x: 1, y: 0, z: 2 }, radius: 0.8, type: 'building' }],
      ['b', { id: 'b', position: { x: -3, y: 5, z: 4 }, radius: 1.2, type: 'npc' }],
    ])
    expect(collidersToObstacles(colliders.values())).toEqual([
      { x: 1, z: 2, radius: 0.8 },
      { x: -3, z: 4, radius: 1.2 },
    ])
  })
})
