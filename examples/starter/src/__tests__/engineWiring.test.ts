// @vitest-environment jsdom
import { createEventRecorder } from '@overworld-engine/test-kit'
import { createSeededRng } from '@overworld-engine/core'
import { describe, expect, it } from 'vitest'
import { createEngines } from '../game/engines'

describe('engine wiring: completing gather-crystals grants a deterministic loot roll', () => {
  it('emits quest:completed and adds a deterministic reward item to the inventory', () => {
    const { events, quests, inventory } = createEngines({ rng: createSeededRng(1234) })
    const recorder = createEventRecorder(events)

    quests.startQuest('gather-crystals')
    // Matches the 'collect' objective's trigger (item:added, itemId: crystal,
    // amountFrom: quantity), target 3 — one call satisfies it in one shot.
    inventory.add('crystal', 3)

    expect(recorder.events.map((e) => e.event)).toContain('quest:completed')
    // 3 crystals collected + exactly one more slot from the loot.random reward.
    expect(inventory.slots()).toMatchSnapshot()

    recorder.stop()
  })

  it('produces the same reward across separate runs with the same seed', () => {
    function run(): string[] {
      const { quests, inventory } = createEngines({ rng: createSeededRng(1234) })
      quests.startQuest('gather-crystals')
      inventory.add('crystal', 3)
      return inventory
        .slots()
        .map((s) => `${s.itemId}:${s.quantity}`)
        .sort()
    }
    expect(run()).toEqual(run())
  })
})
