import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMovementInput } from '@overworld-engine/input'
import { createWeappTouchJoystick } from '../joystick'
import type { WxTouch, WxTouchEvent } from '../wxTypes'

type Listener = (event: WxTouchEvent) => void

/** Fake wx touch/system surface with fireable event registries. */
function makeFakeWx(windowWidth = 400, windowHeight = 800) {
  const registries = {
    start: new Set<Listener>(),
    move: new Set<Listener>(),
    end: new Set<Listener>(),
    cancel: new Set<Listener>(),
  }
  const fire = (kind: keyof typeof registries, touches: WxTouch[], changed = touches) => {
    for (const cb of [...registries[kind]]) cb({ touches, changedTouches: changed })
  }
  const wx = {
    getSystemInfoSync: () => ({ windowWidth, windowHeight, pixelRatio: 2 }),
    onTouchStart: (cb: Listener) => registries.start.add(cb),
    onTouchMove: (cb: Listener) => registries.move.add(cb),
    onTouchEnd: (cb: Listener) => registries.end.add(cb),
    onTouchCancel: (cb: Listener) => registries.cancel.add(cb),
    offTouchStart: (cb: Listener) => registries.start.delete(cb),
    offTouchMove: (cb: Listener) => registries.move.delete(cb),
    offTouchEnd: (cb: Listener) => registries.end.delete(cb),
    offTouchCancel: (cb: Listener) => registries.cancel.delete(cb),
  }
  return { wx, fire, registries }
}

const touch = (identifier: number, clientX: number, clientY: number): WxTouch => ({
  identifier,
  clientX,
  clientY,
})

let fake: ReturnType<typeof makeFakeWx>

beforeEach(() => {
  fake = makeFakeWx()
  vi.stubGlobal('wx', fake.wx)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('createWeappTouchJoystick', () => {
  it('throws a helpful error when the global touch APIs are missing', () => {
    vi.stubGlobal('wx', { getSystemInfoSync: fake.wx.getSystemInfoSync })
    expect(() => createWeappTouchJoystick(createMovementInput())).toThrowError(/mini-game/i)
  })

  it('anchors at the touch-start point and writes the drag vector', () => {
    const target = createMovementInput()
    createWeappTouchJoystick(target) // Default size 120 → radius 60.

    fake.fire('start', [touch(7, 100, 400)])
    expect(target.current).toEqual({ x: 0, z: 0, running: false })

    // 30px right of the anchor at radius 60 → x = 0.5.
    fake.fire('move', [touch(7, 130, 400)])
    expect(target.current.x).toBeCloseTo(0.5, 10)
    expect(target.current.z).toBeCloseTo(0, 10)
    expect(target.current.running).toBe(false)

    // Screen-down maps to world +Z (backward), same as <VirtualJoystick>.
    fake.fire('move', [touch(7, 100, 430)])
    expect(target.current.x).toBeCloseTo(0, 10)
    expect(target.current.z).toBeCloseTo(0.5, 10)
  })

  it('applies the dead zone and clamps to the unit circle', () => {
    const target = createMovementInput()
    createWeappTouchJoystick(target, { deadZone: 0.2 })

    fake.fire('start', [touch(1, 100, 400)])
    fake.fire('move', [touch(1, 105, 400)]) // magnitude 5/60 < 0.2 → dead.
    expect(target.current).toEqual({ x: 0, z: 0, running: false })

    fake.fire('move', [touch(1, 400, 400)]) // Far beyond the radius.
    expect(Math.hypot(target.current.x, target.current.z)).toBeCloseTo(1, 10)
    expect(target.current.running).toBe(true) // Full deflection ≥ run threshold.
  })

  it('sets running only at/above the run threshold', () => {
    const target = createMovementInput()
    createWeappTouchJoystick(target, { runThreshold: 0.8 })

    fake.fire('start', [touch(1, 100, 400)])
    fake.fire('move', [touch(1, 100 + 42, 400)]) // 0.7 < 0.8
    expect(target.current.running).toBe(false)

    fake.fire('move', [touch(1, 100 + 48, 400)]) // 0.8
    expect(target.current.running).toBe(true)
  })

  it('resets to neutral on release and on cancel', () => {
    const target = createMovementInput()
    createWeappTouchJoystick(target)

    fake.fire('start', [touch(1, 100, 400)])
    fake.fire('move', [touch(1, 160, 400)])
    expect(target.current.x).toBeCloseTo(1, 10)

    fake.fire('end', [], [touch(1, 160, 400)])
    expect(target.current).toEqual({ x: 0, z: 0, running: false })

    // A fresh touch re-anchors at its own start point.
    fake.fire('start', [touch(2, 150, 700)])
    fake.fire('move', [touch(2, 120, 700)])
    expect(target.current.x).toBeCloseTo(-0.5, 10)

    fake.fire('cancel', [], [touch(2, 120, 700)])
    expect(target.current).toEqual({ x: 0, z: 0, running: false })
  })

  it("ignores touches outside the 'left-half' region and other-finger events", () => {
    const target = createMovementInput()
    createWeappTouchJoystick(target) // windowWidth 400 → region x < 200.

    fake.fire('start', [touch(1, 300, 400)]) // Right half: ignored.
    fake.fire('move', [touch(1, 360, 400)])
    expect(target.current).toEqual({ x: 0, z: 0, running: false })

    fake.fire('start', [touch(2, 100, 400)]) // Left half: grabs the stick.
    fake.fire('start', [touch(3, 150, 400)]) // Second finger: ignored while active.
    fake.fire('move', [touch(3, 190, 400)]) // Moves of other fingers: ignored.
    expect(target.current).toEqual({ x: 0, z: 0, running: false })
    fake.fire('end', [], [touch(3, 190, 400)]) // Other finger lifting: no reset.

    fake.fire('move', [touch(2, 130, 400)])
    expect(target.current.x).toBeCloseTo(0.5, 10)
  })

  it("accepts right-half touches with region: 'full'", () => {
    const target = createMovementInput()
    createWeappTouchJoystick(target, { region: 'full' })

    fake.fire('start', [touch(1, 350, 400)])
    fake.fire('move', [touch(1, 380, 400)])
    expect(target.current.x).toBeCloseTo(0.5, 10)
  })

  it('honors a custom size (deflection radius)', () => {
    const target = createMovementInput()
    createWeappTouchJoystick(target, { size: 240 }) // radius 120

    fake.fire('start', [touch(1, 100, 400)])
    fake.fire('move', [touch(1, 160, 400)]) // 60/120
    expect(target.current.x).toBeCloseTo(0.5, 10)
  })

  it('dispose() unbinds every listener and resets the target', () => {
    const target = createMovementInput()
    const joystick = createWeappTouchJoystick(target)

    fake.fire('start', [touch(1, 100, 400)])
    fake.fire('move', [touch(1, 160, 400)])
    expect(target.current.x).toBeCloseTo(1, 10)

    joystick.dispose()
    expect(target.current).toEqual({ x: 0, z: 0, running: false })
    expect(fake.registries.start.size).toBe(0)
    expect(fake.registries.move.size).toBe(0)
    expect(fake.registries.end.size).toBe(0)
    expect(fake.registries.cancel.size).toBe(0)

    fake.fire('start', [touch(2, 100, 400)])
    fake.fire('move', [touch(2, 160, 400)])
    expect(target.current).toEqual({ x: 0, z: 0, running: false })
  })
})
