import { describe, expect, it } from 'vitest'
import { createMemoryStorage } from '../persist'
import { createSaveSlots } from '../saveSlots'

describe('createSaveSlots clock injection', () => {
  it('stamps savedAt from the injected clock (snapshot, saveTo, listSlots)', () => {
    let t = 1000
    const storage = createMemoryStorage()
    storage.setItem('overworld:inventory', '{"state":{},"version":0}')
    const slots = createSaveSlots({ storage, clock: () => t })

    expect(slots.snapshot().savedAt).toBe(1000)

    t = 7777
    slots.saveTo('slot-1')
    expect(slots.listSlots()).toEqual([{ slot: 'slot-1', savedAt: 7777 }])

    const raw = storage.getItem('overworld:slots:slot-1')
    expect(raw).not.toBeNull()
    expect((JSON.parse(raw!) as { savedAt: number }).savedAt).toBe(7777)
  })

  it('same storage contents + same clock produce byte-identical snapshots', () => {
    const make = () => {
      const storage = createMemoryStorage()
      storage.setItem('overworld:quest', '{"state":{"active":{}},"version":0}')
      const slots = createSaveSlots({ storage, clock: () => 1000 })
      return JSON.stringify(slots.snapshot())
    }
    expect(make()).toBe(make())
  })
})
