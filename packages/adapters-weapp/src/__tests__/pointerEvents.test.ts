/**
 * Unit tests for the pure coordinate mapping behind the pointer bridge
 * (`touchToOffset` / `offsetToNdc` / `touchToNdc`). The stateful bridge —
 * feeding fiber's pointer pipeline from wx touches and firing `onClick` on a
 * tap — is exercised end-to-end (real WebGL + real raycast) by the wx-shim
 * harness, not here.
 */
import { describe, expect, it } from 'vitest'
import { offsetToNdc, touchToNdc, touchToOffset } from '../pointerEvents'

describe('touchToOffset', () => {
  it('equals client coords for a fullscreen canvas (origin 0,0)', () => {
    expect(touchToOffset({ clientX: 120, clientY: 300 })).toEqual({ offsetX: 120, offsetY: 300 })
  })

  it('subtracts a non-zero canvas top-left', () => {
    expect(touchToOffset({ clientX: 120, clientY: 300 }, { left: 20, top: 50 })).toEqual({
      offsetX: 100,
      offsetY: 250,
    })
  })
})

describe('offsetToNdc', () => {
  const size = { width: 400, height: 800 }

  it('maps the canvas center to the NDC origin', () => {
    expect(offsetToNdc(200, 400, size)).toEqual({ x: 0, y: 0 })
  })

  it('maps the top-left corner to (-1, +1) and bottom-right to (+1, -1)', () => {
    expect(offsetToNdc(0, 0, size)).toEqual({ x: -1, y: 1 })
    expect(offsetToNdc(400, 800, size)).toEqual({ x: 1, y: -1 })
  })

  it('flips Y (screen-down is NDC-down) and scales X linearly', () => {
    // Quarter across, three-quarters down.
    const ndc = offsetToNdc(100, 600, size)
    expect(ndc.x).toBeCloseTo(-0.5, 12)
    expect(ndc.y).toBeCloseTo(-0.5, 12)
  })
})

describe('touchToNdc', () => {
  const size = { width: 400, height: 800 }

  it('composes offset + NDC for a fullscreen canvas', () => {
    expect(touchToNdc({ clientX: 300, clientY: 200 }, size)).toEqual({ x: 0.5, y: 0.5 })
  })

  it('accounts for a canvas offset before normalizing', () => {
    // clientX 220 with canvas at left 20 → offsetX 200 → NDC x 0.
    const ndc = touchToNdc({ clientX: 220, clientY: 450 }, size, { left: 20, top: 50 })
    expect(ndc.x).toBeCloseTo(0, 12)
    expect(ndc.y).toBeCloseTo(0, 12)
  })
})
