import { describe, expect, it } from 'vitest'
import { findPath } from '../astar'
import { collidersToObstacles, createNavGrid, createNavGridFromCells } from '../grid'

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

describe('blockCell / unblockCell — exact-one-cell semantics', () => {
  it('blockCell blocks exactly the named cell and nothing else', () => {
    const grid = createNavGrid({
      bounds: { minX: 0, maxX: 6, minZ: 0, maxZ: 6 },
      agentRadius: 1, // must NOT inflate cell-level blocking
    })
    grid.blockCell(3, 2)
    for (let cz = 0; cz < grid.rows; cz++) {
      for (let cx = 0; cx < grid.cols; cx++) {
        expect(grid.isWalkable(cx, cz)).toBe(!(cx === 3 && cz === 2))
      }
    }
  })

  it('unblockCell clears exactly the named cell', () => {
    const grid = createNavGrid({ bounds: { minX: 0, maxX: 4, minZ: 0, maxZ: 4 } })
    grid.blockCell(1, 1)
    grid.blockCell(2, 1)
    grid.unblockCell(1, 1)
    expect(grid.isWalkable(1, 1)).toBe(true)
    expect(grid.isWalkable(2, 1)).toBe(false)
  })

  it('out-of-bounds coordinates are a no-op (no throw, no wraparound)', () => {
    const grid = createNavGrid({ bounds: { minX: 0, maxX: 4, minZ: 0, maxZ: 4 } })
    expect(() => {
      grid.blockCell(-1, 0)
      grid.blockCell(0, -1)
      grid.blockCell(4, 0)
      grid.blockCell(0, 4)
      grid.unblockCell(-1, -1)
      grid.unblockCell(99, 99)
    }).not.toThrow()
    // blockCell(-1, 0) must not wrap to the previous row's last cell etc.
    for (let cz = 0; cz < grid.rows; cz++) {
      for (let cx = 0; cx < grid.cols; cx++) {
        expect(grid.isWalkable(cx, cz)).toBe(true)
      }
    }
  })

  it('round-trips with worldToCell: block the cell under a world point', () => {
    const grid = createNavGrid({
      bounds: { minX: -5, maxX: 5, minZ: -5, maxZ: 5 },
      cellSize: 0.5,
    })
    const [cx, cz] = grid.worldToCell(1.3, -2.7)
    grid.blockCell(cx, cz)
    expect(grid.isWalkable(cx, cz)).toBe(false)
    const [wx, wz] = grid.cellToWorld(cx, cz)
    expect(grid.worldToCell(wx, wz)).toEqual([cx, cz])
  })
})

describe('createNavGridFromCells', () => {
  // 1 = wall. Orientation: cells[cz][cx] — inner array = one row of constant
  // z; a gap at cx=2 in the middle wall row (z=2).
  const cells: (0 | 1)[][] = [
    [0, 0, 0, 0, 0], // z = 0
    [0, 0, 0, 0, 0], // z = 1
    [1, 1, 0, 1, 1], // z = 2 — gap at cx = 2
    [0, 0, 0, 0, 0], // z = 3
    [0, 0, 0, 0, 0], // z = 4
  ]
  const bounds = { minX: 0, maxX: 5, minZ: 0, maxZ: 5 }

  it('2D array mode: orientation is cells[cz][cx] (row = z)', () => {
    const grid = createNavGridFromCells({ bounds, cells })
    // Row z=2 is the wall (except the gap) — NOT column x=2.
    expect(grid.isWalkable(0, 2)).toBe(false)
    expect(grid.isWalkable(1, 2)).toBe(false)
    expect(grid.isWalkable(2, 2)).toBe(true) // the gap
    expect(grid.isWalkable(3, 2)).toBe(false)
    expect(grid.isWalkable(4, 2)).toBe(false)
    // A column reading of the same data would block (2, 0) — assert it does not.
    expect(grid.isWalkable(2, 0)).toBe(true)
    expect(grid.isWalkable(2, 4)).toBe(true)
  })

  it('findPath routes through the gap in the wall row', () => {
    const grid = createNavGridFromCells({ bounds, cells })
    const path = findPath(grid, [0.5, 0.5], [0.5, 4.5], { smooth: false })
    expect(path).not.toBeNull()
    // Every crossing of the wall row must happen in the gap column.
    const gapCenter = grid.cellToWorld(2, 2)
    const onWallRow = path!.filter((p) => grid.worldToCell(p[0], p[1])[1] === 2)
    expect(onWallRow.length).toBeGreaterThan(0)
    for (const p of onWallRow) {
      expect(grid.worldToCell(p[0], p[1])[0]).toBe(2)
      expect(p[0]).toBeCloseTo(gapCenter[0])
    }
  })

  it('predicate mode blocks exactly the cells the predicate names', () => {
    const grid = createNavGridFromCells({
      bounds,
      cells: (cx, cz) => cz === 2 && cx !== 2,
    })
    expect(grid.isWalkable(1, 2)).toBe(false)
    expect(grid.isWalkable(2, 2)).toBe(true)
    expect(grid.isWalkable(1, 1)).toBe(true)
  })

  it('agentRadius does NOT inflate cells (they are absolute)', () => {
    const grid = createNavGridFromCells({
      bounds,
      cells: (cx, cz) => cx === 2 && cz === 2,
      agentRadius: 2, // would swallow the whole grid if it inflated cells
    })
    expect(grid.isWalkable(2, 2)).toBe(false)
    expect(grid.isWalkable(1, 2)).toBe(true)
    expect(grid.isWalkable(2, 1)).toBe(true)
    expect(grid.isWalkable(3, 3)).toBe(true)
    // ...while circle-based blocking on the same grid still inflates.
    grid.blockCircle(0.5, 0.5, 0.1) // 0.1 + agentRadius 2 => radius 2.1
    expect(grid.isWalkable(2, 0)).toBe(false) // center (2.5, .5): dist 2 <= 2.1
  })

  it('rebuild() re-reads a mutated source array', () => {
    const source: (0 | 1)[][] = [
      [0, 0, 0],
      [0, 1, 0],
      [0, 0, 0],
    ]
    const grid = createNavGridFromCells({
      bounds: { minX: 0, maxX: 3, minZ: 0, maxZ: 3 },
      cells: source,
    })
    expect(grid.isWalkable(1, 1)).toBe(false)

    source[1]![1] = 0
    source[0]![2] = 1
    grid.rebuild()
    expect(grid.isWalkable(1, 1)).toBe(true)
    expect(grid.isWalkable(2, 0)).toBe(false)
  })

  it('rebuild() re-runs a predicate over its captured state', () => {
    let wallZ = 1
    const grid = createNavGridFromCells({
      bounds: { minX: 0, maxX: 3, minZ: 0, maxZ: 3 },
      cells: (_cx, cz) => cz === wallZ,
    })
    expect(grid.isWalkable(0, 1)).toBe(false)
    expect(grid.isWalkable(0, 2)).toBe(true)

    wallZ = 2
    grid.rebuild()
    expect(grid.isWalkable(0, 1)).toBe(true)
    expect(grid.isWalkable(0, 2)).toBe(false)
  })

  it('rebuild(obstacles) rasterizes circles on top of the cell source', () => {
    const grid = createNavGridFromCells({
      bounds: { minX: 0, maxX: 5, minZ: 0, maxZ: 5 },
      cells: (cx, cz) => cx === 0 && cz === 0,
      agentRadius: 0,
    })
    grid.rebuild([{ x: 3.5, z: 3.5, radius: 0.4 }])
    expect(grid.isWalkable(0, 0)).toBe(false) // cell source reapplied
    expect(grid.isWalkable(3, 3)).toBe(false) // circle obstacle applied
  })

  it('short/ragged arrays treat missing entries as walkable', () => {
    const grid = createNavGridFromCells({
      bounds: { minX: 0, maxX: 3, minZ: 0, maxZ: 3 },
      cells: [[1]], // only cell (0, 0) specified
    })
    expect(grid.isWalkable(0, 0)).toBe(false)
    expect(grid.isWalkable(1, 0)).toBe(true)
    expect(grid.isWalkable(0, 1)).toBe(true)
    expect(grid.isWalkable(2, 2)).toBe(true)
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
