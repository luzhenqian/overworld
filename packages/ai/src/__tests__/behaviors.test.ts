import type { Vec3 } from '@overworld-engine/core'
import { describe, expect, it } from 'vitest'
import { createAgent } from '../behaviors'
import { createNavGrid } from '../grid'

/** Deterministic random source consuming `values` in order (0 when exhausted). */
function sequenceRandom(...values: number[]): () => number {
  let index = 0
  return () => values[index++] ?? 0
}

/** Run `update(stepMs)` repeatedly, collecting every `arrived` emission. */
function run(agent: ReturnType<typeof createAgent>, steps: number, stepMs = 100): number[] {
  const arrivals: number[] = []
  for (let i = 0; i < steps; i++) {
    const status = agent.update(stepMs)
    if (status.arrived !== undefined) arrivals.push(status.arrived)
  }
  return arrivals
}

describe('createAgent — movement fundamentals', () => {
  it('speed is world units per second: update(500) at speed 2 moves ~1 unit', () => {
    const agent = createAgent({ position: [0, 0], speed: 2 })
    agent.patrol([[10, 0]])
    agent.update(500)
    expect(agent.position[0]).toBeCloseTo(1)
    expect(agent.position[1]).toBeCloseTo(0)
    agent.update(250)
    expect(agent.position[0]).toBeCloseTo(1.5)
  })

  it('heading follows atan2(dx, dz): 0 = +Z, PI/2 = +X', () => {
    const towardZ = createAgent({ position: [0, 0], speed: 1 })
    towardZ.patrol([[0, 5]])
    towardZ.update(100)
    expect(towardZ.heading).toBeCloseTo(0)

    const towardX = createAgent({ position: [0, 0], speed: 1 })
    towardX.patrol([[5, 0]])
    towardX.update(100)
    expect(towardX.heading).toBeCloseTo(Math.PI / 2)

    const towardNegZ = createAgent({ position: [0, 0], speed: 1 })
    towardNegZ.patrol([[0, -5]])
    towardNegZ.update(100)
    expect(Math.abs(towardNegZ.heading)).toBeCloseTo(Math.PI)
  })

  it('stops exactly on the destination and reports isMoving transitions', () => {
    const agent = createAgent({ position: [0, 0], speed: 2 })
    agent.patrol([[1, 0]], { pauseMs: 60_000 })
    const moving = agent.update(600) // 1.2 units of budget for a 1-unit leg
    expect(moving.isMoving).toBe(true)
    expect(agent.position).toEqual([1, 0])
    const paused = agent.update(100)
    expect(paused.isMoving).toBe(false)
    expect(agent.position).toEqual([1, 0])
  })

  it('idle agents do not move and keep their heading', () => {
    const agent = createAgent({ position: [3, 4], speed: 2 })
    agent.patrol([[3, 9]])
    agent.update(500)
    const headingBefore = agent.heading
    agent.idle()
    const status = agent.update(1000)
    expect(status.behavior).toBe('idle')
    expect(status.isMoving).toBe(false)
    expect(agent.position).toEqual([3, 5])
    expect(agent.heading).toBe(headingBefore)
  })

  it('carries leftover time across an arrival within one update', () => {
    // 1 unit to waypoint 0, then onward to waypoint 1: 1500ms at speed 2
    // covers 3 units total in a single update call.
    const agent = createAgent({ position: [0, 0], speed: 2 })
    agent.patrol([
      [1, 0],
      [1, 10],
    ])
    agent.update(1500)
    expect(agent.position[0]).toBeCloseTo(1)
    expect(agent.position[1]).toBeCloseTo(2)
  })
})

describe('createAgent — patrol', () => {
  it('loops waypoints 0 -> 1 -> 0 -> 1 by default', () => {
    const agent = createAgent({ position: [0, 0], speed: 1 })
    agent.patrol([
      [1, 0],
      [1, 1],
    ])
    // Perimeter legs: 1 + 1 + then back from [1,1] to [1,0] = 1...
    const arrivals = run(agent, 50, 100)
    expect(arrivals.slice(0, 4)).toEqual([0, 1, 0, 1])
  })

  it('ping-pongs when loop is false', () => {
    const agent = createAgent({ position: [0, 0], speed: 10 })
    agent.patrol(
      [
        [1, 0],
        [2, 0],
        [3, 0],
      ],
      { loop: false }
    )
    const arrivals = run(agent, 30, 50)
    expect(arrivals.slice(0, 6)).toEqual([0, 1, 2, 1, 0, 1])
  })

  it('honors pauseMs at each waypoint', () => {
    const agent = createAgent({ position: [0, 0], speed: 1 })
    agent.patrol(
      [
        [1, 0],
        [2, 0],
      ],
      { pauseMs: 300 }
    )
    agent.update(1000) // arrive at [1,0] exactly, pause starts
    expect(agent.position).toEqual([1, 0])
    agent.update(200) // 200/300 of the pause
    expect(agent.position).toEqual([1, 0])
    expect(agent.isMoving).toBe(false)
    agent.update(200) // pause ends after 100, then 100ms of walking
    expect(agent.position[0]).toBeCloseTo(1.1)
  })

  it('routes patrol legs through the grid, avoiding obstacles', () => {
    const grid = createNavGrid({
      bounds: { minX: 0, maxX: 20, minZ: 0, maxZ: 20 },
      obstacles: [{ x: 10, z: 10, radius: 2 }],
      agentRadius: 0.5,
    })
    const agent = createAgent({ position: [10.5, 2.5], speed: 4, grid })
    agent.patrol([[10.5, 17.5]])
    for (let i = 0; i < 300; i++) {
      agent.update(16)
      const distance = Math.hypot(agent.position[0] - 10, agent.position[1] - 10)
      // Blocking radius is 2.5 (2 + agentRadius); grid rasterization can let
      // positions dip up to a cell half-diagonal below that, never inside 2.
      expect(distance).toBeGreaterThan(2.5 - Math.SQRT1_2)
    }
    expect(Math.hypot(agent.position[0] - 10.5, agent.position[1] - 17.5)).toBeLessThan(0.01)
  })
})

describe('createAgent — wander', () => {
  it('is deterministic with an injected random source', () => {
    // angle = 0.25 * 2PI = PI/2, distance = 0.5 * 4 = 2
    // => target = center + [cos, sin] * 2 = [0, 2] relative.
    const agent = createAgent({ position: [0, 0], speed: 2 })
    agent.wander({ center: [0, 0], radius: 4, random: sequenceRandom(0.25, 0.5) })
    agent.update(1000) // exactly 2 units
    expect(agent.position[0]).toBeCloseTo(Math.cos(Math.PI / 2) * 2)
    expect(agent.position[1]).toBeCloseTo(Math.sin(Math.PI / 2) * 2)
  })

  it('consumes randoms as angle, distance, then pause duration', () => {
    const agent = createAgent({ position: [0, 0], speed: 2 })
    agent.wander({
      center: [0, 0],
      radius: 4,
      pauseMsRange: [100, 300],
      // Leg 1: angle 0, distance 0.25*4=1. Pause: 100 + 0.5*200 = 200ms.
      // Leg 2: angle 0.25 (PI/2), distance 4.
      random: sequenceRandom(0, 0.25, 0.5, 0.25, 1),
    })
    const first = agent.update(500) // 1 unit => arrive at [cos0, sin0] * 1 = [1, 0]
    expect(first.arrived).toBe(0)
    expect(agent.position[0]).toBeCloseTo(1)
    expect(agent.position[1]).toBeCloseTo(0)
    agent.update(200) // exactly the rolled pause: no movement
    expect(agent.position[0]).toBeCloseTo(1)
    agent.update(500) // 1 unit toward leg-2 target [1+..., ...]
    expect(agent.isMoving).toBe(true)
  })

  it('keeps every picked target within radius of the center', () => {
    const random = sequenceRandom(0.1, 0.9, 0.6, 0.7, 0.33, 0.44, 0.8, 0.2)
    const agent = createAgent({ position: [5, 5], speed: 50 })
    agent.wander({ center: [5, 5], radius: 3, random })
    for (let i = 0; i < 40; i++) {
      agent.update(50)
      expect(Math.hypot(agent.position[0] - 5, agent.position[1] - 5)).toBeLessThanOrEqual(3 + 1e-6)
    }
  })

  it('respects the grid: wandering never enters obstacles', () => {
    const grid = createNavGrid({
      bounds: { minX: 0, maxX: 12, minZ: 0, maxZ: 12 },
      obstacles: [{ x: 6, z: 6, radius: 1 }],
      agentRadius: 0.5,
    })
    const agent = createAgent({ position: [2.5, 2.5], speed: 3, grid, random: sequenceRandom(0.1, 0.8, 0.35, 0.9, 0.6, 0.5, 0.85, 0.3, 0.2, 0.7) })
    agent.wander({ center: [6, 6], radius: 5 })
    for (let i = 0; i < 300; i++) {
      agent.update(16)
      // Blocking radius 1.5 minus the rasterization margin (cell half-diagonal).
      expect(Math.hypot(agent.position[0] - 6, agent.position[1] - 6)).toBeGreaterThan(
        1.5 - Math.SQRT1_2
      )
    }
  })
})

describe('createAgent — follow', () => {
  it('walks toward a { current: [x, y, z] } ref and stops at stopDistance', () => {
    const target: { current: Vec3 } = { current: [10, 0, 0] }
    const agent = createAgent({ position: [0, 0], speed: 2 })
    agent.follow(target, { stopDistance: 1.5 })
    const arrivals = run(agent, 60, 100)
    expect(arrivals).toEqual([0])
    const distance = Math.hypot(agent.position[0] - 10, agent.position[1])
    expect(distance).toBeLessThanOrEqual(1.5 + 1e-6)
    expect(distance).toBeGreaterThan(1.0)
    expect(agent.isMoving).toBe(false)
  })

  it('does not start moving when already within stopDistance', () => {
    const agent = createAgent({ position: [0, 0], speed: 2 })
    agent.follow(() => [0.5, 0], { stopDistance: 1 })
    const status = agent.update(500)
    expect(status.isMoving).toBe(false)
    expect(agent.position).toEqual([0, 0])
  })

  it('repaths at the throttled interval when the target moves', () => {
    const target: { current: Vec3 } = { current: [4, 0, 0] }
    const agent = createAgent({ position: [0, 0], speed: 2 })
    agent.follow(target, { stopDistance: 0.5, repathMs: 400 })

    agent.update(100) // plans toward [4, 0]; heading = +X
    expect(agent.heading).toBeCloseTo(Math.PI / 2)

    target.current = [0.4, 0, 8] // target moves; next repath after 400ms
    agent.update(100) // 200ms elapsed since plan — still on the old path
    expect(agent.heading).toBeCloseTo(Math.PI / 2)

    agent.update(300) // crosses the 400ms throttle => replan toward [0.4, 8]
    expect(Math.abs(agent.heading)).toBeLessThan(Math.PI / 4) // now heading mostly +Z

    const arrivals = run(agent, 80, 100)
    expect(arrivals).toEqual([0])
    expect(Math.hypot(agent.position[0] - 0.4, agent.position[1] - 8)).toBeLessThanOrEqual(0.5 + 1e-6)
  })

  it('resumes following after the target moves away again', () => {
    const target: { current: Vec3 } = { current: [2, 0, 0] }
    const agent = createAgent({ position: [0, 0], speed: 2 })
    agent.follow(target, { stopDistance: 1, repathMs: 100 })
    run(agent, 20, 100) // reach stop distance
    expect(agent.isMoving).toBe(false)
    target.current = [8, 0, 0]
    run(agent, 40, 100)
    expect(Math.hypot(agent.position[0] - 8, agent.position[1])).toBeLessThanOrEqual(1 + 1e-6)
  })

  it('follows a function target through a grid without touching obstacles', () => {
    const grid = createNavGrid({
      bounds: { minX: 0, maxX: 20, minZ: 0, maxZ: 20 },
      obstacles: [{ x: 10, z: 5, radius: 2 }],
      agentRadius: 0.5,
    })
    const agent = createAgent({ position: [3.5, 5.5], speed: 4, grid })
    agent.follow(() => [17.5, 5.5], { stopDistance: 0.5 })
    for (let i = 0; i < 300; i++) {
      agent.update(16)
      expect(Math.hypot(agent.position[0] - 10, agent.position[1] - 5)).toBeGreaterThan(
        2.5 - Math.SQRT1_2
      )
    }
    expect(Math.hypot(agent.position[0] - 17.5, agent.position[1] - 5.5)).toBeLessThanOrEqual(
      0.5 + 1e-6
    )
  })
})

describe('createAgent — goTo', () => {
  it('reports goTo with heading/isMoving in transit, then idles at the point', () => {
    const agent = createAgent({ position: [0, 0], speed: 2 })
    agent.goTo([3, 0])
    const transit = agent.update(500) // 1 of 3 units
    expect(transit.behavior).toBe('goTo')
    expect(transit.isMoving).toBe(true)
    expect(agent.heading).toBeCloseTo(Math.PI / 2)
    expect(agent.position[0]).toBeCloseTo(1)

    const arrival = agent.update(1500) // covers the remaining 2 units + spare
    expect(arrival.arrived).toBe(0)
    expect(agent.position).toEqual([3, 0])
    expect(agent.behavior).toBe('idle')

    const after = agent.update(1000)
    expect(after.isMoving).toBe(false)
    expect(agent.position).toEqual([3, 0])
  })

  it('routes through the grid and idles on arrival', () => {
    const grid = createNavGrid({
      bounds: { minX: 0, maxX: 20, minZ: 0, maxZ: 20 },
      obstacles: [{ x: 10, z: 10, radius: 2 }],
      agentRadius: 0.5,
    })
    const agent = createAgent({ position: [10.5, 2.5], speed: 4, grid })
    agent.goTo([10.5, 17.5])
    for (let i = 0; i < 300; i++) {
      agent.update(16)
      expect(Math.hypot(agent.position[0] - 10, agent.position[1] - 10)).toBeGreaterThan(
        2.5 - Math.SQRT1_2
      )
    }
    expect(Math.hypot(agent.position[0] - 10.5, agent.position[1] - 17.5)).toBeLessThan(0.01)
    expect(agent.behavior).toBe('idle')
  })

  it('gives up to idle after a few retries when the point is unreachable', () => {
    // A huge circle splits the grid into disconnected corner pockets: no
    // route exists from the bottom-left corner to the top-right one.
    const grid = createNavGrid({
      bounds: { minX: 0, maxX: 10, minZ: 0, maxZ: 10 },
      obstacles: [{ x: 5, z: 5, radius: 4.6 }],
      agentRadius: 0.5,
    })
    const agent = createAgent({ position: [0.5, 0.5], speed: 2, grid })
    agent.goTo([9.5, 9.5])

    agent.update(100) // plan #1 fails -> 500ms retry pause
    expect(agent.behavior).toBe('goTo')
    expect(agent.isMoving).toBe(false)
    agent.update(500) // pause runs out, plan #2 fails -> another pause
    expect(agent.behavior).toBe('goTo')
    agent.update(500) // plan #3 fails -> gives up
    expect(agent.behavior).toBe('idle')
    expect(agent.position).toEqual([0.5, 0.5])
  })
})
