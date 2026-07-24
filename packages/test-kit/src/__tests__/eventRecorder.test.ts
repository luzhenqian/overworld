import { EventBus } from '@overworld-engine/core'
import { describe, expect, it } from 'vitest'
import { createEventRecorder } from '../eventRecorder'

interface TestEventMap extends Record<string, unknown> {
  'thing:one': { value: number }
  'thing:two': { label: string }
}

describe('createEventRecorder', () => {
  it('records emissions in order with a monotonic counter', () => {
    const bus = new EventBus<TestEventMap>()
    const recorder = createEventRecorder(bus)

    bus.emit('thing:one', { value: 1 })
    bus.emit('thing:two', { label: 'a' })
    bus.emit('thing:one', { value: 2 })

    expect(recorder.events).toEqual([
      { event: 'thing:one', payload: { value: 1 }, at: 0 },
      { event: 'thing:two', payload: { label: 'a' }, at: 1 },
      { event: 'thing:one', payload: { value: 2 }, at: 2 },
    ])
  })

  it('stop() unsubscribes, no further events are recorded', () => {
    const bus = new EventBus<TestEventMap>()
    const recorder = createEventRecorder(bus)

    bus.emit('thing:one', { value: 1 })
    recorder.stop()
    bus.emit('thing:one', { value: 2 })

    expect(recorder.events).toEqual([{ event: 'thing:one', payload: { value: 1 }, at: 0 }])
  })

  it('two independent recorders on the same bus each get their own counter', () => {
    const bus = new EventBus<TestEventMap>()
    const first = createEventRecorder(bus)
    bus.emit('thing:one', { value: 1 })
    const second = createEventRecorder(bus)
    bus.emit('thing:one', { value: 2 })

    expect(first.events.map((e) => e.at)).toEqual([0, 1])
    expect(second.events.map((e) => e.at)).toEqual([0])
  })
})
