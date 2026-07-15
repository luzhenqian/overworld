import { describe, expect, it } from 'vitest'
import { createMemoryStorage } from '../persist'
import { createSaveSlots, type EnumerableStorage } from '../saveSlots'

/** Seed a storage with a typical mixed key set. */
function seededStorage(): EnumerableStorage {
  const storage = createMemoryStorage()
  storage.setItem('overworld:inventory', '{"state":{"items":[]},"version":1}')
  storage.setItem('overworld:quest', '{"state":{"active":["q1"]},"version":0}')
  storage.setItem('unrelated:key', 'outside-prefix')
  return storage
}

describe('createMemoryStorage', () => {
  it('enumerates its keys', () => {
    const storage = createMemoryStorage()
    expect(storage.keys()).toEqual([])
    storage.setItem('a', '1')
    storage.setItem('b', '2')
    storage.removeItem('a')
    expect(storage.keys()).toEqual(['b'])
  })
})

describe('createSaveSlots', () => {
  it('snapshots only live keys and restores them after mutation', () => {
    const storage = seededStorage()
    const slots = createSaveSlots({ storage })

    const snap = slots.snapshot()
    expect(typeof snap.savedAt).toBe('number')
    expect(Object.keys(snap.entries).sort()).toEqual(['overworld:inventory', 'overworld:quest'])
    expect(snap.entries['unrelated:key']).toBeUndefined()

    storage.setItem('overworld:inventory', 'mutated')
    storage.setItem('overworld:new-store', 'added-after-snapshot')
    slots.restore(snap)

    expect(storage.getItem('overworld:inventory')).toBe('{"state":{"items":[]},"version":1}')
    expect(storage.getItem('overworld:quest')).toBe('{"state":{"active":["q1"]},"version":0}')
    // Keys added after the snapshot are cleared by restore.
    expect(storage.getItem('overworld:new-store')).toBeNull()
    // Keys outside the prefix are untouched.
    expect(storage.getItem('unrelated:key')).toBe('outside-prefix')
  })

  it('saves to, loads from, deletes and lists slots', () => {
    const storage = seededStorage()
    const slots = createSaveSlots({ storage })

    slots.saveTo('slot-1')
    storage.setItem('overworld:quest', 'changed')
    slots.saveTo('slot-2')

    const listed = slots.listSlots()
    expect(listed.map((s) => s.slot).sort()).toEqual(['slot-1', 'slot-2'])
    for (const info of listed) expect(info.savedAt).toBeGreaterThan(0)
    // Most recently saved first.
    expect(listed[0]!.savedAt).toBeGreaterThanOrEqual(listed[1]!.savedAt)

    expect(slots.loadFrom('slot-1')).toBe(true)
    expect(storage.getItem('overworld:quest')).toBe('{"state":{"active":["q1"]},"version":0}')

    slots.deleteSlot('slot-1')
    expect(slots.listSlots().map((s) => s.slot)).toEqual(['slot-2'])
    expect(slots.loadFrom('slot-1')).toBe(false)
  })

  it('returns false from loadFrom for missing or corrupt slots without touching the live save', () => {
    const storage = seededStorage()
    const slots = createSaveSlots({ storage })

    expect(slots.loadFrom('never-saved')).toBe(false)
    storage.setItem('overworld:slots:broken', 'not json')
    expect(slots.loadFrom('broken')).toBe(false)
    expect(storage.getItem('overworld:inventory')).toBe('{"state":{"items":[]},"version":1}')
  })

  it('excludes the slot namespace from snapshots and clearCurrent', () => {
    const storage = seededStorage()
    const slots = createSaveSlots({ storage })
    slots.saveTo('keep-me')

    const snap = slots.snapshot()
    expect(Object.keys(snap.entries)).not.toContain('overworld:slots:keep-me')

    slots.clearCurrent()
    expect(storage.getItem('overworld:inventory')).toBeNull()
    expect(storage.getItem('overworld:quest')).toBeNull()
    expect(storage.getItem('unrelated:key')).toBe('outside-prefix')
    expect(slots.listSlots().map((s) => s.slot)).toEqual(['keep-me'])
    expect(slots.loadFrom('keep-me')).toBe(true)
    expect(storage.getItem('overworld:inventory')).toBe('{"state":{"items":[]},"version":1}')
  })

  it('honors a custom prefix and isolates it from other prefixes', () => {
    const storage = createMemoryStorage()
    storage.setItem('mygame:wallet', 'gold')
    storage.setItem('overworld:wallet', 'default-prefix-data')
    const slots = createSaveSlots({ storage, prefix: 'mygame' })

    const snap = slots.snapshot()
    expect(Object.keys(snap.entries)).toEqual(['mygame:wallet'])

    slots.saveTo('a')
    expect(storage.getItem('mygame:slots:a')).not.toBeNull()

    slots.clearCurrent()
    expect(storage.getItem('mygame:wallet')).toBeNull()
    expect(storage.getItem('overworld:wallet')).toBe('default-prefix-data')
  })

  it('never restores entries into the slot namespace', () => {
    const storage = createMemoryStorage()
    const slots = createSaveSlots({ storage })
    slots.restore({
      savedAt: Date.now(),
      entries: {
        'overworld:ok': 'live',
        'overworld:slots:evil': 'nope',
        'other:key': 'nope',
      },
    })
    expect(storage.getItem('overworld:ok')).toBe('live')
    expect(storage.getItem('overworld:slots:evil')).toBeNull()
    expect(storage.getItem('other:key')).toBeNull()
  })
})
