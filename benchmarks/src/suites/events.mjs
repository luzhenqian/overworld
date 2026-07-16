import { EventBus } from '@overworld/core'
import { bench } from '../lib.mjs'

export function run() {
  const results = []

  // 1k emits with 10 listeners each.
  {
    const bus = new EventBus()
    let sink = 0
    for (let i = 0; i < 10; i++) bus.on('player:moved', (p) => (sink += p.distance))
    const payload = { position: [0, 0, 0], distance: 1 }
    results.push(
      bench('emit, 10 listeners', (i) => bus.emit('player:moved', payload), {
        iterations: 1000,
        meta: { listeners: 10, emitsPerRun: 1000 },
      })
    )
    if (sink < 0) console.log(sink) // keep the sink alive
  }

  // Emit on an event nobody listens to (hot no-op path).
  {
    const bus = new EventBus()
    const payload = { questId: 'q' }
    results.push(
      bench('emit, 0 listeners', () => bus.emit('quest:started', payload), {
        iterations: 1000,
        meta: { listeners: 0 },
      })
    )
  }

  // Subscribe + unsubscribe churn (UI components mounting/unmounting).
  {
    const bus = new EventBus()
    const noop = () => {}
    results.push(
      bench('on + off cycle', () => {
        const off = bus.on('interact', noop)
        off()
      }, { iterations: 1000 })
    )
  }

  return { name: 'events', results }
}
