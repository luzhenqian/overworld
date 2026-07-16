import { describe, expect, it } from 'vitest'
import { findPath, hasLineOfSight, type PathPoint } from '../astar'
import { createNavGrid, type NavGrid, type Obstacle } from '../grid'
import { createHierarchicalGrid, findPathHierarchical } from '../hpa'

/** Obstacle that blocks exactly cell `(cx, cz)` on an agentRadius-0 grid. */
const cellObstacle = (cx: number, cz: number): Obstacle => ({
  x: cx + 0.5,
  z: cz + 0.5,
  radius: 0.1,
})

const pathLength = (path: PathPoint[]): number => {
  let total = 0
  for (let i = 1; i < path.length; i++) {
    total += Math.hypot(path[i]![0] - path[i - 1]![0], path[i]![1] - path[i - 1]![1])
  }
  return total
}

/** Every waypoint walkable, every leg clear, first waypoint exactly `from`. */
const expectValidPath = (grid: NavGrid, path: PathPoint[], from: PathPoint): void => {
  expect(path.length).toBeGreaterThanOrEqual(2)
  expect(path[0]).toEqual(from)
  for (const [x, z] of path) {
    const [cx, cz] = grid.worldToCell(x, z)
    expect(grid.isWalkable(cx, cz)).toBe(true)
  }
  for (let i = 1; i < path.length; i++) {
    expect(hasLineOfSight(grid, path[i - 1]!, path[i]!)).toBe(true)
  }
}

/** Deterministic PRNG (mulberry32) for reproducible obstacle layouts. */
const mulberry32 = (seed: number): (() => number) => {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

describe('createHierarchicalGrid — entrance extraction', () => {
  // 20x20 cells, 10-cell clusters => 2x2 clusters. Border openings are
  // hand-carved so every entrance node position is known:
  // - (0,0)|(1,0): cells (10,z) blocked except z=2..4 -> 3-cell run,
  //   one node pair at its middle z=3.
  // - (0,1)|(1,1): row-10 cells blocked at x=9,10 -> 9-cell run z=11..19
  //   (> 8), two node pairs at both ends z=11 and z=19.
  // - (0,0)|(0,1): row-10 cells x=0..9 all blocked -> no entrance.
  // - (1,0)|(1,1): row 10 open only at x=15 -> one node pair at x=15.
  const buildGrid = (): NavGrid => {
    const obstacles: Obstacle[] = []
    for (let z = 0; z <= 9; z++) if (z < 2 || z > 4) obstacles.push(cellObstacle(10, z))
    for (let x = 0; x <= 19; x++) if (x !== 15) obstacles.push(cellObstacle(x, 10))
    return createNavGrid({
      bounds: { minX: 0, maxX: 20, minZ: 0, maxZ: 20 },
      agentRadius: 0,
      obstacles,
    })
  }

  it('places one middle node per short run, two end nodes per long run', () => {
    const hgrid = createHierarchicalGrid(buildGrid(), { clusterSize: 10 })
    expect(hgrid.clustersX).toBe(2)
    expect(hgrid.clustersZ).toBe(2)
    const cells = hgrid.nodes.map((n) => [n.cx, n.cz]).sort((a, b) => a[0]! - b[0]! || a[1]! - b[1]!)
    expect(cells).toEqual([
      [9, 3],
      [9, 11],
      [9, 19],
      [10, 3],
      [10, 11],
      [10, 19],
      [15, 9],
      [15, 10],
    ])
  })

  it('pairs entrance nodes with cost-1 inter edges and assigns clusters', () => {
    const hgrid = createHierarchicalGrid(buildGrid(), { clusterSize: 10 })
    const byCell = new Map(hgrid.nodes.map((n) => [`${n.cx},${n.cz}`, n]))
    const left = byCell.get('9,3')!
    const right = byCell.get('10,3')!
    expect(left.cluster).toBe(0) // cluster (0,0)
    expect(right.cluster).toBe(1) // cluster (1,0)
    expect(hgrid.edgesOf(left.id)).toContainEqual({ to: right.id, cost: 1 })
    expect(hgrid.edgesOf(right.id)).toContainEqual({ to: left.id, cost: 1 })
    // Intra edge inside cluster (1,1): (10,11) <-> (10,19) both belong to it.
    const a = byCell.get('10,11')!
    const b = byCell.get('10,19')!
    expect(a.cluster).toBe(3)
    expect(b.cluster).toBe(3)
    expect(hgrid.edgesOf(a.id).some((e) => e.to === b.id && e.cost >= 8)).toBe(true)
  })

  it('lists nodes per cluster', () => {
    const hgrid = createHierarchicalGrid(buildGrid(), { clusterSize: 10 })
    // Cluster (0,0): entrance cells (9,3) only (no south entrance).
    const ids = hgrid.nodesOfCluster(0)
    expect(ids.map((id) => [hgrid.nodes[id]!.cx, hgrid.nodes[id]!.cz])).toEqual([[9, 3]])
  })
})

describe('findPathHierarchical — parity with findPath', () => {
  const bounds = { minX: 0, maxX: 30, minZ: 0, maxZ: 30 }

  const randomCells = (seed: number, count: number): Obstacle[] => {
    const random = mulberry32(seed)
    const out: Obstacle[] = []
    for (let i = 0; i < count; i++) {
      out.push(cellObstacle(Math.floor(random() * 30), Math.floor(random() * 30)))
    }
    return out
  }

  const wallWithGap = (): Obstacle[] => {
    const out: Obstacle[] = []
    for (let x = 0; x < 30; x++) if (x !== 22) out.push(cellObstacle(x, 15))
    return out
  }

  const solidWall = (): Obstacle[] => {
    const out: Obstacle[] = []
    for (let x = 0; x < 30; x++) out.push(cellObstacle(x, 15))
    return out
  }

  const layouts: { name: string; obstacles: Obstacle[] }[] = [
    { name: 'open', obstacles: [] },
    { name: 'circles', obstacles: [{ x: 10, z: 10, radius: 3 }, { x: 20, z: 22, radius: 4 }] },
    { name: 'wall with gap', obstacles: wallWithGap() },
    { name: 'solid wall (disconnected)', obstacles: solidWall() },
    { name: 'random scatter A', obstacles: randomCells(1, 140) },
    { name: 'random scatter B', obstacles: randomCells(42, 200) },
  ]

  const pairs: [PathPoint, PathPoint][] = [
    [[1.5, 1.5], [28.5, 28.5]],
    [[1.5, 28.5], [28.5, 1.5]],
    [[2.5, 2.5], [6.5, 4.5]], // same cluster
    [[15.5, 3.5], [15.5, 27.5]], // crosses the wall rows
    [[3.5, 16.5], [27.5, 16.5]],
    [[28.5, 14.5], [1.5, 16.5]],
  ]

  for (const layout of layouts) {
    it(`matches reachability and validity on "${layout.name}"`, () => {
      const grid = createNavGrid({ bounds, agentRadius: 0, obstacles: layout.obstacles })
      const hgrid = createHierarchicalGrid(grid, { clusterSize: 8 })
      for (const [from, to] of pairs) {
        const plain = findPath(grid, from, to)
        const hier = findPathHierarchical(hgrid, from, to)
        expect(hier === null).toBe(plain === null)
        if (plain && hier) {
          expectValidPath(grid, hier, from)
          // Identical endpoint semantics (incl. nearest-walkable fallback).
          expect(hier[hier.length - 1]).toEqual(plain[plain.length - 1])
        }
      }
    })
  }

  it('handles same-cell from/to and blocked-target fallback like findPath', () => {
    const grid = createNavGrid({
      bounds,
      agentRadius: 0,
      obstacles: [{ x: 20.5, z: 20.5, radius: 1 }],
    })
    const hgrid = createHierarchicalGrid(grid, { clusterSize: 8 })
    expect(findPathHierarchical(hgrid, [3.2, 3.2], [3.8, 3.8])).toEqual([
      [3.2, 3.2],
      [3.8, 3.8],
    ])
    const blockedTarget = findPathHierarchical(hgrid, [2.5, 20.5], [20.5, 20.5])!
    expect(blockedTarget).not.toBeNull()
    const end = blockedTarget[blockedTarget.length - 1]!
    expect(grid.isWalkable(...grid.worldToCell(end[0], end[1]))).toBe(true)
    expect(findPathHierarchical(hgrid, [1.5, 1.5], [20.5, 20.5], { fallbackRadius: 0 })).toBeNull()
  })
})

describe('findPathHierarchical — large-map performance', () => {
  it('visits far fewer cells than plain findPath on a 200x200 serpentine map', () => {
    // Wall rows every 20 cells with a single-side gap, alternating ends —
    // the route snakes across the whole map.
    const obstacles: Obstacle[] = []
    for (let i = 1; i <= 9; i++) {
      const z = i * 20
      const gapX = i % 2 === 1 ? 2 : 197
      for (let x = 0; x < 200; x++) {
        if (Math.abs(x - gapX) > 1) obstacles.push(cellObstacle(x, z))
      }
    }
    const grid = createNavGrid({
      bounds: { minX: 0, maxX: 200, minZ: 0, maxZ: 200 },
      agentRadius: 0,
      obstacles,
    })
    const hgrid = createHierarchicalGrid(grid) // default clusterSize 16

    const from: PathPoint = [1.5, 1.5]
    const to: PathPoint = [198.5, 198.5]
    const plainStats = { visited: 0 }
    const hierStats = { visited: 0 }
    const plain = findPath(grid, from, to, { stats: plainStats })
    const hier = findPathHierarchical(hgrid, from, to, { stats: hierStats })

    expect(plain).not.toBeNull()
    expect(hier).not.toBeNull()
    expectValidPath(grid, hier!, from)
    expect(hier![hier!.length - 1]).toEqual(to)
    expect(hierStats.visited).toBeGreaterThan(0)
    expect(hierStats.visited).toBeLessThan(plainStats.visited / 2)
    // The refined path cannot beat the optimal one, but must stay sane.
    expect(pathLength(hier!)).toBeLessThan(pathLength(plain!) * 1.5)
  })
})

describe('createHierarchicalGrid — rebuild', () => {
  it('reflects blockCircle changes after rebuild()', () => {
    // Wall row z=20 with single-cell gaps at x=5 and x=35.
    const obstacles: Obstacle[] = []
    for (let x = 0; x < 40; x++) if (x !== 5 && x !== 35) obstacles.push(cellObstacle(x, 20))
    const grid = createNavGrid({
      bounds: { minX: 0, maxX: 40, minZ: 0, maxZ: 40 },
      agentRadius: 0,
      obstacles,
    })
    const hgrid = createHierarchicalGrid(grid, { clusterSize: 10 })
    const from: PathPoint = [5.5, 5.5]
    const to: PathPoint = [5.5, 35.5]

    const before = findPathHierarchical(hgrid, from, to)!
    expect(before).not.toBeNull()
    expectValidPath(grid, before, from)

    // Close the near gap; the only route now detours through x=35.
    grid.blockCircle(5.5, 20.5, 0.4)
    hgrid.rebuild()
    const after = findPathHierarchical(hgrid, from, to)!
    expect(after).not.toBeNull()
    expectValidPath(grid, after, from)
    expect(pathLength(after)).toBeGreaterThan(pathLength(before) + 20)

    // Close the far gap too: unreachable on the grid — hierarchical agrees.
    grid.blockCircle(35.5, 20.5, 0.4)
    hgrid.rebuild()
    expect(findPath(grid, from, to)).toBeNull()
    expect(findPathHierarchical(hgrid, from, to)).toBeNull()
  })
})
