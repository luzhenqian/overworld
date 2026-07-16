/**
 * Uniform navigation grid over the X/Z plane with circular-obstacle
 * rasterization. Pure data structure — no three.js, no React.
 *
 * Convention: a cell `(cx, cz)` covers the world square
 * `[minX + cx*cellSize, minX + (cx+1)*cellSize) × [minZ + cz*cellSize, ...)`;
 * a cell is blocked when its **center** lies within
 * `obstacle.radius + agentRadius` of an obstacle center.
 */

/** Axis-aligned world bounds of the grid on the X/Z plane. */
export interface NavGridBounds {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

/** A circular obstacle footprint on the X/Z plane. */
export interface Obstacle {
  x: number
  z: number
  radius: number
}

/** Configuration for {@link createNavGrid}. */
export interface NavGridConfig {
  /** World-space extent of the grid. */
  bounds: NavGridBounds
  /** Cell edge length in world units. @default 1 */
  cellSize?: number
  /** Circular obstacles rasterized at creation (and by `rebuild()`). */
  obstacles?: Obstacle[]
  /**
   * Radius of the agents that will navigate this grid, in world units.
   * Every obstacle is inflated by this amount so paths keep clearance.
   * @default 0.5
   */
  agentRadius?: number
}

/** The navigation grid returned by {@link createNavGrid}. */
export interface NavGrid {
  /** World-space extent (as passed in config). */
  readonly bounds: NavGridBounds
  /** Cell edge length in world units. */
  readonly cellSize: number
  /** Obstacle inflation radius in world units. */
  readonly agentRadius: number
  /** Number of cells along X. */
  readonly cols: number
  /** Number of cells along Z. */
  readonly rows: number
  /**
   * Whether cell `(cx, cz)` can be traversed. Cells outside the grid are
   * never walkable.
   */
  isWalkable(cx: number, cz: number): boolean
  /**
   * Map a world position to the cell containing it. Out-of-bounds positions
   * are clamped to the nearest edge cell.
   */
  worldToCell(x: number, z: number): [number, number]
  /** World position of the **center** of cell `(cx, cz)`. */
  cellToWorld(cx: number, cz: number): [number, number]
  /**
   * Block every cell whose center lies within `radius + agentRadius` of
   * `(x, z)`. Use for dynamic obstacles added after creation.
   */
  blockCircle(x: number, z: number, radius: number): void
  /**
   * Mark exactly cell `(cx, cz)` blocked — no inflation, no neighbors.
   * Out-of-bounds coordinates are a no-op. Use for tile maps where each
   * tile maps 1:1 to a cell (see {@link createNavGridFromCells}).
   */
  blockCell(cx: number, cz: number): void
  /**
   * Mark exactly cell `(cx, cz)` walkable again. Out-of-bounds coordinates
   * are a no-op. Counterpart of {@link NavGrid.blockCell}.
   */
  unblockCell(cx: number, cz: number): void
  /** Clear every blocked cell (including the config obstacles). */
  unblockAll(): void
  /**
   * Clear the grid and re-rasterize `obstacles` (defaults to the obstacles
   * passed at creation). Use when the obstacle set changes wholesale.
   * Grids from {@link createNavGridFromCells} additionally re-evaluate
   * their cell source on every rebuild.
   */
  rebuild(obstacles?: Obstacle[]): void
}

/**
 * Create a {@link NavGrid} covering `config.bounds`, with the given circular
 * obstacles rasterized onto it (inflated by `agentRadius`).
 */
export function createNavGrid(config: NavGridConfig): NavGrid {
  const { bounds } = config
  const cellSize = config.cellSize ?? 1
  const agentRadius = config.agentRadius ?? 0.5
  if (cellSize <= 0) throw new Error('[overworld/ai] cellSize must be > 0')
  if (bounds.maxX <= bounds.minX || bounds.maxZ <= bounds.minZ) {
    throw new Error('[overworld/ai] bounds must have positive extent')
  }

  // Epsilon guards against float fuzz like (3 - 0) / 0.5 => 6.000000001.
  const cols = Math.max(1, Math.ceil((bounds.maxX - bounds.minX) / cellSize - 1e-9))
  const rows = Math.max(1, Math.ceil((bounds.maxZ - bounds.minZ) / cellSize - 1e-9))
  const blocked = new Uint8Array(cols * rows)
  const initialObstacles = (config.obstacles ?? []).map((o) => ({ ...o }))

  const clamp = (value: number, min: number, max: number): number =>
    value < min ? min : value > max ? max : value

  const grid: NavGrid = {
    bounds,
    cellSize,
    agentRadius,
    cols,
    rows,

    isWalkable(cx, cz) {
      if (cx < 0 || cz < 0 || cx >= cols || cz >= rows) return false
      return blocked[cz * cols + cx] === 0
    },

    worldToCell(x, z) {
      const cx = clamp(Math.floor((x - bounds.minX) / cellSize), 0, cols - 1)
      const cz = clamp(Math.floor((z - bounds.minZ) / cellSize), 0, rows - 1)
      return [cx, cz]
    },

    cellToWorld(cx, cz) {
      return [bounds.minX + (cx + 0.5) * cellSize, bounds.minZ + (cz + 0.5) * cellSize]
    },

    blockCircle(x, z, radius) {
      const r = radius + agentRadius
      if (r <= 0) return
      const cxMin = clamp(Math.floor((x - r - bounds.minX) / cellSize), 0, cols - 1)
      const cxMax = clamp(Math.floor((x + r - bounds.minX) / cellSize), 0, cols - 1)
      const czMin = clamp(Math.floor((z - r - bounds.minZ) / cellSize), 0, rows - 1)
      const czMax = clamp(Math.floor((z + r - bounds.minZ) / cellSize), 0, rows - 1)
      const r2 = r * r
      for (let cz = czMin; cz <= czMax; cz++) {
        for (let cx = cxMin; cx <= cxMax; cx++) {
          const [wx, wz] = grid.cellToWorld(cx, cz)
          const dx = wx - x
          const dz = wz - z
          if (dx * dx + dz * dz <= r2) blocked[cz * cols + cx] = 1
        }
      }
    },

    blockCell(cx, cz) {
      if (cx < 0 || cz < 0 || cx >= cols || cz >= rows) return
      blocked[cz * cols + cx] = 1
    },

    unblockCell(cx, cz) {
      if (cx < 0 || cz < 0 || cx >= cols || cz >= rows) return
      blocked[cz * cols + cx] = 0
    },

    unblockAll() {
      blocked.fill(0)
    },

    rebuild(obstacles) {
      blocked.fill(0)
      for (const o of obstacles ?? initialObstacles) grid.blockCircle(o.x, o.z, o.radius)
    },
  }

  for (const o of initialObstacles) grid.blockCircle(o.x, o.z, o.radius)
  return grid
}

/**
 * Cell source for {@link createNavGridFromCells}: either a predicate
 * `(cx, cz) => blocked`, or a 2D array indexed `cells[cz][cx]` (**row = z**,
 * column = x) where `1`/`true` means BLOCKED. Missing rows/entries count as
 * walkable.
 */
export type NavGridCellSource =
  | ((cx: number, cz: number) => boolean)
  | ReadonlyArray<ReadonlyArray<0 | 1>>

/** Configuration for {@link createNavGridFromCells}. */
export interface NavGridFromCellsConfig {
  /** World-space extent of the grid (same convention as {@link createNavGrid}). */
  bounds: NavGridBounds
  /** Cell edge length in world units. @default 1 */
  cellSize?: number
  /**
   * Which cells are blocked: a predicate `(cx, cz) => boolean`, or a 2D array
   * `cells[cz][cx]` (row = z) of `0 | 1` — `1`/`true` = BLOCKED.
   *
   * Cell values are **absolute**: `agentRadius` does NOT inflate them (unlike
   * circular obstacles). For tile maps this means one array entry blocks
   * exactly one cell — no `blockCircle` radius tuning.
   */
  cells: NavGridCellSource
  /**
   * Obstacle inflation radius for **circle-based** operations only
   * (`blockCircle`, `rebuild(obstacles)`); it never affects `cells`.
   * @default 0.5
   */
  agentRadius?: number
}

/**
 * Create a {@link NavGrid} directly from per-cell data — the tile-map path
 * that {@link createNavGrid}'s circular obstacles don't cover.
 *
 * ```ts
 * // 1 = wall. Orientation: cells[cz][cx] — each inner array is one row
 * // of constant z, read left-to-right in +x.
 * const grid = createNavGridFromCells({
 *   bounds: { minX: 0, maxX: 4, minZ: 0, maxZ: 3 },
 *   cells: [
 *     [1, 1, 1, 1], // z = 0
 *     [1, 0, 0, 1], // z = 1
 *     [1, 1, 1, 1], // z = 2
 *   ],
 * })
 * ```
 *
 * The source is kept by reference: `rebuild()` clears the grid and
 * re-evaluates it (predicate re-run, array re-read), so mutate the array or
 * the predicate's captured state and call `rebuild()` to refresh.
 * `rebuild(obstacles)` additionally rasterizes the circles on top — both
 * construction modes stay coherent on one grid.
 *
 * `agentRadius` interplay: cell values are **absolute** (one entry = exactly
 * one cell, never inflated); `agentRadius` only applies to circle-based calls
 * like `blockCircle`.
 */
export function createNavGridFromCells(config: NavGridFromCellsConfig): NavGrid {
  const { cells, ...rest } = config
  const grid = createNavGrid(rest)

  const isBlocked: (cx: number, cz: number) => boolean =
    typeof cells === 'function' ? cells : (cx, cz) => Boolean(cells[cz]?.[cx])

  const applyCells = (): void => {
    for (let cz = 0; cz < grid.rows; cz++) {
      for (let cx = 0; cx < grid.cols; cx++) {
        if (isBlocked(cx, cz)) grid.blockCell(cx, cz)
      }
    }
  }

  const rebuildCircles = grid.rebuild
  grid.rebuild = (obstacles) => {
    rebuildCircles(obstacles) // clears, then rasterizes obstacles (default: none)
    applyCells()
  }

  applyCells()
  return grid
}

/**
 * Map scene-collision-store-shaped colliders (structural — anything with
 * `{ position: { x, z }, radius }`, e.g. `THREE.Vector3` positions) into the
 * obstacle array expected by {@link createNavGrid}.
 *
 * ```ts
 * const grid = createNavGrid({
 *   bounds,
 *   obstacles: collidersToObstacles(useCollisionStore.getState().colliders.values()),
 * })
 * ```
 */
export function collidersToObstacles(
  colliders: Iterable<{ position: { x: number; z: number }; radius: number }>
): Obstacle[] {
  const out: Obstacle[] = []
  for (const collider of colliders) {
    out.push({ x: collider.position.x, z: collider.position.z, radius: collider.radius })
  }
  return out
}
