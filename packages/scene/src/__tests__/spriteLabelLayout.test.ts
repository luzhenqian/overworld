import { describe, expect, it } from 'vitest'
import { SPRITE_LABEL_FONT_PX, computeSpriteLabelLayout } from '../spriteLabelLayout'

describe('computeSpriteLabelLayout', () => {
  it('sizes the canvas to the measured text plus default padding', () => {
    const layout = computeSpriteLabelLayout({ textWidthPx: 200, fontSize: 0.4 })
    const padding = SPRITE_LABEL_FONT_PX * 0.25 // 16
    expect(layout.canvasWidth).toBe(Math.ceil(200 + padding * 2)) // 232
    expect(layout.canvasHeight).toBe(Math.ceil(SPRITE_LABEL_FONT_PX * 1.2 + padding * 2)) // 109
  })

  it('scales the sprite so the glyphs stand fontSize world units tall', () => {
    const layout = computeSpriteLabelLayout({ textWidthPx: 200, fontSize: 0.4 })
    const worldPerPx = 0.4 / SPRITE_LABEL_FONT_PX
    expect(layout.worldWidth).toBeCloseTo(layout.canvasWidth * worldPerPx, 10)
    expect(layout.worldHeight).toBeCloseTo(layout.canvasHeight * worldPerPx, 10)
  })

  it('preserves the canvas aspect ratio in world units (no texture stretch)', () => {
    const layout = computeSpriteLabelLayout({ textWidthPx: 313, fontSize: 0.7 })
    expect(layout.worldWidth / layout.worldHeight).toBeCloseTo(
      layout.canvasWidth / layout.canvasHeight,
      10
    )
  })

  it('grows the world size linearly with fontSize at fixed raster size', () => {
    const small = computeSpriteLabelLayout({ textWidthPx: 100, fontSize: 0.35 })
    const large = computeSpriteLabelLayout({ textWidthPx: 100, fontSize: 0.7 })
    expect(small.canvasWidth).toBe(large.canvasWidth) // Raster size unchanged.
    expect(large.worldWidth).toBeCloseTo(small.worldWidth * 2, 10)
    expect(large.worldHeight).toBeCloseTo(small.worldHeight * 2, 10)
  })

  it('honors custom fontPx and paddingPx', () => {
    const layout = computeSpriteLabelLayout({
      textWidthPx: 100,
      fontSize: 0.5,
      fontPx: 32,
      paddingPx: 4,
    })
    expect(layout.canvasWidth).toBe(108)
    expect(layout.canvasHeight).toBe(Math.ceil(32 * 1.2 + 8)) // 47
    expect(layout.worldHeight).toBeCloseTo(47 * (0.5 / 32), 10)
  })

  it('clamps to maxWidth by shrinking uniformly (aspect preserved)', () => {
    const free = computeSpriteLabelLayout({ textWidthPx: 1000, fontSize: 0.4 })
    expect(free.worldWidth).toBeGreaterThan(3)

    const clamped = computeSpriteLabelLayout({ textWidthPx: 1000, fontSize: 0.4, maxWidth: 3 })
    expect(clamped.worldWidth).toBeCloseTo(3, 10)
    expect(clamped.canvasWidth).toBe(free.canvasWidth) // Raster untouched.
    expect(clamped.worldWidth / clamped.worldHeight).toBeCloseTo(
      free.worldWidth / free.worldHeight,
      10
    )
  })

  it('leaves labels narrower than maxWidth untouched', () => {
    const free = computeSpriteLabelLayout({ textWidthPx: 100, fontSize: 0.4 })
    const capped = computeSpriteLabelLayout({ textWidthPx: 100, fontSize: 0.4, maxWidth: 50 })
    expect(capped).toEqual(free)
  })

  it('never returns a degenerate canvas for empty or negative measurements', () => {
    const empty = computeSpriteLabelLayout({ textWidthPx: 0, fontSize: 0.4, paddingPx: 0 })
    expect(empty.canvasWidth).toBeGreaterThanOrEqual(1)
    expect(empty.canvasHeight).toBeGreaterThanOrEqual(1)

    const negative = computeSpriteLabelLayout({ textWidthPx: -50, fontSize: 0.4, paddingPx: 0 })
    expect(negative.canvasWidth).toBeGreaterThanOrEqual(1)
    expect(negative.worldWidth).toBeGreaterThan(0)
  })
})
