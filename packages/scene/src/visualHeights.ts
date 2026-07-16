/**
 * Pure layout math for scene entities: how the fallback primitive and the
 * floating UI (name label, indicator badge, glow, interaction bubble) scale
 * with an entity's `scale` prop.
 *
 * BaseNPC's fallback capsule and label heights were designed against the
 * default NPC scale (2.5); BaseBuilding's fallback box and label heights
 * against scale 1. These helpers normalize by that reference scale, so the
 * defaults look exactly as before while other scales shrink/grow
 * proportionally. Extracted as pure functions so they are testable without a
 * GL context.
 */

/** The `scale` BaseNPC's fallback capsule and label heights were designed for. */
export const DEFAULT_NPC_SCALE = 2.5
/** The `scale` BaseBuilding's fallback box and label heights were designed for. */
export const DEFAULT_BUILDING_SCALE = 1

/** Vertical layout for one NPC, all in world units. */
export interface NPCVisualHeights {
  /** Uniform scale for the fallback capsule group (1 at the default scale). */
  fallbackScale: number
  /** Y of the name label. */
  labelY: number
  /** Y of the indicator badge (rides above the label). */
  indicatorY: number
  /** Y of the nearby point-light glow. */
  glowY: number
  /** Y of the interaction hint bubble (rides above the label). */
  bubbleY: number
}

/**
 * Compute {@link NPCVisualHeights} for an NPC `scale`. At the default scale
 * (2.5) this reproduces the historical constants exactly (label 4.2,
 * indicator 5, glow 3, bubble 5.5, unscaled capsule). `labelHeight`
 * overrides the label Y; the indicator and bubble keep their proportional
 * offset above it.
 */
export function npcVisualHeights(
  scale: number = DEFAULT_NPC_SCALE,
  labelHeight?: number
): NPCVisualHeights {
  const f = scale / DEFAULT_NPC_SCALE
  const labelY = labelHeight ?? 4.2 * f
  return {
    fallbackScale: f,
    labelY,
    indicatorY: labelY + 0.8 * f,
    glowY: 3 * f,
    bubbleY: labelY + 1.3 * f,
  }
}

/** Vertical layout for one building, all in world units. */
export interface BuildingVisualHeights {
  /** Uniform scale for the fallback box (1 at the reference scale). */
  fallbackScale: number
  /** Y of the name label. */
  labelY: number
  /** Y of the nearby point-light glow. */
  glowY: number
  /** Y of the interaction hint bubble (rides above the label). */
  bubbleY: number
}

/**
 * Compute {@link BuildingVisualHeights} for a building `scale`. At the
 * reference scale (1) this reproduces the historical constants exactly
 * (label 6, glow 4, bubble 7.5, unscaled 8×12×8 box). `labelHeight`
 * overrides the label Y; the bubble keeps its proportional offset above it.
 */
export function buildingVisualHeights(
  scale: number = DEFAULT_BUILDING_SCALE,
  labelHeight?: number
): BuildingVisualHeights {
  const f = scale / DEFAULT_BUILDING_SCALE
  const labelY = labelHeight ?? 6 * f
  return {
    fallbackScale: f,
    labelY,
    glowY: 4 * f,
    bubbleY: labelY + 1.5 * f,
  }
}
