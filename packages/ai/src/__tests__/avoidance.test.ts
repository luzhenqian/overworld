import { describe, expect, it } from 'vitest'
import { deflect, segmentHitsCircle, steerStep } from '../avoidance'
import { createAgent } from '../behaviors'
import { createNavGrid } from '../grid'
import type { Obstacle } from '../grid'

describe('segmentHitsCircle', () => {
  it('detects a segment passing through a circle', () => {
    expect(segmentHitsCircle(0, 0, 10, 0, 5, 0, 1)).toBe(true) // straight through
    expect(segmentHitsCircle(0, 0, 10, 0, 5, 0.5, 1)).toBe(true) // offset but within
    expect(segmentHitsCircle(0, 0, 2, 0, 5, 0, 4)).toBe(true) // endpoint inside
  })

  it('misses circles far from the segment', () => {
    expect(segmentHitsCircle(0, 0, 10, 0, 5, 2, 1)).toBe(false) // parallel, too far
    expect(segmentHitsCircle(0, 0, 1, 0, 5, 0, 1)).toBe(false) // stops well short
    expect(segmentHitsCircle(0, 0, 10, 0, -3, 0, 1)).toBe(false) // behind the start
  })

  it('counts exact tangency as a hit', () => {
    expect(segmentHitsCircle(0, 0, 10, 0, 5, 1, 1)).toBe(true) // grazing tangent
    expect(segmentHitsCircle(0, 0, 10, 0, 5, 1.0001, 1)).toBe(false) // just past it
  })

  it('treats zero-length segments as a point test', () => {
    expect(segmentHitsCircle(3, 3, 3, 3, 3, 3.5, 1)).toBe(true)
    expect(segmentHitsCircle(3, 3, 3, 3, 3, 5, 1)).toBe(false)
  })
})

describe('deflect', () => {
  it('rotates the direction like heading (from +Z toward +X) and preserves magnitude', () => {
    // +Z rotated by +90° faces +X (heading convention: atan2(dx, dz)).
    const [x1, z1] = deflect(0, 1, Math.PI / 2)
    expect(x1).toBeCloseTo(1)
    expect(z1).toBeCloseTo(0)

    const [x2, z2] = deflect(0, 1, -Math.PI / 2)
    expect(x2).toBeCloseTo(-1)
    expect(z2).toBeCloseTo(0)

    const [x3, z3] = deflect(3, 4, 0.7)
    expect(Math.hypot(x3, z3)).toBeCloseTo(5)
  })
})

describe('steerStep', () => {
  it('returns the forward direction when the probe is clear', () => {
    const obstacles: Obstacle[] = [{ x: 0, z: 50, radius: 1 }]
    expect(steerStep(obstacles, 0, 0, 1, 0, 1.5, 0.4)).toEqual([1, 0])
  })

  it('deflects deterministically when forward is blocked, null when surrounded', () => {
    const blocked: Obstacle[] = [{ x: 2, z: 0, radius: 1 }]
    const first = steerStep(blocked, 0, 0, 1, 0, 1.5, 0.4)
    const second = steerStep(blocked, 0, 0, 1, 0, 1.5, 0.4)
    expect(first).not.toBeNull()
    expect(first).toEqual(second) // no randomness
    expect(first![0]).not.toBe(1) // actually deflected off the forward ray

    // The agent sits inside this inflated circle: every direction hits.
    const surrounded: Obstacle[] = [{ x: 0.5, z: 0, radius: 3 }]
    expect(steerStep(surrounded, 0, 0, 1, 0, 1.5, 0.4)).toBeNull()
  })
})

describe('createAgent — dynamic obstacle avoidance', () => {
  /** Straight-line walk 0,0 -> 10,0 with one dynamic obstacle in the way. */
  function walkPastObstacle() {
    const obstacles: Obstacle[] = [{ x: 5, z: 0, radius: 1 }]
    const agent = createAgent({
      position: [0, 0],
      speed: 2,
      avoid: { obstacles: () => obstacles },
    })
    agent.goTo([10, 0])
    const trace: [number, number][] = []
    for (let i = 0; i < 800 && agent.behavior !== 'idle'; i++) {
      agent.update(16)
      trace.push([agent.position[0], agent.position[1]])
    }
    return { agent, trace }
  }

  it('deflects around an obstacle on the way and still reaches the goal', () => {
    const { agent, trace } = walkPastObstacle()
    expect(agent.behavior).toBe('idle') // goTo finished
    expect(agent.position[0]).toBeCloseTo(10)
    expect(agent.position[1]).toBeCloseTo(0)
    // Never inside the inflated obstacle (radius 1 + agentRadius 0.4).
    for (const [x, z] of trace) {
      expect(Math.hypot(x - 5, z)).toBeGreaterThan(1.4 - 1e-9)
    }
    // It actually left the straight line to get around.
    expect(Math.max(...trace.map(([, z]) => Math.abs(z)))).toBeGreaterThan(0.5)
  })

  it('is deterministic: identical runs produce identical traces', () => {
    const a = walkPastObstacle()
    const b = walkPastObstacle()
    expect(a.trace).toEqual(b.trace)
  })

  it('does not move while fully surrounded and never enters the blocker', () => {
    const obstacles: Obstacle[] = [{ x: 0.5, z: 0, radius: 3 }] // agent inside
    const agent = createAgent({
      position: [0, 0],
      speed: 2,
      avoid: { obstacles: () => obstacles },
    })
    agent.goTo([10, 0])
    for (let i = 0; i < 50; i++) {
      const status = agent.update(16)
      expect(status.isMoving).toBe(false)
      expect(agent.position).toEqual([0, 0])
    }
    expect(agent.behavior).toBe('goTo') // still trying, just blocked
  })

  it('re-paths via the grid after stuckAfterMs and escapes a blocked pocket', () => {
    const grid = createNavGrid({
      bounds: { minX: 0, maxX: 21, minZ: 0, maxZ: 21 },
      agentRadius: 0.4,
    })
    // A pocket open only behind the agent: forward and every deflection
    // (±30°/±60°/±90°) are blocked, so local steering alone cannot escape.
    const obstacles: Obstacle[] = [
      { x: 12.5, z: 10.5, radius: 1.2 },
      { x: 10.5, z: 12.5, radius: 1.2 },
      { x: 10.5, z: 8.5, radius: 1.2 },
    ]
    const agent = createAgent({
      position: [10.5, 10.5],
      speed: 3,
      grid,
      avoid: { obstacles: () => obstacles, stuckAfterMs: 300 },
    })
    agent.goTo([17.5, 10.5])

    // First update plans a straight path on the (still empty) grid and is
    // immediately blocked by the dynamic obstacles.
    agent.update(16)
    expect(agent.position).toEqual([10.5, 10.5])

    // The game syncs the blockage into the grid (as it would each frame).
    for (const o of obstacles) grid.blockCircle(o.x, o.z, o.radius)

    // Still pinned until the stuck threshold passes (16 + 17*16 = 288ms < 300).
    for (let i = 0; i < 17; i++) agent.update(16)
    expect(agent.position).toEqual([10.5, 10.5])
    expect(agent.isMoving).toBe(false)

    // Crossing stuckAfterMs re-plans on the updated grid; the new path leads
    // backward out of the pocket, so the agent starts moving again.
    let movedAt = -1
    for (let i = 0; i < 20 && movedAt < 0; i++) {
      if (agent.update(16).isMoving) movedAt = i
    }
    expect(movedAt).toBeGreaterThanOrEqual(0)

    // ... and eventually reaches the goal around the pocket.
    for (let i = 0; i < 4000 && agent.behavior !== 'idle'; i++) agent.update(16)
    expect(agent.behavior).toBe('idle')
    expect(Math.hypot(agent.position[0] - 17.5, agent.position[1] - 10.5)).toBeLessThan(0.01)
  })
})
