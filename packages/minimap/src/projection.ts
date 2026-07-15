/**
 * Pure world→canvas projection helpers for a north-up, top-down minimap.
 * World X maps to canvas X (east = right); world Z maps to canvas Y
 * (three.js −Z / "north" = up). No canvas or DOM dependency — unit-testable.
 */

/** Axis-aligned world rectangle covered by the minimap, on the X/Z plane. */
export interface WorldBounds {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

/** Inputs for {@link projectToCanvas}. */
export interface ProjectionConfig {
  worldBounds: WorldBounds
  /** Canvas edge length in px (the minimap is square). */
  size: number
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/**
 * Uniform scale (px per world unit) that fits the whole world rectangle
 * inside the square canvas while preserving its aspect ratio. Returns 0 for
 * degenerate (zero-area) bounds.
 */
export function projectionScale(config: ProjectionConfig): number {
  const { worldBounds, size } = config
  const width = worldBounds.maxX - worldBounds.minX
  const depth = worldBounds.maxZ - worldBounds.minZ
  const largest = Math.max(width, depth)
  return largest > 0 ? size / largest : 0
}

/**
 * Project a world X/Z coordinate to canvas px.
 *
 * The world rectangle is fitted uniformly (aspect preserved) and centered,
 * so a non-square world is letterboxed rather than stretched. Results are
 * clamped to `[0, size]`, so out-of-bounds positions pin to the map edge.
 * Degenerate bounds project everything to the canvas center.
 */
export function projectToCanvas(x: number, z: number, config: ProjectionConfig): [number, number] {
  const { worldBounds, size } = config
  const scale = projectionScale(config)
  if (scale === 0) return [size / 2, size / 2]

  const width = worldBounds.maxX - worldBounds.minX
  const depth = worldBounds.maxZ - worldBounds.minZ
  const offsetX = (size - width * scale) / 2
  const offsetY = (size - depth * scale) / 2

  return [
    clamp(offsetX + (x - worldBounds.minX) * scale, 0, size),
    clamp(offsetY + (z - worldBounds.minZ) * scale, 0, size),
  ]
}
