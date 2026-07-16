/**
 * `createWeappCanvasRoot` unit tests cover the pure size/dpr math and the
 * root's configure/render/dispose bookkeeping through the `createRootImpl`
 * test seam. Actual GL rendering is exercised by the wx-shim browser
 * harness (real WebGL), not unit tests.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import {
  MAX_CANVAS_DPR,
  computeCanvasRootSize,
  createWeappCanvasRoot,
  type CreateRootFn,
} from '../canvasRoot'
import type { WxCanvas } from '../wxTypes'

describe('computeCanvasRootSize', () => {
  const info = { windowWidth: 390, windowHeight: 844, pixelRatio: 3 }

  it('uses the window size and clamps the device dpr to 2', () => {
    expect(computeCanvasRootSize(info)).toEqual({ width: 390, height: 844, dpr: 2 })
    expect(computeCanvasRootSize({ ...info, pixelRatio: 1.5 }).dpr).toBe(1.5)
  })

  it('clamps the dpr override into [1, MAX_CANVAS_DPR]', () => {
    expect(computeCanvasRootSize(info, 1.25).dpr).toBe(1.25)
    expect(computeCanvasRootSize(info, 4).dpr).toBe(MAX_CANVAS_DPR)
    expect(computeCanvasRootSize(info, 0.5).dpr).toBe(1)
  })
})

interface FakeRoot {
  configure: ReturnType<typeof vi.fn>
  render: ReturnType<typeof vi.fn>
  unmount: ReturnType<typeof vi.fn>
}

function makeFakeRootFactory() {
  const roots: FakeRoot[] = []
  const canvases: unknown[] = []
  const createRootImpl: CreateRootFn = (canvas) => {
    canvases.push(canvas)
    const root: FakeRoot = {
      configure: vi.fn(),
      render: vi.fn(),
      unmount: vi.fn(),
    }
    root.configure.mockReturnValue(root)
    roots.push(root)
    return root as unknown as ReturnType<CreateRootFn>
  }
  return { roots, canvases, createRootImpl }
}

function makeFakeWx(created: WxCanvas[] = []) {
  return {
    getSystemInfoSync: () => ({ windowWidth: 320, windowHeight: 568, pixelRatio: 3 }),
    createCanvas: () => {
      const canvas: WxCanvas = { width: 0, height: 0, getContext: () => null }
      created.push(canvas)
      return canvas
    },
  }
}

beforeEach(() => {
  vi.stubGlobal('wx', makeFakeWx())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('createWeappCanvasRoot', () => {
  it('creates the default canvas, sizes its backing store and configures the root', () => {
    const created: WxCanvas[] = []
    vi.stubGlobal('wx', makeFakeWx(created))
    const { roots, canvases, createRootImpl } = makeFakeRootFactory()

    const handle = createWeappCanvasRoot({ createRootImpl })

    expect(created).toHaveLength(1)
    expect(handle.canvas).toBe(created[0])
    expect(canvases[0]).toBe(created[0]) // The same canvas reaches createRoot.
    expect(handle.size).toEqual({ width: 320, height: 568, dpr: 2 })
    expect(handle.canvas.width).toBe(640) // 320 × dpr 2
    expect(handle.canvas.height).toBe(1136)

    expect(roots[0]!.configure).toHaveBeenCalledExactlyOnceWith({
      gl: { antialias: true, alpha: false, powerPreference: 'high-performance' },
      size: { width: 320, height: 568, top: 0, left: 0, updateStyle: false },
      dpr: 2,
      frameloop: 'always',
      events: undefined,
    })
  })

  it('uses a provided canvas and dpr override, and merges extra renderProps', () => {
    const { roots, createRootImpl } = makeFakeRootFactory()
    const canvas: WxCanvas = { width: 0, height: 0, getContext: () => null }

    const handle = createWeappCanvasRoot({
      canvas,
      dpr: 1,
      renderProps: { shadows: true, frameloop: 'demand' },
      createRootImpl,
    })

    expect(handle.canvas).toBe(canvas)
    expect(canvas.width).toBe(320)
    const config = roots[0]!.configure.mock.calls[0]![0] as Record<string, unknown>
    expect(config.dpr).toBe(1)
    expect(config.shadows).toBe(true)
    expect(config.frameloop).toBe('demand') // renderProps win over defaults.
  })

  it('render() delegates to the root; dispose() unmounts once and blocks later renders', () => {
    const { roots, createRootImpl } = makeFakeRootFactory()
    const handle = createWeappCanvasRoot({ createRootImpl })
    const root = roots[0]!

    const node = 'scene' as unknown as ReactNode
    handle.render(node)
    expect(root.render).toHaveBeenCalledExactlyOnceWith(node)

    handle.dispose()
    handle.dispose() // Idempotent.
    expect(root.unmount).toHaveBeenCalledTimes(1)
    expect(() => handle.render(node)).toThrowError(/disposed/)
  })

  it('throws helpfully without wx.createCanvas (mini-program) when no canvas is given', () => {
    vi.stubGlobal('wx', { getSystemInfoSync: () => ({ windowWidth: 1, windowHeight: 1, pixelRatio: 1 }) })
    const { createRootImpl } = makeFakeRootFactory()
    expect(() => createWeappCanvasRoot({ createRootImpl })).toThrowError(/mini-game/i)
  })
})
