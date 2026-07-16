import { describe, expect, it, vi } from 'vitest'
import { EventBus, type OverworldEventMap } from '@overworld-engine/core'
import { bindEventLogger, createEventRecorder } from '../eventLogger'

function makeBus(): EventBus<OverworldEventMap> {
  return new EventBus<OverworldEventMap>()
}

describe('bindEventLogger', () => {
  it('logs every event with the [overworld] prefix and the payload', () => {
    const bus = makeBus()
    const log = vi.fn()
    bindEventLogger(bus, { log })
    bus.emit('quest:started', { questId: 'welcome' })
    expect(log).toHaveBeenCalledTimes(1)
    expect(log).toHaveBeenCalledWith('[overworld] quest:started', { questId: 'welcome' })
  })

  it('uses console.debug by default', () => {
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {})
    const bus = makeBus()
    const unbind = bindEventLogger(bus)
    bus.emit('achievement:unlocked', { achievementId: 'first-steps' })
    expect(debug).toHaveBeenCalledWith('[overworld] achievement:unlocked', {
      achievementId: 'first-steps',
    })
    unbind()
    debug.mockRestore()
  })

  it('respects the filter option', () => {
    const bus = makeBus()
    const log = vi.fn()
    bindEventLogger(bus, { log, filter: (event) => event.startsWith('quest:') })
    bus.emit('quest:started', { questId: 'welcome' })
    bus.emit('item:used', { itemId: 'potion' })
    expect(log).toHaveBeenCalledTimes(1)
    expect(log).toHaveBeenCalledWith('[overworld] quest:started', { questId: 'welcome' })
  })

  it('omits the payload when includePayload is false', () => {
    const bus = makeBus()
    const log = vi.fn()
    bindEventLogger(bus, { log, includePayload: false })
    bus.emit('quest:started', { questId: 'welcome' })
    expect(log).toHaveBeenCalledWith('[overworld] quest:started', undefined)
  })

  it('returns an unbind function that stops logging', () => {
    const bus = makeBus()
    const log = vi.fn()
    const unbind = bindEventLogger(bus, { log })
    bus.emit('quest:started', { questId: 'a' })
    unbind()
    bus.emit('quest:started', { questId: 'b' })
    expect(log).toHaveBeenCalledTimes(1)
  })
})

describe('createEventRecorder', () => {
  it('records events in order with a monotonic counter (not wall-clock time)', () => {
    const bus = makeBus()
    const recorder = createEventRecorder(bus)
    bus.emit('quest:started', { questId: 'welcome' })
    bus.emit('quest:completed', { questId: 'welcome' })
    expect(recorder.events).toEqual([
      { event: 'quest:started', payload: { questId: 'welcome' }, at: 0 },
      { event: 'quest:completed', payload: { questId: 'welcome' }, at: 1 },
    ])
    recorder.stop()
  })

  it('stops recording after stop()', () => {
    const bus = makeBus()
    const recorder = createEventRecorder(bus)
    bus.emit('quest:started', { questId: 'a' })
    recorder.stop()
    bus.emit('quest:started', { questId: 'b' })
    expect(recorder.events).toHaveLength(1)
  })
})
