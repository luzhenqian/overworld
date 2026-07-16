/**
 * HPA*-style hierarchical pathfinding over a {@link NavGrid}. The grid is
 * partitioned into square clusters; walkable *entrances* along each shared
 * cluster border become transition nodes of an abstract graph; queries
 * search that small graph and refine only window-bounded low-level
 * segments, so the worst-case number of explored cells stays far below a
 * full-grid A* on large maps. Pure data + functions — no three.js, no React.
 *
 * Entrance placement: for every maximal contiguous run of walkable cell
 * pairs along a border, one transition (at the run's middle) when the run is
 * `<= 8` cells long, and two transitions (one at each end) for longer runs.
 * The two end nodes keep corner-hugging routes through wide openings
 * near-optimal without flooding the graph with nodes; a single middle node
 * in e.g. a 16-cell opening would force detours of up to ~8 cells (string
 * pulling then hides most of the residual error).
 *
 * Completeness: cluster-local intra edges cannot represent routes that
 * weave *out of and back into* a cluster, and the abstract graph goes stale
 * when the grid is edited without `rebuild()`. {@link findPathHierarchical}
 * therefore falls back to a plain full-grid {@link findPath} whenever the
 * hierarchical route fails, so its reachability always matches `findPath`.
 */
import {
  findCellPath,
  findPath,
  nearestWalkableCell,
  smoothPath,
  type CellWindow,
  type FindPathOptions,
  type PathPoint,
} from './astar'
import type { NavGrid } from './grid'

/** Options for {@link createHierarchicalGrid}. */
export interface HierarchicalGridOptions {
  /** Cluster edge length in **cells** (not world units). @default 16 */
  clusterSize?: number
}

/** A transition node of the abstract graph — an entrance cell on a cluster border. */
export interface TransitionNode {
  /** Stable node id (index into {@link HierarchicalGrid.nodes}) until the next `rebuild()`. */
  readonly id: number
  /** Cell X coordinate. */
  readonly cx: number
  /** Cell Z coordinate. */
  readonly cz: number
  /** Owning cluster index (`clusterZ * clustersX + clusterX`). */
  readonly cluster: number
}

/** An abstract-graph edge; `cost` is in cell units (same scale as A* g-scores). */
export interface AbstractEdge {
  readonly to: number
  readonly cost: number
}

/** The hierarchical grid returned by {@link createHierarchicalGrid}. */
export interface HierarchicalGrid {
  /** The underlying navigation grid (not copied — shared by reference). */
  readonly grid: NavGrid
  /** Cluster edge length in cells. */
  readonly clusterSize: number
  /** Number of clusters along X. */
  readonly clustersX: number
  /** Number of clusters along Z. */
  readonly clustersZ: number
  /** Current transition nodes (recreated by `rebuild()`). */
  readonly nodes: ReadonlyArray<TransitionNode>
  /** Ids of the transition nodes inside `cluster`. */
  nodesOfCluster(cluster: number): ReadonlyArray<number>
  /**
   * Abstract edges of node `id`: inter-cluster edges to the paired entrance
   * cell (cost 1) and intra-cluster edges to every other node of the same
   * cluster reachable within the cluster window (cost = bounded A* distance).
   */
  edgesOf(id: number): ReadonlyArray<AbstractEdge>
  /**
   * Full recompute of entrances and the abstract graph. Call after the
   * underlying grid changed (`blockCircle` / `unblockAll` / `rebuild`).
   */
  rebuild(): void
}

/** Runs longer than this many cells get two entrance nodes (both ends). */
const ENTRANCE_SPLIT_LENGTH = 8

/** Inclusive cell window of `cluster`, clamped to the grid. */
function windowOfCluster(
  grid: NavGrid,
  clustersX: number,
  clusterSize: number,
  cluster: number
): CellWindow {
  const gx = cluster % clustersX
  const gz = Math.floor(cluster / clustersX)
  return {
    minCx: gx * clusterSize,
    minCz: gz * clusterSize,
    maxCx: Math.min((gx + 1) * clusterSize - 1, grid.cols - 1),
    maxCz: Math.min((gz + 1) * clusterSize - 1, grid.rows - 1),
  }
}

/**
 * Partition `grid` into `clusterSize × clusterSize` cell clusters and build
 * the abstract entrance graph (see the module docs for the entrance-node
 * placement rule). The grid is held by reference; call
 * {@link HierarchicalGrid.rebuild} after mutating it.
 */
export function createHierarchicalGrid(
  grid: NavGrid,
  options: HierarchicalGridOptions = {}
): HierarchicalGrid {
  const clusterSize = options.clusterSize ?? 16
  if (!Number.isInteger(clusterSize) || clusterSize < 2) {
    throw new Error('[overworld/ai] clusterSize must be an integer >= 2')
  }
  const clustersX = Math.max(1, Math.ceil(grid.cols / clusterSize))
  const clustersZ = Math.max(1, Math.ceil(grid.rows / clusterSize))
  const clusterCount = clustersX * clustersZ

  let nodes: TransitionNode[] = []
  let edges: AbstractEdge[][] = []
  let nodesByCluster: number[][] = []
  let nodeAtCell = new Map<number, number>()

  const clusterOfCell = (cx: number, cz: number): number =>
    Math.floor(cz / clusterSize) * clustersX + Math.floor(cx / clusterSize)

  const getOrCreateNode = (cx: number, cz: number): number => {
    const cellIdx = cz * grid.cols + cx
    const existing = nodeAtCell.get(cellIdx)
    if (existing !== undefined) return existing
    const id = nodes.length
    nodes.push({ id, cx, cz, cluster: clusterOfCell(cx, cz) })
    edges.push([])
    nodesByCluster[nodes[id]!.cluster]!.push(id)
    nodeAtCell.set(cellIdx, id)
    return id
  }

  const addEdge = (a: number, b: number, cost: number): void => {
    edges[a]!.push({ to: b, cost })
    edges[b]!.push({ to: a, cost })
  }

  /** One entrance run `[lo, hi]`; `cellA`/`cellB` map a run position to the paired border cells. */
  const emitEntrance = (
    lo: number,
    hi: number,
    cellA: (p: number) => readonly [number, number],
    cellB: (p: number) => readonly [number, number]
  ): void => {
    const picks =
      hi - lo + 1 > ENTRANCE_SPLIT_LENGTH ? [lo, hi] : [Math.floor((lo + hi) / 2)]
    for (const p of picks) {
      const [ax, az] = cellA(p)
      const [bx, bz] = cellB(p)
      addEdge(getOrCreateNode(ax, az), getOrCreateNode(bx, bz), 1)
    }
  }

  const buildEntrances = (): void => {
    // Borders between horizontally adjacent clusters: cells (xA, z) | (xB, z).
    for (let gz = 0; gz < clustersZ; gz++) {
      const zMin = gz * clusterSize
      const zMax = Math.min((gz + 1) * clusterSize - 1, grid.rows - 1)
      for (let gx = 0; gx < clustersX - 1; gx++) {
        const xA = (gx + 1) * clusterSize - 1
        const xB = xA + 1
        if (xB >= grid.cols) continue
        let runStart = -1
        for (let z = zMin; z <= zMax + 1; z++) {
          const open = z <= zMax && grid.isWalkable(xA, z) && grid.isWalkable(xB, z)
          if (open && runStart < 0) runStart = z
          if (!open && runStart >= 0) {
            emitEntrance(runStart, z - 1, (p) => [xA, p], (p) => [xB, p])
            runStart = -1
          }
        }
      }
    }
    // Borders between vertically adjacent clusters: cells (x, zA) | (x, zB).
    for (let gx = 0; gx < clustersX; gx++) {
      const xMin = gx * clusterSize
      const xMax = Math.min((gx + 1) * clusterSize - 1, grid.cols - 1)
      for (let gz = 0; gz < clustersZ - 1; gz++) {
        const zA = (gz + 1) * clusterSize - 1
        const zB = zA + 1
        if (zB >= grid.rows) continue
        let runStart = -1
        for (let x = xMin; x <= xMax + 1; x++) {
          const open = x <= xMax && grid.isWalkable(x, zA) && grid.isWalkable(x, zB)
          if (open && runStart < 0) runStart = x
          if (!open && runStart >= 0) {
            emitEntrance(runStart, x - 1, (p) => [p, zA], (p) => [p, zB])
            runStart = -1
          }
        }
      }
    }
  }

  const buildIntraEdges = (): void => {
    for (let cluster = 0; cluster < clusterCount; cluster++) {
      const ids = nodesByCluster[cluster]!
      if (ids.length < 2) continue
      const window = windowOfCluster(grid, clustersX, clusterSize, cluster)
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          const a = nodes[ids[i]!]!
          const b = nodes[ids[j]!]!
          const result = findCellPath(grid, [a.cx, a.cz], [b.cx, b.cz], { window })
          if (result) addEdge(a.id, b.id, result.cost)
        }
      }
    }
  }

  const rebuild = (): void => {
    nodes = []
    edges = []
    nodeAtCell = new Map()
    nodesByCluster = Array.from({ length: clusterCount }, () => [])
    buildEntrances()
    buildIntraEdges()
  }

  rebuild()

  return {
    grid,
    clusterSize,
    clustersX,
    clustersZ,
    get nodes() {
      return nodes
    },
    nodesOfCluster: (cluster) => nodesByCluster[cluster] ?? [],
    edgesOf: (id) => edges[id] ?? [],
    rebuild,
  }
}

/**
 * Abstract-graph route `start → goal` refined into a low-level cell chain:
 * connect both endpoint cells to their clusters' transition nodes (bounded
 * in-cluster A*), Dijkstra over the abstract graph, then stitch bounded
 * low-level segments. Every refinement search runs at query time, so a
 * stale graph yields `null` here instead of a path through new obstacles.
 */
function refineViaAbstractGraph(
  hgrid: HierarchicalGrid,
  start: readonly [number, number],
  goal: readonly [number, number],
  startCluster: number,
  goalCluster: number,
  stats: { visited: number } | undefined
): [number, number][] | null {
  const grid = hgrid.grid
  const startWindow = windowOfCluster(grid, hgrid.clustersX, hgrid.clusterSize, startCluster)
  const goalWindow = windowOfCluster(grid, hgrid.clustersX, hgrid.clusterSize, goalCluster)

  // Connect the endpoints to their clusters' transition nodes.
  const startLinks: { id: number; cost: number }[] = []
  for (const id of hgrid.nodesOfCluster(startCluster)) {
    const node = hgrid.nodes[id]!
    const r = findCellPath(grid, start, [node.cx, node.cz], { window: startWindow, stats })
    if (r) startLinks.push({ id, cost: r.cost })
  }
  const goalCosts = new Map<number, number>()
  for (const id of hgrid.nodesOfCluster(goalCluster)) {
    const node = hgrid.nodes[id]!
    const r = findCellPath(grid, [node.cx, node.cz], goal, { window: goalWindow, stats })
    if (r) goalCosts.set(id, r.cost)
  }
  if (startLinks.length === 0 || goalCosts.size === 0) return null

  // Dijkstra over the abstract graph. Small graph: linear-scan extraction.
  const dist = new Map<number, number>()
  const parent = new Map<number, number>()
  for (const link of startLinks) {
    const existing = dist.get(link.id)
    if (existing === undefined || link.cost < existing) {
      dist.set(link.id, link.cost)
      parent.set(link.id, -1)
    }
  }
  const done = new Set<number>()
  let bestTotal = Infinity
  let bestNode = -1
  for (;;) {
    let current = -1
    let currentDist = Infinity
    for (const [id, d] of dist) {
      if (!done.has(id) && d < currentDist) {
        current = id
        currentDist = d
      }
    }
    if (current === -1 || currentDist >= bestTotal) break
    done.add(current)
    if (stats) stats.visited++ // abstract expansions count toward search effort
    const goalCost = goalCosts.get(current)
    if (goalCost !== undefined && currentDist + goalCost < bestTotal) {
      bestTotal = currentDist + goalCost
      bestNode = current
    }
    for (const edge of hgrid.edgesOf(current)) {
      const next = currentDist + edge.cost
      const prev = dist.get(edge.to)
      if (prev === undefined || next < prev) {
        dist.set(edge.to, next)
        parent.set(edge.to, current)
      }
    }
  }
  if (bestNode === -1) return null

  const sequence: number[] = []
  for (let id = bestNode; id !== -1; id = parent.get(id)!) sequence.push(id)
  sequence.reverse()

  // Stitch bounded low-level segments; each segment's first cell duplicates
  // the previous segment's last cell and is skipped.
  const chain: [number, number][] = []
  const appendSegment = (cells: [number, number][]): void => {
    for (let i = chain.length > 0 ? 1 : 0; i < cells.length; i++) chain.push(cells[i]!)
  }

  const firstNode = hgrid.nodes[sequence[0]!]!
  const first = findCellPath(grid, start, [firstNode.cx, firstNode.cz], {
    window: startWindow,
    stats,
  })
  if (!first) return null
  appendSegment(first.cells)

  for (let i = 1; i < sequence.length; i++) {
    const prev = hgrid.nodes[sequence[i - 1]!]!
    const node = hgrid.nodes[sequence[i]!]!
    if (prev.cluster === node.cluster) {
      const segment = findCellPath(grid, [prev.cx, prev.cz], [node.cx, node.cz], {
        window: windowOfCluster(grid, hgrid.clustersX, hgrid.clusterSize, prev.cluster),
        stats,
      })
      if (!segment) return null
      appendSegment(segment.cells)
    } else {
      // Inter-cluster edge: the paired entrance cells are orthogonally adjacent.
      appendSegment([
        [prev.cx, prev.cz],
        [node.cx, node.cz],
      ])
    }
  }

  const lastNode = hgrid.nodes[sequence[sequence.length - 1]!]!
  const last = findCellPath(grid, [lastNode.cx, lastNode.cz], goal, {
    window: goalWindow,
    stats,
  })
  if (!last) return null
  appendSegment(last.cells)

  return chain
}

/**
 * Hierarchical variant of {@link findPath} — same waypoint format, same
 * endpoint semantics (first waypoint exactly `from`; blocked start/target
 * cells fall back to the nearest walkable cell within
 * `options.fallbackRadius`; last waypoint is exactly `to` when the target
 * cell is walkable), same smoothing default. `null` when unreachable.
 *
 * Strategy:
 * - Start and goal in the same or adjacent clusters → one plain A* bounded
 *   to the window covering both clusters.
 * - Otherwise → abstract-graph route + window-bounded refinement (see
 *   {@link createHierarchicalGrid}), then {@link smoothPath} over the
 *   stitched chain.
 * - Whenever the hierarchical route fails (cluster-weaving routes the
 *   abstract graph cannot express, or a stale graph after grid edits
 *   without `rebuild()`) → full-grid {@link findPath} fallback, so
 *   reachability always matches plain `findPath`.
 *
 * Pass `options.stats = { visited: 0 }` to compare explored-cell counts
 * against plain `findPath` (abstract-node expansions are included).
 */
export function findPathHierarchical(
  hgrid: HierarchicalGrid,
  from: PathPoint,
  to: PathPoint,
  options: FindPathOptions = {}
): PathPoint[] | null {
  const grid = hgrid.grid
  const fallbackRadius = options.fallbackRadius ?? 3
  const smooth = options.smooth ?? true
  const stats = options.stats

  const [fromCx, fromCz] = grid.worldToCell(from[0], from[1])
  const [toCx, toCz] = grid.worldToCell(to[0], to[1])
  const start = nearestWalkableCell(grid, fromCx, fromCz, fallbackRadius)
  const goal = nearestWalkableCell(grid, toCx, toCz, fallbackRadius)
  if (!start || !goal) return null

  // Same endpoint semantics as findPath: exact `to` only when its true
  // (unclamped) cell is walkable and no fallback substitution happened.
  const rawToCx = Math.floor((to[0] - grid.bounds.minX) / grid.cellSize)
  const rawToCz = Math.floor((to[1] - grid.bounds.minZ) / grid.cellSize)
  const exactGoal = goal[0] === rawToCx && goal[1] === rawToCz
  const endPoint: PathPoint = exactGoal ? [to[0], to[1]] : grid.cellToWorld(goal[0], goal[1])

  if (start[0] === goal[0] && start[1] === goal[1]) {
    return [[from[0], from[1]], endPoint]
  }

  const finish = (cells: [number, number][]): PathPoint[] => {
    const path: PathPoint[] = [[from[0], from[1]]]
    // Keep only the turning points of the cell chain: interior cells of a
    // straight (orthogonal or diagonal) run lie exactly on the segment
    // between the run's endpoints, and string pulling is quadratic in
    // waypoint count — stitched chains can be hundreds of cells long.
    for (let i = 1; i < cells.length - 1; i++) {
      const prev = cells[i - 1]!
      const cell = cells[i]!
      const next = cells[i + 1]!
      const collinear =
        next[0] - cell[0] === cell[0] - prev[0] && next[1] - cell[1] === cell[1] - prev[1]
      if (!collinear) path.push(grid.cellToWorld(cell[0], cell[1]))
    }
    path.push(endPoint)
    return smooth ? smoothPath(grid, path) : path
  }

  const S = hgrid.clusterSize
  const sgx = Math.floor(start[0] / S)
  const sgz = Math.floor(start[1] / S)
  const ggx = Math.floor(goal[0] / S)
  const ggz = Math.floor(goal[1] / S)
  const startCluster = sgz * hgrid.clustersX + sgx
  const goalCluster = ggz * hgrid.clustersX + ggx

  // Same or adjacent clusters: plain A* within the window covering both.
  if (Math.abs(sgx - ggx) <= 1 && Math.abs(sgz - ggz) <= 1) {
    const a = windowOfCluster(grid, hgrid.clustersX, S, startCluster)
    const b = windowOfCluster(grid, hgrid.clustersX, S, goalCluster)
    const window: CellWindow = {
      minCx: Math.min(a.minCx, b.minCx),
      minCz: Math.min(a.minCz, b.minCz),
      maxCx: Math.max(a.maxCx, b.maxCx),
      maxCz: Math.max(a.maxCz, b.maxCz),
    }
    const direct = findCellPath(grid, start, goal, { window, stats })
    if (direct) return finish(direct.cells)
    // The route may leave the window — fall through to the abstract graph.
  }

  const refined = refineViaAbstractGraph(hgrid, start, goal, startCluster, goalCluster, stats)
  if (refined) return finish(refined)

  // Completeness/staleness fallback: match plain findPath reachability.
  return findPath(grid, from, to, options)
}
