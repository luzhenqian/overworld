import { describe, expect, it, vi } from 'vitest'
import { EventBus, type OverworldEventMap } from '../events'
import { createInputLock } from '../inputLock'

describe('inputLock', () => {
  it('starts unlocked', () => {
    const lock = createInputLock(new EventBus<OverworldEventMap>())
    expect(lock.isLocked()).toBe(false)
    expect(lock.activeLocks()).toEqual([])
  })

  it('acquire/release toggles locked state', () => {
    const lock = createInputLock(new EventBus<OverworldEventMap>())
    lock.acquire('dialogue')
    expect(lock.isLocked()).toBe(true)
    expect(lock.activeLocks()).toEqual(['dialogue'])
    lock.release('dialogue')
    expect(lock.isLocked()).toBe(false)
  })

  it('acquire is idempotent per id', () => {
    const lock = createInputLock(new EventBus<OverworldEventMap>())
    lock.acquire('a')
    lock.acquire('a')
    lock.release('a')
    expect(lock.isLocked()).toBe(false)
  })

  it('activeLocks is sorted and deduped', () => {
    const lock = createInputLock(new EventBus<OverworldEventMap>())
    lock.acquire('z')
    lock.acquire('a')
    expect(lock.activeLocks()).toEqual(['a', 'z'])
  })

  it('emits input:lock-changed only on state transitions', () => {
    const bus = new EventBus<OverworldEventMap>()
    const lock = createInputLock(bus)
    const spy = vi.fn()
    bus.on('input:lock-changed', spy)
    lock.acquire('a') // false -> true
    lock.acquire('b') // still locked, but active list changed
    lock.release('a') // still locked
    lock.release('b') // true -> false
    expect(spy).toHaveBeenCalledWith({ locked: true, active: ['a'] })
    expect(spy).toHaveBeenCalledWith({ locked: false, active: [] })
    expect(spy).toHaveBeenCalledTimes(4) // every active-set change emits
  })

  it('subscribe notifies and unsubscribes', () => {
    const lock = createInputLock(new EventBus<OverworldEventMap>())
    const seen: boolean[] = []
    const off = lock.subscribe((locked) => seen.push(locked))
    lock.acquire('a')
    off()
    lock.release('a')
    expect(seen).toEqual([true])
  })

  it('releaseAll clears everything', () => {
    const lock = createInputLock(new EventBus<OverworldEventMap>())
    lock.acquire('a')
    lock.acquire('b')
    lock.releaseAll()
    expect(lock.isLocked()).toBe(false)
    expect(lock.activeLocks()).toEqual([])
  })
})
