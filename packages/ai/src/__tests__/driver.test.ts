import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Agent, AgentStatus } from '../behaviors'
import type { BehaviorTree } from '../behaviorTree'
import { createAgent } from '../behaviors'
import { stepAgent } from '../driver'

/** Counting agent stub: records every `update(deltaMs)` call. */
function makeAgentStub(): { agent: Agent; updates: number[] } {
  const updates: number[] = []
  const status = (): AgentStatus => ({
    behavior: 'idle',
    position: [0, 0],
    heading: 0,
    isMoving: false,
  })
  const agent = {
    position: [0, 0] as [number, number],
    speed: 2,
    heading: 0,
    isMoving: false,
    behavior: 'idle' as const,
    update(deltaMs: number) {
      updates.push(deltaMs)
      return status()
    },
    patrol: () => {},
    wander: () => {},
    follow: () => {},
    goTo: () => {},
    idle: () => {},
  } satisfies Agent
  return { agent, updates }
}

/** Counting tree stub: records every `tick(deltaMs)` call. */
function makeTreeStub(): { tree: BehaviorTree; ticks: number[] } {
  const ticks: number[] = []
  const tree: BehaviorTree = {
    blackboard: {},
    tick(deltaMs) {
      ticks.push(deltaMs)
      return 'running'
    },
    reset: () => {},
  }
  return { tree, ticks }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('stepAgent — driven default', () => {
  it('calls agent.update exactly once with deltaMs and returns its status', () => {
    const { agent, updates } = makeAgentStub()
    const status = stepAgent(agent, 16)
    expect(updates).toEqual([16])
    expect(status).toMatchObject({ behavior: 'idle', position: [0, 0] })
  })

  it('driven: true is the same as omitting driven', () => {
    const { agent, updates } = makeAgentStub()
    stepAgent(agent, 16, { driven: true })
    expect(updates).toEqual([16])
  })

  it('moves a real agent the same way a bare update would', () => {
    const walker = createAgent({ position: [0, 0], speed: 2 })
    walker.goTo([2, 0])
    const status = stepAgent(walker, 500) // 0.5s at 2 u/s => 1 unit
    expect(status?.position[0]).toBeCloseTo(1)
  })
})

describe('stepAgent — tree path (no double-stepping)', () => {
  it('ticks the tree exactly once and updates the agent exactly once per call', () => {
    const { agent, updates } = makeAgentStub()
    const { tree, ticks } = makeTreeStub()
    stepAgent(agent, 16, { tree })
    expect(ticks).toEqual([16])
    expect(updates).toEqual([16])
    stepAgent(agent, 33, { tree })
    expect(ticks).toEqual([16, 33])
    expect(updates).toEqual([16, 33])
  })

  it('returns the agent status from the combined step', () => {
    const { agent } = makeAgentStub()
    const { tree } = makeTreeStub()
    const status = stepAgent(agent, 16, { tree })
    expect(status).toMatchObject({ behavior: 'idle' })
  })
})

describe('stepAgent — driven: false (render-only)', () => {
  it('is a no-op: no agent.update, returns undefined', () => {
    const { agent, updates } = makeAgentStub()
    const status = stepAgent(agent, 16, { driven: false })
    expect(updates).toEqual([])
    expect(status).toBeUndefined()
  })

  it('tree + driven: false warns once per tree, never ticks nor updates', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { agent, updates } = makeAgentStub()
    const { tree, ticks } = makeTreeStub()

    expect(stepAgent(agent, 16, { driven: false, tree })).toBeUndefined()
    expect(stepAgent(agent, 16, { driven: false, tree })).toBeUndefined()
    expect(stepAgent(agent, 16, { driven: false, tree })).toBeUndefined()

    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0]?.[0]).toContain('driven: false')
    expect(ticks).toEqual([])
    expect(updates).toEqual([])

    // A different tree gets its own one-time warning.
    const other = makeTreeStub()
    stepAgent(agent, 16, { driven: false, tree: other.tree })
    expect(warn).toHaveBeenCalledTimes(2)
  })
})
