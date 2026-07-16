/**
 * Regression guards for the benchmark workloads.
 *
 * Deliberately NOT time-based (timings are machine/load dependent → flaky in
 * CI). Every guard checks a **count invariant** that only breaks when the
 * underlying algorithm regresses: search effort, path optimality, exact call
 * counts, exact progress counts, buffer bounds.
 */
import { describe, expect, it } from 'vitest'
import {
  createHierarchicalGrid,
  createNavGrid,
  findPath,
  findPathHierarchical,
} from '@overworld-engine/ai'
import { createConditionRegistry, createEffectRegistry, EventBus } from '@overworld-engine/core'
import { createQuestEngine } from '@overworld-engine/quest'
import { createSnapshotBuffer } from '@overworld-engine/net'
// @ts-expect-error -- plain-JS benchmark fixture (no type declarations)
import { makeObstacleGrid } from '../suites/pathfinding.mjs'
// @ts-expect-error -- plain-JS benchmark harness (no type declarations)
import { mulberry32 } from '../lib.mjs'

function pathLength(path: [number, number][]): number {
  let length = 0
  for (let i = 1; i < path.length; i++) {
    length += Math.hypot(path[i]![0] - path[i - 1]![0], path[i]![1] - path[i - 1]![1])
  }
  return length
}

describe('pathfinding search effort', () => {
  it('HPA* visits fewer than half the cells of plain A* on the 200x200 map', () => {
    const size = 200
    const grid = makeObstacleGrid(size, 1234 + size) // same map as the benchmark suite
    const hgrid = createHierarchicalGrid(grid, { clusterSize: 16 })

    const plainStats = { visited: 0 }
    const hpaStats = { visited: 0 }
    const plain = findPath(grid, [2, 2], [size - 2, size - 2], { stats: plainStats })
    const hpa = findPathHierarchical(hgrid, [2, 2], [size - 2, size - 2], { stats: hpaStats })

    expect(plain).not.toBeNull()
    expect(hpa).not.toBeNull()
    expect(plainStats.visited).toBeGreaterThan(0)
    expect(hpaStats.visited).toBeGreaterThan(0)
    expect(hpaStats.visited).toBeLessThan(plainStats.visited / 2)
  })
})

describe('pathfinding path quality', () => {
  it('paths stay within 1.3x of the straight-line lower bound on an open field', () => {
    const size = 100
    const grid = createNavGrid({
      bounds: { minX: 0, maxX: size, minZ: 0, maxZ: size },
      cellSize: 1,
      agentRadius: 0.4,
    })
    const hgrid = createHierarchicalGrid(grid, { clusterSize: 16 })
    const rng = mulberry32(2718)

    for (let i = 0; i < 25; i++) {
      const from: [number, number] = [1 + rng() * (size - 2), 1 + rng() * (size - 2)]
      const to: [number, number] = [1 + rng() * (size - 2), 1 + rng() * (size - 2)]
      const straight = Math.hypot(to[0] - from[0], to[1] - from[1])
      if (straight < 2) continue

      const plain = findPath(grid, from, to)
      const hpa = findPathHierarchical(hgrid, from, to)
      expect(plain).not.toBeNull()
      expect(hpa).not.toBeNull()
      expect(pathLength(plain!)).toBeLessThanOrEqual(straight * 1.3)
      expect(pathLength(hpa!)).toBeLessThanOrEqual(straight * 1.3)
    }
  })
})

describe('event bus call counts', () => {
  it('emitting with 0 listeners performs zero listener calls', () => {
    const bus = new EventBus<{ a: number; b: number }>()
    let calls = 0
    bus.on('b', () => calls++) // listener on a *different* event
    bus.emit('a', 1)
    expect(calls).toBe(0)
  })

  it('N listeners are each called exactly once per emit (N calls total)', () => {
    const bus = new EventBus<{ tick: number }>()
    const N = 10
    const perListener = new Array<number>(N).fill(0)
    for (let i = 0; i < N; i++) bus.on('tick', () => perListener[i]!++)

    const EMITS = 100
    for (let e = 0; e < EMITS; e++) bus.emit('tick', e)

    expect(perListener.every((count) => count === EMITS)).toBe(true)
    expect(perListener.reduce((a, b) => a + b, 0)).toBe(N * EMITS)
  })

  it('unsubscribed listeners are never called again', () => {
    const bus = new EventBus<{ tick: number }>()
    let calls = 0
    const off = bus.on('tick', () => calls++)
    bus.emit('tick', 1)
    off()
    bus.emit('tick', 2)
    expect(calls).toBe(1)
  })
})

describe('quest engine progress counts', () => {
  it('1k matching events produce exactly 1k progress (no double-count, no loss)', () => {
    const bus = new EventBus<Record<string, unknown>>()
    const engine = createQuestEngine({
      quests: [
        {
          id: 'collect',
          objectives: [
            { id: 'coins', target: 5000, trigger: { event: 'item:added', filter: { itemId: 'coin' } } },
          ],
        },
        {
          id: 'other',
          objectives: [
            { id: 'gems', target: 5000, trigger: { event: 'item:added', filter: { itemId: 'gem' } } },
          ],
        },
      ],
      conditions: createConditionRegistry(),
      effects: createEffectRegistry(),
      events: bus as never,
    })
    engine.getState().startQuest('collect')
    engine.getState().startQuest('other')

    for (let i = 0; i < 1000; i++) {
      bus.emit('item:added', { itemId: 'coin', quantity: 1, total: i + 1 })
    }

    expect(engine.getState().active['collect']!.objectives['coins']!.current).toBe(1000)
    // Non-matching quest untouched — the filter really gates counting.
    expect(engine.getState().active['other']!.objectives['gems']!.current).toBe(0)
    engine.getState().dispose()
  })

  it('progress clamps at target and completes the quest exactly once', () => {
    const bus = new EventBus<Record<string, unknown>>()
    let completions = 0
    bus.on('quest:completed' as never, () => completions++)
    const engine = createQuestEngine({
      quests: [
        { id: 'short', objectives: [{ id: 'o', target: 10, trigger: { event: 'interact' } }] },
      ],
      conditions: createConditionRegistry(),
      effects: createEffectRegistry(),
      events: bus as never,
    })
    engine.getState().startQuest('short')

    for (let i = 0; i < 50; i++) bus.emit('interact', { kind: 'npc', id: 'x' })

    expect(completions).toBe(1)
    expect(engine.getState().completed).toEqual(['short'])
    expect(engine.getState().active['short']).toBeUndefined()
    engine.getState().dispose()
  })
})

describe('snapshot buffer bounds', () => {
  it('never exceeds maxSnapshots across 10k pushes', () => {
    let time = 0
    const maxSnapshots = 32
    const buffer = createSnapshotBuffer<{ x: number }>({
      delayMs: 120,
      maxSnapshots,
      now: () => time,
    })
    let maxObserved = 0
    for (let i = 0; i < 10000; i++) {
      time += 16
      buffer.push({ x: i })
      if (buffer.size > maxObserved) maxObserved = buffer.size
    }
    expect(maxObserved).toBeLessThanOrEqual(maxSnapshots)
    expect(buffer.size).toBe(maxSnapshots)

    // The retained snapshots are the newest ones (sample returns the last).
    time += 120
    const sampled = buffer.sample((a, b, t) => (t < 1 ? b : b))
    expect(sampled).toEqual({ x: 9999 })
  })
})
