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
  /** Clear every blocked cell (including the config obstacles). */
  unblockAll(): void
  /**
   * Clear the grid and re-rasterize `obstacles` (defaults to the obstacles
   * passed at creation). Use when the obstacle set changes wholesale.
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
