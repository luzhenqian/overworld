/**
 * Pure layout math for {@link SpriteLabel}: measured text width (in canvas
 * pixels) → canvas dimensions and world-unit sprite scale. Extracted from
 * the component so it is testable without a 2D canvas or GL context.
 */

/**
 * Pixel size the label font is rasterized at. Higher = crisper texture;
 * the sprite's world size is controlled independently via `fontSize`.
 */
export const SPRITE_LABEL_FONT_PX = 64

/** Input to {@link computeSpriteLabelLayout}. */
export interface SpriteLabelLayoutInput {
  /** Measured text width in canvas pixels (at {@link SpriteLabelLayoutInput.fontPx}). */
  textWidthPx: number
  /** Desired text height in world units (matches drei `Text`'s `fontSize`). */
  fontSize: number
  /** Font raster size in canvas pixels. Defaults to {@link SPRITE_LABEL_FONT_PX}. */
  fontPx?: number
  /**
   * Padding around the text in canvas pixels (breathing room for the
   * background plate). Defaults to `fontPx * 0.25`.
   */
  paddingPx?: number
  /**
   * Maximum sprite width in world units. Wider labels are scaled down
   * uniformly (text shrinks, aspect preserved).
   */
  maxWidth?: number
}

/** Result of {@link computeSpriteLabelLayout}. */
export interface SpriteLabelLayout {
  /** Canvas width in pixels (integer, ≥ 1). */
  canvasWidth: number
  /** Canvas height in pixels (integer, ≥ 1). */
  canvasHeight: number
  /** Sprite width in world units. */
  worldWidth: number
  /** Sprite height in world units. */
  worldHeight: number
}

/** Line-height factor applied to the raster font size (ascenders/descenders). */
const LINE_HEIGHT = 1.2

/**
 * Compute canvas dimensions and world-unit sprite scale for a label.
 *
 * The canvas is sized to the measured text plus padding; the sprite is
 * scaled so the *text* stands `fontSize` world units tall (the padded
 * plate is proportionally larger), preserving the canvas aspect ratio so
 * the texture is never stretched. `maxWidth` caps the sprite width by
 * scaling the whole label down uniformly.
 */
export function computeSpriteLabelLayout(input: SpriteLabelLayoutInput): SpriteLabelLayout {
  const fontPx = input.fontPx ?? SPRITE_LABEL_FONT_PX
  const paddingPx = input.paddingPx ?? fontPx * 0.25
  const textWidthPx = Math.max(0, input.textWidthPx)

  const canvasWidth = Math.max(1, Math.ceil(textWidthPx + paddingPx * 2))
  const canvasHeight = Math.max(1, Math.ceil(fontPx * LINE_HEIGHT + paddingPx * 2))

  // World units per canvas pixel, chosen so the glyphs are `fontSize` tall.
  const worldPerPx = input.fontSize / fontPx
  let worldWidth = canvasWidth * worldPerPx
  let worldHeight = canvasHeight * worldPerPx

  if (input.maxWidth !== undefined && input.maxWidth > 0 && worldWidth > input.maxWidth) {
    const shrink = input.maxWidth / worldWidth
    worldWidth *= shrink
    worldHeight *= shrink
  }

  return { canvasWidth, canvasHeight, worldWidth, worldHeight }
}
