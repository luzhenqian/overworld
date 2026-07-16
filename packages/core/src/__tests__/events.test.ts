import { describe, expect, it, vi } from 'vitest'
import { EventBus, type OverworldEventMap } from '../events'

interface TestMap {
  ping: { n: number }
  pong: { s: string }
}

describe('EventBus', () => {
  it('delivers payloads to subscribers', () => {
    const bus = new EventBus<TestMap>()
    const fn = vi.fn()
    bus.on('ping', fn)
    bus.emit('ping', { n: 1 })
    expect(fn).toHaveBeenCalledWith({ n: 1 })
  })

  it('unsubscribes via the returned function and via off()', () => {
    const bus = new EventBus<TestMap>()
    const a = vi.fn()
    const b = vi.fn()
    const unsub = bus.on('ping', a)
    bus.on('ping', b)
    unsub()
    bus.off('ping', b)
    bus.emit('ping', { n: 2 })
    expect(a).not.toHaveBeenCalled()
    expect(b).not.toHaveBeenCalled()
  })

  it('once() fires a single time', () => {
    const bus = new EventBus<TestMap>()
    const fn = vi.fn()
    bus.once('ping', fn)
    bus.emit('ping', { n: 1 })
    bus.emit('ping', { n: 2 })
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('isolates listener errors', () => {
    const bus = new EventBus<TestMap>()
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const ok = vi.fn()
    bus.on('ping', () => {
      throw new Error('boom')
    })
    bus.on('ping', ok)
    bus.emit('ping', { n: 1 })
    expect(ok).toHaveBeenCalled()
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('onAny observes every event', () => {
    const bus = new EventBus<TestMap>()
    const fn = vi.fn()
    bus.onAny(fn)
    bus.emit('ping', { n: 1 })
    bus.emit('pong', { s: 'x' })
    expect(fn).toHaveBeenCalledTimes(2)
    expect(fn).toHaveBeenCalledWith('pong', { s: 'x' })
  })

  it('clear() removes listeners', () => {
    const bus = new EventBus<TestMap>()
    const fn = vi.fn()
    bus.on('ping', fn)
    bus.clear('ping')
    bus.emit('ping', { n: 1 })
    expect(fn).not.toHaveBeenCalled()
  })
})

describe('OverworldEventMap', () => {
  it('carries entity:interact and the deprecated interact with the same payload', () => {
    const bus = new EventBus<OverworldEventMap>()
    const modern = vi.fn()
    const legacy = vi.fn()
    bus.on('entity:interact', modern)
    bus.on('interact', legacy)

    const payload = { kind: 'npc', id: 'guide' } as const
    bus.emit('entity:interact', payload)
    bus.emit('interact', payload)

    expect(modern).toHaveBeenCalledWith(payload)
    expect(legacy).toHaveBeenCalledWith(payload)
  })
})
