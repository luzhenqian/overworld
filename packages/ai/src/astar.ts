/**
 * A* pathfinding over a {@link NavGrid}: octile heuristic, 8-directional
 * movement with no diagonal corner-cutting, plus line-of-sight path
 * smoothing (string pulling). Pure functions — no three.js, no React.
 */
import type { NavGrid } from './grid'

/** A world-space X/Z point. */
export type PathPoint = [number, number]

/** Options for {@link findPath}. */
export interface FindPathOptions {
  /**
   * When the start or target cell is blocked, search for the nearest
   * walkable cell within this many cells (Chebyshev radius) and path
   * from/to it instead. `0` disables the fallback. @default 3
   */
  fallbackRadius?: number
  /** Run {@link smoothPath} on the result. @default true */
  smooth?: boolean
}

const SQRT2 = Math.SQRT2

/** Minimal binary min-heap keyed on `f`, ties broken by larger `g`. */
class OpenHeap {
  private idx: number[] = []
  private f: number[] = []
  private g: number[] = []

  get size(): number {
    return this.idx.length
  }

  push(index: number, f: number, g: number): void {
    this.idx.push(index)
    this.f.push(f)
    this.g.push(g)
    let i = this.idx.length - 1
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (!this.less(i, parent)) break
      this.swap(i, parent)
      i = parent
    }
  }

  pop(): number {
    const top = this.idx[0]!
    const last = this.idx.length - 1
    this.swap(0, last)
    this.idx.pop()
    this.f.pop()
    this.g.pop()
    let i = 0
    for (;;) {
      const left = 2 * i + 1
      const right = left + 1
      let smallest = i
      if (left < this.idx.length && this.less(left, smallest)) smallest = left
      if (right < this.idx.length && this.less(right, smallest)) smallest = right
      if (smallest === i) break
      this.swap(i, smallest)
      i = smallest
    }
    return top
  }

  private less(a: number, b: number): boolean {
    if (this.f[a]! !== this.f[b]!) return this.f[a]! < this.f[b]!
    return this.g[a]! > this.g[b]! // prefer deeper nodes on equal f
  }

  private swap(a: number, b: number): void {
    ;[this.idx[a], this.idx[b]] = [this.idx[b]!, this.idx[a]!]
    ;[this.f[a], this.f[b]] = [this.f[b]!, this.f[a]!]
    ;[this.g[a], this.g[b]] = [this.g[b]!, this.g[a]!]
  }
}

/** dx, dz, step cost (in cell units). */
const DIRECTIONS: ReadonlyArray<readonly [number, number, number]> = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, SQRT2],
  [1, -1, SQRT2],
  [-1, 1, SQRT2],
  [-1, -1, SQRT2],
]

/** Octile distance between two cells, in cell units. */
function octile(ax: number, az: number, bx: number, bz: number): number {
  const dx = Math.abs(ax - bx)
  const dz = Math.abs(az - bz)
  return Math.max(dx, dz) + (SQRT2 - 1) * Math.min(dx, dz)
}

/** Cell of a world point WITHOUT clamping (out-of-bounds cells stay out). */
function rawCell(grid: NavGrid, x: number, z: number): [number, number] {
  return [
    Math.floor((x - grid.bounds.minX) / grid.cellSize),
    Math.floor((z - grid.bounds.minZ) / grid.cellSize),
  ]
}

/**
 * The walkable cell nearest to `(cx, cz)` (Euclidean, over the square of
 * Chebyshev radius `maxRadius`), or null when none exists. Returns the cell
 * itself when it is already walkable.
 */
export function nearestWalkableCell(
  grid: NavGrid,
  cx: number,
  cz: number,
  maxRadius: number
): [number, number] | null {
  if (grid.isWalkable(cx, cz)) return [cx, cz]
  let best: [number, number] | null = null
  let bestDist = Infinity
  for (let dz = -maxRadius; dz <= maxRadius; dz++) {
    for (let dx = -maxRadius; dx <= maxRadius; dx++) {
      if (dx === 0 && dz === 0) continue
      if (!grid.isWalkable(cx + dx, cz + dz)) continue
      const dist = dx * dx + dz * dz
      if (dist < bestDist) {
        bestDist = dist
        best = [cx + dx, cz + dz]
      }
    }
  }
  return best
}

/**
 * True when the straight world-space segment `a → b` crosses only walkable
 * cells (sampled at quarter-cell steps — the grid raycast used by
 * {@link smoothPath}).
 */
export function hasLineOfSight(grid: NavGrid, a: PathPoint, b: PathPoint): boolean {
  const dx = b[0] - a[0]
  const dz = b[1] - a[1]
  const distance = Math.hypot(dx, dz)
  const steps = Math.max(1, Math.ceil(distance / (grid.cellSize * 0.25)))
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const [cx, cz] = rawCell(grid, a[0] + dx * t, a[1] + dz * t)
    if (!grid.isWalkable(cx, cz)) return false
  }
  return true
}

/**
 * String-pulling smoothing: greedily replace waypoint runs with straight
 * segments wherever {@link hasLineOfSight} holds. Preserves the first and
 * last point exactly; never lengthens the path.
 */
export function smoothPath(grid: NavGrid, path: PathPoint[]): PathPoint[] {
  if (path.length <= 2) return path.map((p) => [p[0], p[1]])
  const first = path[0]!
  const out: PathPoint[] = [[first[0], first[1]]]
  let anchor = 0
  while (anchor < path.length - 1) {
    let next = anchor + 1
    for (let j = path.length - 1; j > anchor + 1; j--) {
      if (hasLineOfSight(grid, path[anchor]!, path[j]!)) {
        next = j
        break
      }
    }
    const point = path[next]!
    out.push([point[0], point[1]])
    anchor = next
  }
  return out
}

/**
 * Find a world-space path `from → to` on the grid.
 *
 * - A* with octile heuristic, 8-directional movement; diagonal steps are
 *   disallowed when either adjacent orthogonal cell is blocked (no
 *   corner-cutting).
 * - When the start or target cell is blocked (e.g. the target sits inside an
 *   inflated obstacle), falls back to the nearest walkable cell within
 *   `options.fallbackRadius` cells (default 3); the returned path then ends
 *   at that cell's center instead of the exact target.
 * - The first waypoint is always exactly `from`; the last is exactly `to`
 *   when the target cell is walkable.
 * - Smoothed with {@link smoothPath} unless `options.smooth` is `false`.
 *
 * @returns world-space waypoints `[x, z][]`, or `null` when unreachable.
 */
export function findPath(
  grid: NavGrid,
  from: PathPoint,
  to: PathPoint,
  options: FindPathOptions = {}
): PathPoint[] | null {
  const fallbackRadius = options.fallbackRadius ?? 3
  const smooth = options.smooth ?? true

  const [fromCx, fromCz] = grid.worldToCell(from[0], from[1])
  const [toCx, toCz] = grid.worldToCell(to[0], to[1])
  const start = nearestWalkableCell(grid, fromCx, fromCz, fallbackRadius)
  const goal = nearestWalkableCell(grid, toCx, toCz, fallbackRadius)
  if (!start || !goal) return null

  // The endpoint is the exact target only when its true (unclamped) cell is
  // walkable and no fallback substitution happened.
  const [rawToCx, rawToCz] = rawCell(grid, to[0], to[1])
  const exactGoal = goal[0] === rawToCx && goal[1] === rawToCz
  const endPoint: PathPoint = exactGoal ? [to[0], to[1]] : grid.cellToWorld(goal[0], goal[1])

  if (start[0] === goal[0] && start[1] === goal[1]) {
    return [[from[0], from[1]], endPoint]
  }

  const { cols, rows } = grid
  const size = cols * rows
  const gScore = new Float64Array(size).fill(Infinity)
  const parent = new Int32Array(size).fill(-1)
  const closed = new Uint8Array(size)
  const open = new OpenHeap()

  const startIdx = start[1] * cols + start[0]
  const goalIdx = goal[1] * cols + goal[0]
  gScore[startIdx] = 0
  open.push(startIdx, octile(start[0], start[1], goal[0], goal[1]), 0)

  let found = false
  while (open.size > 0) {
    const current = open.pop()
    if (current === goalIdx) {
      found = true
      break
    }
    if (closed[current]) continue
    closed[current] = 1

    const cx = current % cols
    const cz = (current - cx) / cols
    for (const [dx, dz, cost] of DIRECTIONS) {
      const nx = cx + dx
      const nz = cz + dz
      if (!grid.isWalkable(nx, nz)) continue
      // No corner-cutting: a diagonal needs both orthogonal cells free.
      if (dx !== 0 && dz !== 0 && (!grid.isWalkable(cx + dx, cz) || !grid.isWalkable(cx, cz + dz))) {
        continue
      }
      const neighbor = nz * cols + nx
      if (closed[neighbor]) continue
      const tentative = gScore[current]! + cost
      if (tentative >= gScore[neighbor]!) continue
      gScore[neighbor] = tentative
      parent[neighbor] = current
      open.push(neighbor, tentative + octile(nx, nz, goal[0], goal[1]), tentative)
    }
  }
  if (!found) return null

  // Reconstruct the cell chain start → goal.
  const cells: number[] = []
  for (let idx = goalIdx; idx !== -1; idx = parent[idx]!) cells.push(idx)
  cells.reverse()

  const path: PathPoint[] = [[from[0], from[1]]]
  for (let i = 1; i < cells.length - 1; i++) {
    const idx = cells[i]!
    path.push(grid.cellToWorld(idx % cols, Math.floor(idx / cols)))
  }
  path.push(endPoint)

  return smooth ? smoothPath(grid, path) : path
}
