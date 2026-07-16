import { afterEach, describe, expect, it, vi } from 'vitest'
import { EventBus, type OverworldEventMap } from '@overworld-engine/core'
import { createAudioManager } from '../audioManager'
import { htmlAudioBackend, type AudioBackend, type AudioHandle } from '../backend'

/**
 * Fake backend: pure state, records every created handle. Stands in for
 * e.g. `createWeappAudioBackend()` from `@overworld-engine/adapters-weapp`.
 */
class FakeHandle implements AudioHandle {
  url: string
  volume = 1
  loop = false
  paused = true
  destroyed = false
  playCalls = 0
  rejectPlay = false
  private endedCallbacks = new Set<() => void>()

  constructor(url: string) {
    this.url = url
  }

  play(): Promise<void> {
    this.playCalls++
    if (this.rejectPlay) return Promise.reject(new Error('blocked'))
    this.paused = false
    return Promise.resolve()
  }
  pause(): void {
    this.paused = true
  }
  setVolume(volume: number): void {
    this.volume = volume
  }
  getVolume(): number {
    return this.volume
  }
  setLoop(loop: boolean): void {
    this.loop = loop
  }
  isPaused(): boolean {
    return this.paused
  }
  onEnded(callback: () => void): () => void {
    this.endedCallbacks.add(callback)
    return () => this.endedCallbacks.delete(callback)
  }
  destroy(): void {
    this.destroyed = true
    this.paused = true
  }
  fireEnded(): void {
    for (const cb of [...this.endedCallbacks]) cb()
  }
  get endedListenerCount(): number {
    return this.endedCallbacks.size
  }
}

function makeFakeBackend(): { backend: AudioBackend; handles: FakeHandle[] } {
  const handles: FakeHandle[] = []
  return {
    handles,
    backend: {
      create(url) {
        const handle = new FakeHandle(url)
        handles.push(handle)
        return handle
      },
    },
  }
}

const TRACKS = { town: '/bgm/town.mp3', pickup: '/sfx/pickup.mp3' }

function makeBus(): EventBus<OverworldEventMap> {
  return new EventBus<OverworldEventMap>()
}

/** Emit a platform lifecycle event; the map entries live in @overworld-engine/platform. */
function emitLifecycle(bus: EventBus<OverworldEventMap>, event: 'app:paused' | 'app:resumed'): void {
  ;(bus as unknown as EventBus<Record<'app:paused' | 'app:resumed', object>>).emit(event, {})
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('backend injection', () => {
  it('routes BGM playback through the injected backend, even without a global Audio', async () => {
    // No `Audio` global at all: a custom backend must still play.
    const { backend, handles } = makeFakeBackend()
    const manager = createAudioManager({
      tracks: TRACKS,
      fadeDuration: 0,
      backend,
      bus: makeBus(),
    })

    await manager.playTrack('town')
    expect(handles).toHaveLength(1)
    const handle = handles[0]!
    expect(handle.url).toBe('/bgm/town.mp3')
    expect(handle.loop).toBe(true)
    expect(handle.paused).toBe(false)
    expect(handle.volume).toBe(0.7) // Faded to target.
    expect(manager.getState().unlocked).toBe(true)

    manager.stopTrack()
    expect(handle.destroyed).toBe(true)
  })

  it('plays SFX through the backend and destroys the handle when it ends', () => {
    const { backend, handles } = makeFakeBackend()
    const manager = createAudioManager({
      tracks: TRACKS,
      fadeDuration: 0,
      sfxVolume: 0.4,
      backend,
      bus: makeBus(),
    })

    manager.playSfx('pickup')
    expect(handles).toHaveLength(1)
    const handle = handles[0]!
    expect(handle.url).toBe('/sfx/pickup.mp3')
    expect(handle.loop).toBe(false)
    expect(handle.volume).toBe(0.4)
    expect(handle.endedListenerCount).toBe(1)

    handle.fireEnded()
    expect(handle.destroyed).toBe(true)
    expect(handle.endedListenerCount).toBe(0) // Listener unbound.
  })

  it('honors backend.isAvailable() === false by tracking state only', async () => {
    const { backend, handles } = makeFakeBackend()
    backend.isAvailable = () => false
    const manager = createAudioManager({
      tracks: TRACKS,
      fadeDuration: 0,
      backend,
      bus: makeBus(),
    })

    await manager.playTrack('town')
    manager.playSfx('pickup')
    expect(handles).toHaveLength(0)
    expect(manager.getState().currentTrackId).toBe('town')
  })

  it('registers unlock listeners when the injected backend blocks playback', async () => {
    const listeners = new Map<string, () => void>()
    vi.stubGlobal('window', {
      addEventListener: (type: string, fn: () => void) => listeners.set(type, fn),
      removeEventListener: (type: string) => listeners.delete(type),
    })

    const { backend, handles } = makeFakeBackend()
    let blocked = true
    const blockedBackend: AudioBackend = {
      create(url) {
        const handle = backend.create(url) as FakeHandle
        handle.rejectPlay = blocked
        return handle
      },
    }
    const manager = createAudioManager({
      tracks: TRACKS,
      fadeDuration: 0,
      backend: blockedBackend,
      bus: makeBus(),
    })

    await manager.playTrack('town')
    expect(manager.getState().unlocked).toBe(false)
    expect(listeners.has('pointerdown')).toBe(true)

    blocked = false
    handles.forEach((h) => (h.rejectPlay = false))
    listeners.get('pointerdown')!()
    await vi.waitFor(() => expect(manager.getState().unlocked).toBe(true))
  })
})

describe('htmlAudioBackend', () => {
  it('reports unavailable without a global Audio and available with one', () => {
    expect(htmlAudioBackend.isAvailable!()).toBe(false)
    vi.stubGlobal(
      'Audio',
      class {
        src = ''
      }
    )
    expect(htmlAudioBackend.isAvailable!()).toBe(true)
  })
})

describe('pauseOnHide', () => {
  function makeManager(pauseOnHide: boolean, bus: EventBus<OverworldEventMap>) {
    const { backend, handles } = makeFakeBackend()
    const manager = createAudioManager({
      tracks: TRACKS,
      fadeDuration: 0,
      pauseOnHide,
      backend,
      bus,
    })
    return { manager, handles }
  }

  it('pauses the BGM on app:paused and resumes it on app:resumed', async () => {
    const bus = makeBus()
    const { manager, handles } = makeManager(true, bus)
    await manager.playTrack('town')
    const handle = handles[0]!
    expect(handle.paused).toBe(false)

    emitLifecycle(bus, 'app:paused')
    expect(handle.paused).toBe(true)

    emitLifecycle(bus, 'app:resumed')
    await vi.waitFor(() => expect(handle.paused).toBe(false))
    expect(handle.destroyed).toBe(false) // Same handle resumed, not recreated.
  })

  it('does not resume a BGM it did not pause', async () => {
    const bus = makeBus()
    const { manager, handles } = makeManager(true, bus)
    await manager.playTrack('town')
    const handle = handles[0]!
    manager.setMuted(true) // Paused by mute, not by lifecycle.

    emitLifecycle(bus, 'app:paused')
    emitLifecycle(bus, 'app:resumed')
    await Promise.resolve()
    expect(handle.paused).toBe(true)
  })

  it('stays paused on app:resumed while muted', async () => {
    const bus = makeBus()
    const { manager, handles } = makeManager(true, bus)
    await manager.playTrack('town')
    const handle = handles[0]!

    emitLifecycle(bus, 'app:paused')
    manager.setMuted(true)
    emitLifecycle(bus, 'app:resumed')
    await Promise.resolve()
    expect(handle.paused).toBe(true)
  })

  it('does not subscribe by default and unsubscribes on dispose()', async () => {
    const bus = makeBus()
    const lifecycleCount = (event: string) =>
      bus.listenerCount(event as keyof OverworldEventMap)

    makeManager(false, bus)
    expect(lifecycleCount('app:paused')).toBe(0)
    expect(lifecycleCount('app:resumed')).toBe(0)

    const { manager, handles } = makeManager(true, bus)
    expect(lifecycleCount('app:paused')).toBe(1)
    expect(lifecycleCount('app:resumed')).toBe(1)

    await manager.playTrack('town')
    manager.dispose()
    expect(lifecycleCount('app:paused')).toBe(0)
    expect(lifecycleCount('app:resumed')).toBe(0)

    emitLifecycle(bus, 'app:paused')
    expect(handles[0]!.destroyed).toBe(true) // Disposed, untouched by the event.
  })
})
