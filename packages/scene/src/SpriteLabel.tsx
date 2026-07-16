/**
 * Cross-platform text label: canvas-rasterized texture on a `THREE.Sprite`.
 *
 * Unlike drei's `<Text>` (troika), this needs no DOM, no web worker and no
 * font fetch, so it works on every platform — including WeChat mini-games,
 * where troika is unavailable (see `labelMode="sprite"` on `BaseNPC` /
 * `BaseBuilding`). The trade-off: system font only, one line, rasterized
 * (crisp at label sizes via {@link SPRITE_LABEL_FONT_PX}).
 *
 * The offscreen canvas comes from `document.createElement('canvas')` by
 * default; DOM-less hosts register a factory once via
 * {@link setLabelCanvasFactory} (e.g. `() => wx.createCanvas()` in the
 * weapp template).
 */
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import type { Vec3 } from '@overworld-engine/core'
import {
  SPRITE_LABEL_FONT_PX,
  computeSpriteLabelLayout,
} from './spriteLabelLayout'

/**
 * Structural subset of a 2D canvas the label needs — satisfied by DOM
 * canvases and WeChat mini-game canvases alike.
 */
export interface LabelCanvas {
  width: number
  height: number
  getContext(contextId: '2d'): LabelCanvasContext | null
}

/** Structural subset of `CanvasRenderingContext2D` used to draw a label. */
export interface LabelCanvasContext {
  font: string
  textAlign: string
  textBaseline: string
  /** SpriteLabel only ever writes strings; the wide type keeps DOM contexts assignable. */
  fillStyle: string | object
  measureText(text: string): { width: number }
  clearRect(x: number, y: number, w: number, h: number): void
  fillRect(x: number, y: number, w: number, h: number): void
  fillText(text: string, x: number, y: number): void
}

let labelCanvasFactory: (() => LabelCanvas) | null = null

/**
 * Register the offscreen-canvas factory used by every {@link SpriteLabel}.
 * Only needed on DOM-less platforms — e.g. call
 * `setLabelCanvasFactory(() => wx.createCanvas())` once at startup in a
 * WeChat mini-game. Pass `null` to restore the default
 * (`document.createElement('canvas')`).
 */
export function setLabelCanvasFactory(factory: (() => LabelCanvas) | null): void {
  labelCanvasFactory = factory
}

function createLabelCanvas(): LabelCanvas {
  if (labelCanvasFactory) return labelCanvasFactory()
  if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
    return document.createElement('canvas')
  }
  throw new Error(
    '[overworld/scene] SpriteLabel has no canvas source: no DOM `document` in this ' +
      'environment. Call setLabelCanvasFactory() first (e.g. () => wx.createCanvas() ' +
      'in a WeChat mini-game).'
  )
}

export interface SpriteLabelProps {
  /** Label text (single line). */
  text: string
  /** Text color (any canvas fillStyle). Default `#ffffff`. */
  color?: string
  /**
   * Background plate color (any canvas fillStyle, e.g.
   * `rgba(0, 0, 0, 0.6)`). Omitted = transparent background.
   */
  background?: string
  /** Text height in world units (matches drei `Text`'s `fontSize`). Default `0.4`. */
  fontSize?: number
  /** Maximum sprite width in world units; wider labels shrink uniformly. */
  maxWidth?: number
  /** Sprite position relative to the parent. Default `[0, 0, 0]`. */
  position?: Vec3
}

interface LabelTexture {
  texture: THREE.CanvasTexture
  worldWidth: number
  worldHeight: number
}

function buildLabelTexture(
  text: string,
  color: string,
  background: string | undefined,
  fontSize: number,
  maxWidth: number | undefined
): LabelTexture {
  const canvas = createLabelCanvas()
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('[overworld/scene] SpriteLabel: canvas.getContext("2d") returned null')
  }

  const font = `${SPRITE_LABEL_FONT_PX}px sans-serif`
  ctx.font = font
  const layout = computeSpriteLabelLayout({
    textWidthPx: ctx.measureText(text).width,
    fontSize,
    maxWidth,
  })

  // Resizing resets all 2D context state, so set it (font included) after.
  canvas.width = layout.canvasWidth
  canvas.height = layout.canvasHeight
  ctx.clearRect(0, 0, layout.canvasWidth, layout.canvasHeight)
  if (background) {
    ctx.fillStyle = background
    ctx.fillRect(0, 0, layout.canvasWidth, layout.canvasHeight)
  }
  ctx.font = font
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = color
  ctx.fillText(text, layout.canvasWidth / 2, layout.canvasHeight / 2)

  const texture = new THREE.CanvasTexture(canvas as unknown as HTMLCanvasElement)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.minFilter = THREE.LinearFilter

  return { texture, worldWidth: layout.worldWidth, worldHeight: layout.worldHeight }
}

/**
 * Canvas-texture sprite label. Always faces the camera (sprite semantics —
 * no `Billboard` needed, though harmless inside one) and is centered on its
 * position, like drei `Text` with `anchorX/anchorY="center"`.
 *
 * ```tsx
 * <SpriteLabel text="铁匠铺" fontSize={0.5} background="rgba(0,0,0,0.6)" />
 * ```
 */
export function SpriteLabel({
  text,
  color = '#ffffff',
  background,
  fontSize = 0.4,
  maxWidth,
  position = [0, 0, 0],
}: SpriteLabelProps) {
  const label = useMemo(
    () => buildLabelTexture(text, color, background, fontSize, maxWidth),
    [text, color, background, fontSize, maxWidth]
  )

  // Free the GPU texture when it is replaced or the label unmounts.
  useEffect(() => () => label.texture.dispose(), [label])

  return (
    <sprite position={position} scale={[label.worldWidth, label.worldHeight, 1]}>
      <spriteMaterial map={label.texture} transparent depthWrite={false} />
    </sprite>
  )
}
