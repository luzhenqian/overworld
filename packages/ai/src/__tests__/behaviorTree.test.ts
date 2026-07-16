import { describe, expect, it } from 'vitest'
import {
  action,
  alwaysSucceed,
  condition,
  createBehaviorTree,
  goToAction,
  idleAction,
  invert,
  isNearCondition,
  parallel,
  patrolAction,
  repeat,
  selector,
  sequence,
  tickTreeWithAgent,
  wait,
  type BTStatus,
} from '../behaviorTree'
import { createAgent } from '../behaviors'

describe('leaves — action / condition', () => {
  it('action: void return counts as success, explicit statuses pass through', () => {
    const tree = createBehaviorTree(action(() => {}), {})
    expect(tree.tick(16)).toBe('success')
    expect(createBehaviorTree(action(() => 'failure'), {}).tick(16)).toBe('failure')
    expect(createBehaviorTree(action(() => 'running'), {}).tick(16)).toBe('running')
  })

  it('condition maps true/false to success/failure', () => {
    expect(createBehaviorTree(condition(() => true), {}).tick(16)).toBe('success')
    expect(createBehaviorTree(condition(() => false), {}).tick(16)).toBe('failure')
  })
})

describe('sequence — memory', () => {
  it('resumes at the running child without re-ticking earlier children', () => {
    const log: string[] = []
    const tree = createBehaviorTree(
      sequence(
        action(() => {
          log.push('a')
        }),
        wait(100),
        action(() => {
          log.push('b')
        })
      ),
      {}
    )
    expect(tree.tick(60)).toBe('running') // a once, wait at 60
    expect(tree.tick(60)).toBe('success') // wait completes (120), then b — a not re-run
    expect(log).toEqual(['a', 'b'])
  })

  it('fails fast and resets its cursor and children on failure', () => {
    let attempts = 0
    const tree = createBehaviorTree(
      sequence(
        action(() => {
          attempts++
        }),
        condition(() => attempts >= 2)
      ),
      {}
    )
    expect(tree.tick(16)).toBe('failure')
    expect(tree.tick(16)).toBe('success') // restarted from child 0
    expect(attempts).toBe(2)
  })

  it('reset() rewinds the cursor and children mid-run', () => {
    const log: string[] = []
    const tree = createBehaviorTree(
      sequence(
        action(() => {
          log.push('a')
        }),
        wait(100)
      ),
      {}
    )
    tree.tick(30)
    tree.reset()
    tree.tick(30) // a again; wait restarts at 30
    expect(log).toEqual(['a', 'a'])
    expect(tree.tick(60)).toBe('running') // 90 < 100
    expect(tree.tick(20)).toBe('success') // 110 >= 100
  })
})

describe('selector — fallback order + memory', () => {
  it('tries children in order and succeeds on the first success', () => {
    const log: string[] = []
    const tree = createBehaviorTree(
      selector(
        condition(() => {
          log.push('first')
          return false
        }),
        action(() => {
          log.push('second')
        }),
        action(() => {
          log.push('third')
        })
      ),
      {}
    )
    expect(tree.tick(16)).toBe('success')
    expect(log).toEqual(['first', 'second'])
  })

  it('resumes at the running child without re-trying earlier failures', () => {
    let firstChecks = 0
    const tree = createBehaviorTree(
      selector(
        condition(() => {
          firstChecks++
          return false
        }),
        wait(100)
      ),
      {}
    )
    expect(tree.tick(60)).toBe('running')
    expect(tree.tick(60)).toBe('success') // resumed at wait; condition not re-checked
    expect(firstChecks).toBe(1)
  })

  it('fails when every child fails', () => {
    const tree = createBehaviorTree(selector(condition(() => false), condition(() => false)), {})
    expect(tree.tick(16)).toBe('failure')
  })
})

describe('decorators — invert / alwaysSucceed', () => {
  it('invert swaps success and failure, passes running through', () => {
    expect(createBehaviorTree(invert(condition(() => true)), {}).tick(16)).toBe('failure')
    expect(createBehaviorTree(invert(condition(() => false)), {}).tick(16)).toBe('success')
    const tree = createBehaviorTree(invert(wait(100)), {})
    expect(tree.tick(50)).toBe('running')
    expect(tree.tick(60)).toBe('failure')
  })

  it('alwaysSucceed masks failure, passes running through', () => {
    expect(createBehaviorTree(alwaysSucceed(condition(() => false)), {}).tick(16)).toBe('success')
    const tree = createBehaviorTree(alwaysSucceed(invert(wait(100))), {})
    expect(tree.tick(50)).toBe('running')
    expect(tree.tick(60)).toBe('success')
  })
})

describe('wait', () => {
  it('accumulates deltaMs across ticks, then succeeds', () => {
    const tree = createBehaviorTree(wait(250), {})
    expect(tree.tick(100)).toBe('running')
    expect(tree.tick(100)).toBe('running')
    expect(tree.tick(100)).toBe('success') // 300 >= 250
    // Auto-reset after completion: accumulation starts over.
    expect(tree.tick(100)).toBe('running')
  })
})

describe('repeat', () => {
  it('finite: succeeds after n child successes, one completion per tick', () => {
    let runs = 0
    const tree = createBehaviorTree(
      repeat(
        action(() => {
          runs++
        }),
        3
      ),
      {}
    )
    expect(tree.tick(16)).toBe('running')
    expect(tree.tick(16)).toBe('running')
    expect(tree.tick(16)).toBe('success')
    expect(runs).toBe(3)
  })

  it('finite: fails fast when the child fails', () => {
    const tree = createBehaviorTree(repeat(condition(() => false), 3), {})
    expect(tree.tick(16)).toBe('failure')
  })

  it('infinite: always running, resetting the child between iterations', () => {
    const tree = createBehaviorTree(repeat(wait(100)), {})
    expect(tree.tick(100)).toBe('running') // iteration 1 completes, child reset
    expect(tree.tick(50)).toBe('running') // fresh accumulation: 50
    expect(tree.tick(50)).toBe('running') // iteration 2 completes
    expect(tree.tick(10)).toBe('running')
  })
})

describe('parallel', () => {
  it("'all': running on a mix, success once every child succeeds", () => {
    const tree = createBehaviorTree(parallel('all', action(() => {}), wait(100)), {})
    expect(tree.tick(50)).toBe('running')
    expect(tree.tick(50)).toBe('success')
  })

  it("'all': fails fast on any failure", () => {
    const tree = createBehaviorTree(parallel('all', wait(100), condition(() => false)), {})
    expect(tree.tick(10)).toBe('failure')
  })

  it("'any': succeeds fast on the first success, re-ticks failed children (monitor)", () => {
    let checks = 0
    const tree = createBehaviorTree(
      parallel(
        'any',
        condition(() => {
          checks++
          return checks >= 3
        }),
        wait(10_000)
      ),
      {}
    )
    expect(tree.tick(16)).toBe('running')
    expect(tree.tick(16)).toBe('running')
    expect(tree.tick(16)).toBe('success') // condition re-evaluated every tick
  })

  it("'any': fails only when every child fails on the same tick", () => {
    const tree = createBehaviorTree(
      parallel('any', condition(() => false), condition(() => false)),
      {}
    )
    expect(tree.tick(16)).toBe('failure')
  })

  it('resets all children (including running ones) on completion', () => {
    // wait(100) is still running when the condition flips the parallel to
    // success; afterwards the wait must restart from zero.
    let ready = false
    const tree = createBehaviorTree(parallel('any', condition(() => ready), wait(100)), {})
    expect(tree.tick(80)).toBe('running')
    ready = true
    expect(tree.tick(1)).toBe('success')
    ready = false
    // Without the reset, the wait would already hold 81ms and finish here.
    expect(tree.tick(80)).toBe('running') // 80 < 100: the wait was reset
    expect(tree.tick(30)).toBe('success') // 110 >= 100: fresh wait completes
  })
})

describe('createBehaviorTree — auto-reset and blackboard', () => {
  it('auto-resets the tree on the tick after root completion', () => {
    const tree = createBehaviorTree(wait(100), {})
    expect(tree.tick(60)).toBe('running')
    expect(tree.tick(60)).toBe('success')
    expect(tree.tick(60)).toBe('running') // fresh run
    expect(tree.tick(60)).toBe('success')
  })

  it('blackboard mutations persist across ticks and are shared', () => {
    const tree = createBehaviorTree(
      action<{ count: number }>((ctx) => {
        ctx.blackboard.count++
        return ctx.blackboard.count >= 3 ? 'success' : 'running'
      }),
      { count: 0 }
    )
    expect(tree.tick(16)).toBe('running')
    expect(tree.tick(16)).toBe('running')
    expect(tree.tick(16)).toBe('success')
    expect(tree.blackboard.count).toBe(3)
  })
})

describe('agent integration', () => {
  it('goToAction walks a real agent to the point and succeeds after arrival', () => {
    const agent = createAgent({ position: [0, 0], speed: 2 })
    const tree = createBehaviorTree(goToAction(agent, [3, 0]), {})
    const statuses: BTStatus[] = []
    for (let i = 0; i < 20; i++) {
      const result = tickTreeWithAgent(tree, agent, 500) // 1 unit per tick
      statuses.push(result.tree)
      if (result.tree !== 'running') break
    }
    // tick 1 starts the trip; ticks 2-3 in transit; the agent arrives and
    // auto-idles during tick 3's update; tick 4 reports success.
    expect(statuses).toEqual(['running', 'running', 'running', 'success'])
    expect(agent.position).toEqual([3, 0])
    expect(agent.behavior).toBe('idle')
  })

  it('goToAction fails when another behavior preempts the trip', () => {
    const agent = createAgent({ position: [0, 0], speed: 2 })
    const tree = createBehaviorTree(goToAction(agent, [10, 0]), {})
    tickTreeWithAgent(tree, agent, 100)
    agent.wander({ center: [0, 0], radius: 1 }) // external preemption
    expect(tree.tick(100)).toBe('failure')
  })

  it('patrolAction keeps the agent patrolling and is always running', () => {
    const agent = createAgent({ position: [0, 0], speed: 2 })
    const tree = createBehaviorTree(
      patrolAction(agent, [
        [1, 0],
        [0, 0],
      ]),
      {}
    )
    for (let i = 0; i < 10; i++) {
      expect(tickTreeWithAgent(tree, agent, 100).tree).toBe('running')
    }
    expect(agent.behavior).toBe('patrol')
    expect(agent.isMoving).toBe(true)
  })

  it('idleAction idles the agent and succeeds; isNearCondition measures distance', () => {
    const agent = createAgent({ position: [3, 4], speed: 2 })
    agent.patrol([[10, 4]])
    agent.update(100)
    expect(createBehaviorTree(idleAction(agent), {}).tick(16)).toBe('success')
    expect(agent.behavior).toBe('idle')
    expect(createBehaviorTree(isNearCondition(agent, [3, 4.5], 1), {}).tick(16)).toBe('success')
    expect(createBehaviorTree(isNearCondition(agent, [9, 4], 1), {}).tick(16)).toBe('failure')
  })

  it('integration: patrols until near a trigger point, then goes home', () => {
    const agent = createAgent({ position: [0, 0], speed: 2 })
    const home: [number, number] = [0, 5]
    const tree = createBehaviorTree(
      sequence(
        parallel(
          'any',
          isNearCondition(agent, [4, 0], 0.25),
          patrolAction(agent, [
            [4, 0],
            [0, 0],
          ])
        ),
        goToAction(agent, home)
      ),
      {}
    )
    const statuses: BTStatus[] = []
    let ticks = 0
    while (ticks < 200 && !statuses.includes('success')) {
      statuses.push(tickTreeWithAgent(tree, agent, 100).tree)
      ticks++
    }
    expect(statuses).not.toContain('failure')
    expect(statuses[statuses.length - 1]).toBe('success')
    expect(agent.position[0]).toBeCloseTo(home[0])
    expect(agent.position[1]).toBeCloseTo(home[1])
    expect(agent.behavior).toBe('idle')
    // Deterministic timing: 0.2 units/tick; the trigger fires at 3.8 units
    // (tick 20's pre-update check), then ~32 update ticks home + 1 to report.
    expect(ticks).toBeGreaterThan(30)
    expect(ticks).toBeLessThan(80)
  })
})
