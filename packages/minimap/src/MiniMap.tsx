/**
 * Canvas-based DOM minimap. Renders outside the three.js canvas (plain HTML
 * overlay), reads the player transform from mutable refs (no per-frame React
 * re-renders) and markers from {@link useMinimapStore}.
 */
import { useEffect, useRef, type CSSProperties, type ReactElement } from 'react'
import type { Vec3 } from '@overworld/core'
import { projectToCanvas, type WorldBounds } from './projection'
import { useMinimapStore } from './minimapStore'

/** Props for {@link MiniMap}. */
export interface MiniMapProps {
  /** World rectangle (X/Z plane) the map covers. */
  worldBounds: WorldBounds
  /** Canvas edge length in px. Defaults to 160. */
  size?: number
  /**
   * Mutable ref holding the player world position, mutated in place every
   * frame. Structurally matches `@overworld/scene`'s `playerPositionRef`,
   * but any `{ current: [x, y, z] }` object works.
   */
  playerPosition: { current: Vec3 }
  /**
   * Mutable ref holding the player Y rotation in radians (three.js
   * convention: 0 = facing −Z, i.e. map-up). When omitted the player
   * triangle always points up. Matches `@overworld/scene`'s
   * `playerRotationRef`.
   */
  playerRotation?: { current: number }
  /** Dot color per marker `kind`; `marker.color` takes precedence. */
  markerColors?: Record<string, string>
  /** Map background fill. Defaults to a translucent dark gray. */
  background?: string
  /** Corner radius in px. Defaults to 12. */
  borderRadius?: number
  /**
   * Redraw interval in ms (tracks the player refs). Defaults to 100. The
   * map additionally redraws whenever markers change.
   */
  refreshMs?: number
  style?: CSSProperties
  className?: string
}

const DEFAULT_SIZE = 160
const DEFAULT_REFRESH_MS = 100
const DEFAULT_BORDER_RADIUS = 12
const DEFAULT_BACKGROUND = 'rgba(15, 20, 30, 0.8)'
const DEFAULT_MARKER_COLOR = '#facc15'
const PLAYER_COLOR = '#4ade80'
const MARKER_RADIUS = 3
const PLAYER_TRIANGLE = 6

/** Trace a rounded-rect path (avoids relying on `ctx.roundRect`). */
function traceRoundedRect(ctx: CanvasRenderingContext2D, size: number, radius: number): void {
  const r = Math.min(radius, size / 2)
  ctx.beginPath()
  ctx.moveTo(r, 0)
  ctx.arcTo(size, 0, size, size, r)
  ctx.arcTo(size, size, 0, size, r)
  ctx.arcTo(0, size, 0, 0, r)
  ctx.arcTo(0, 0, size, 0, r)
  ctx.closePath()
}

/**
 * North-up minimap overlay. The map itself never rotates; the player
 * triangle rotates with `playerRotation`:
 *
 * ```tsx
 * import { playerPositionRef, playerRotationRef } from '@overworld/scene'
 *
 * <MiniMap
 *   worldBounds={{ minX: -50, maxX: 50, minZ: -50, maxZ: 50 }}
 *   playerPosition={playerPositionRef}
 *   playerRotation={playerRotationRef}
 *   markerColors={{ npc: '#60a5fa', shop: '#f472b6' }}
 * />
 * ```
 */
export function MiniMap(props: MiniMapProps): ReactElement {
  const {
    worldBounds,
    size = DEFAULT_SIZE,
    playerPosition,
    playerRotation,
    markerColors,
    background = DEFAULT_BACKGROUND,
    borderRadius = DEFAULT_BORDER_RADIUS,
    refreshMs = DEFAULT_REFRESH_MS,
    style,
    className,
  } = props

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { minX, maxX, minZ, maxZ } = worldBounds

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio ?? 1) : 1
    canvas.width = size * dpr
    canvas.height = size * dpr

    const config = { worldBounds: { minX, maxX, minZ, maxZ }, size }

    const draw = (): void => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, size, size)

      ctx.save()
      traceRoundedRect(ctx, size, borderRadius)
      ctx.clip()
      ctx.fillStyle = background
      ctx.fillRect(0, 0, size, size)

      // Markers.
      for (const marker of Object.values(useMinimapStore.getState().markers)) {
        const [px, py] = projectToCanvas(marker.position[0], marker.position[2], config)
        ctx.fillStyle =
          marker.color ??
          (marker.kind !== undefined ? markerColors?.[marker.kind] : undefined) ??
          DEFAULT_MARKER_COLOR
        ctx.beginPath()
        ctx.arc(px, py, MARKER_RADIUS, 0, Math.PI * 2)
        ctx.fill()
      }

      // Player: triangle oriented by Y rotation (0 = up / −Z).
      const [x, , z] = playerPosition.current
      const [px, py] = projectToCanvas(x, z, config)
      ctx.translate(px, py)
      ctx.rotate(-(playerRotation?.current ?? 0))
      ctx.fillStyle = PLAYER_COLOR
      ctx.beginPath()
      ctx.moveTo(0, -PLAYER_TRIANGLE)
      ctx.lineTo(PLAYER_TRIANGLE * 0.7, PLAYER_TRIANGLE)
      ctx.lineTo(-PLAYER_TRIANGLE * 0.7, PLAYER_TRIANGLE)
      ctx.closePath()
      ctx.fill()
      ctx.restore()
    }

    draw()
    const interval = setInterval(draw, refreshMs)
    const unsubscribe = useMinimapStore.subscribe(draw)
    return () => {
      clearInterval(interval)
      unsubscribe()
    }
  }, [
    minX,
    maxX,
    minZ,
    maxZ,
    size,
    playerPosition,
    playerRotation,
    markerColors,
    background,
    borderRadius,
    refreshMs,
  ])

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ width: size, height: size, borderRadius, ...style }}
    />
  )
}
