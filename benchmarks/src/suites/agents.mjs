import {
  action,
  condition,
  createAgent,
  createBehaviorTree,
  selector,
  sequence,
  wait,
} from '@overworld-engine/ai'
import { bench, mulberry32 } from '../lib.mjs'
import { makeObstacleGrid } from './pathfinding.mjs'

const FRAME_MS = 1000 / 60

export function run() {
  const results = []

  // 50 wandering agents on a 100×100 grid; one op = one 16.7ms frame for all.
  {
    const grid = makeObstacleGrid(100, 7777)
    const rng = mulberry32(99)
    const agents = []
    for (let i = 0; i < 50; i++) {
      const agent = createAgent({
        position: [10 + rng() * 80, 10 + rng() * 80],
        speed: 3,
        grid,
        random: mulberry32(1000 + i),
      })
      agent.wander({ center: [50, 50], radius: 40 })
      agents.push(agent)
    }
    results.push(
      bench('50 agents wander, 1 frame (grid A*)', () => {
        for (const agent of agents) agent.update(FRAME_MS)
      }, { iterations: 600, warmup: 60, meta: { agents: 50, framesPerRun: 600 } })
    )
  }

  // 50 patrolling agents, no grid (straight-line legs) — steering-only cost.
  {
    const rng = mulberry32(55)
    const agents = []
    for (let i = 0; i < 50; i++) {
      const cx = 10 + rng() * 80
      const cz = 10 + rng() * 80
      const agent = createAgent({ position: [cx, cz], speed: 3 })
      agent.patrol([
        [cx, cz],
        [cx + 5, cz],
        [cx + 5, cz + 5],
        [cx, cz + 5],
      ])
      agents.push(agent)
    }
    results.push(
      bench('50 agents patrol, 1 frame (no grid)', () => {
        for (const agent of agents) agent.update(FRAME_MS)
      }, { iterations: 600, warmup: 60, meta: { agents: 50, framesPerRun: 600 } })
    )
  }

  // Behavior tree tick: 3-branch selector of sequences over a blackboard.
  {
    const blackboard = { alert: false, energy: 100, ticks: 0 }
    const tree = createBehaviorTree(
      selector(
        sequence(
          condition((ctx) => ctx.blackboard.alert),
          action((ctx) => {
            ctx.blackboard.energy -= 1
          })
        ),
        sequence(
          condition((ctx) => ctx.blackboard.energy < 20),
          wait(500),
          action((ctx) => {
            ctx.blackboard.energy = 100
          })
        ),
        action((ctx) => {
          ctx.blackboard.ticks += 1
          ctx.blackboard.energy -= 0.1
        })
      ),
      blackboard
    )
    results.push(
      bench('behavior tree tick (3-branch selector)', () => tree.tick(FRAME_MS), {
        iterations: 10000,
        meta: { nodes: 9 },
      })
    )
  }

  return { name: 'agents', results }
}
