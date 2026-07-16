import {
  createHierarchicalGrid,
  createNavGrid,
  findPath,
  findPathHierarchical,
} from '@overworld/ai'
import { bench, mulberry32 } from '../lib.mjs'

/**
 * Deterministic obstacle map: `size × size` cells (cellSize 1) with
 * scattered circular obstacles plus three long walls whose gaps alternate
 * sides, forcing serpentine long-range routes (the workload hierarchical
 * pathfinding exists for). Corners stay clear so corner-to-corner queries
 * always succeed. Shared with the regression guards.
 */
export function makeObstacleGrid(size, seed = 1234) {
  const rng = mulberry32(seed)
  const obstacles = []

  // Walls at 1/4, 1/2, 3/4 height; gap alternates left / right / left.
  const walls = [
    { z: Math.round(size * 0.25), gapX: size * 0.2 },
    { z: Math.round(size * 0.5), gapX: size * 0.8 },
    { z: Math.round(size * 0.75), gapX: size * 0.2 },
  ]
  const GAP_HALF_WIDTH = 5
  for (const wall of walls) {
    for (let x = 1; x < size; x += 2) {
      if (Math.abs(x - wall.gapX) <= GAP_HALF_WIDTH) continue
      obstacles.push({ x, z: wall.z, radius: 1.2 })
    }
  }

  // Scattered circles, kept away from wall gaps and the benchmark corners.
  const count = Math.round(size * size * 0.004) // ~40 on 100², ~160 on 200²
  for (let i = 0; i < count; i++) {
    const x = 8 + rng() * (size - 16)
    const z = 8 + rng() * (size - 16)
    const radius = 1 + rng() * 2
    if (Math.hypot(x - 2, z - 2) < 8 || Math.hypot(x - (size - 2), z - (size - 2)) < 8) continue
    if (walls.some((w) => Math.abs(z - w.z) < 5 && Math.abs(x - w.gapX) < 10)) continue
    obstacles.push({ x, z, radius })
  }

  return createNavGrid({
    bounds: { minX: 0, maxX: size, minZ: 0, maxZ: size },
    cellSize: 1,
    agentRadius: 0.4,
    obstacles,
  })
}

/** Deterministic query pairs spread across the map (long diagonals mostly). */
function makePairs(size, count, seed) {
  const rng = mulberry32(seed)
  const pairs = []
  for (let i = 0; i < count; i++) {
    pairs.push({
      from: [1 + rng() * (size / 4), 1 + rng() * (size / 4)],
      to: [size - 1 - rng() * (size / 4), size - 1 - rng() * (size / 4)],
    })
  }
  return pairs
}

export function run() {
  const results = []

  for (const size of [100, 200]) {
    const grid = makeObstacleGrid(size, 1234 + size)
    const pairs = makePairs(size, 20, 42)
    results.push(
      bench(`findPath A* ${size}x${size}`, (i) => {
        const p = pairs[i % pairs.length]
        findPath(grid, p.from, p.to)
      }, { iterations: 100, warmup: 20, meta: { size, obstacles: true } })
    )
  }

  // HPA* vs plain A* on the 200×200 map (same queries), plus visited-cell counts.
  {
    const size = 200
    const grid = makeObstacleGrid(size, 1234 + size)
    const hgrid = createHierarchicalGrid(grid, { clusterSize: 16 })
    const pairs = makePairs(size, 20, 42)

    results.push(
      bench(`findPathHierarchical ${size}x${size}`, (i) => {
        const p = pairs[i % pairs.length]
        findPathHierarchical(hgrid, p.from, p.to)
      }, { iterations: 100, warmup: 20, meta: { size, clusterSize: 16 } })
    )

    // Search effort: visited cells corner-to-corner, plain vs hierarchical.
    const plainStats = { visited: 0 }
    const hpaStats = { visited: 0 }
    findPath(grid, [2, 2], [size - 2, size - 2], { stats: plainStats })
    findPathHierarchical(hgrid, [2, 2], [size - 2, size - 2], { stats: hpaStats })
    results.push({
      name: `visited cells ${size}x${size} corner-to-corner`,
      opsPerSec: 0,
      meanMs: 0,
      meta: {
        plainVisited: plainStats.visited,
        hpaVisited: hpaStats.visited,
        ratio: Number((plainStats.visited / Math.max(1, hpaStats.visited)).toFixed(2)),
      },
    })

    results.push(
      bench('createHierarchicalGrid 200x200 rebuild', () => hgrid.rebuild(), {
        iterations: 5,
        warmup: 2,
        runs: 3,
        meta: { clusterSize: 16 },
      })
    )
  }

  return { name: 'pathfinding', results }
}
