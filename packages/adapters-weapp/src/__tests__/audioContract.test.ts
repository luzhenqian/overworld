/**
 * Backend contract parity: the exact same assertions run against
 * - the weapp backend (`wx.createInnerAudioContext` fake), and
 * - the real `htmlAudioBackend` from `@overworld-engine/audio`
 *   (`Audio` global fake),
 * proving both playback paths honor the same `AudioBackend`/`AudioHandle`
 * contract the audio manager depends on.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  AudioBackend as AudioPkgBackend,
  AudioHandle as AudioPkgHandle,
} from '@overworld-engine/audio'
import { htmlAudioBackend } from '@overworld-engine/audio'
import { createWeappAudioBackend, type AudioBackend } from '../audio'

// Compile-time parity: adapters-weapp's structural types are assignable to
// (and from) @overworld-engine/audio's — one game-side `backend:` config
// accepts either.
const toAudioPkg: AudioPkgBackend = createWeappAudioBackend()
const fromAudioPkg: AudioBackend = htmlAudioBackend
void toAudioPkg
void fromAudioPkg

/** Introspection of the underlying source, shared by both fixtures. */
interface UnderlyingProbe {
  src: string
  loop: boolean
  volume: number
  paused: boolean
  released: boolean
  fireEnded(): void
  endedListenerCount(): number
}

class FakeInnerAudioContext implements UnderlyingProbe {
  src = ''
  loop = false
  volume = 1
  paused = true
  released = false
  private endedCbs = new Set<() => void>()

  play(): void {
    this.paused = false
  }
  pause(): void {
    this.paused = true
  }
  stop(): void {
    this.paused = true
  }
  destroy(): void {
    this.paused = true
    this.released = true
  }
  onEnded(cb: () => void): void {
    this.endedCbs.add(cb)
  }
  offEnded(cb: () => void): void {
    this.endedCbs.delete(cb)
  }
  fireEnded(): void {
    for (const cb of [...this.endedCbs]) cb()
  }
  endedListenerCount(): number {
    return this.endedCbs.size
  }
}

class FakeAudioElement implements UnderlyingProbe {
  src: string
  loop = false
  volume = 1
  paused = true
  private listeners = new Set<() => void>()

  constructor(src = '') {
    this.src = src
  }
  play(): Promise<void> {
    this.paused = false
    return Promise.resolve()
  }
  pause(): void {
    this.paused = true
  }
  addEventListener(_type: 'ended', cb: () => void): void {
    this.listeners.add(cb)
  }
  removeEventListener(_type: 'ended', cb: () => void): void {
    this.listeners.delete(cb)
  }
  fireEnded(): void {
    for (const cb of [...this.listeners]) cb()
  }
  endedListenerCount(): number {
    return this.listeners.size
  }
  /** HTMLAudio has no destroy; "released" = paused with the source detached. */
  get released(): boolean {
    return this.paused && this.src === ''
  }
}

interface BackendFixture {
  name: string
  /** Installs globals and returns the backend + access to created sources. */
  setup(): { backend: AudioPkgBackend; created: UnderlyingProbe[] }
}

const weappFixture: BackendFixture = {
  name: 'createWeappAudioBackend (wx.createInnerAudioContext)',
  setup() {
    const created: FakeInnerAudioContext[] = []
    vi.stubGlobal('wx', {
      createInnerAudioContext: () => {
        const context = new FakeInnerAudioContext()
        created.push(context)
        return context
      },
    })
    return { backend: createWeappAudioBackend(), created }
  },
}

const htmlFixture: BackendFixture = {
  name: 'htmlAudioBackend (HTMLAudioElement)',
  setup() {
    const created: FakeAudioElement[] = []
    vi.stubGlobal(
      'Audio',
      class extends FakeAudioElement {
        constructor(src = '') {
          super(src)
          created.push(this)
        }
      }
    )
    return { backend: htmlAudioBackend, created }
  },
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe.each([weappFixture, htmlFixture])('audio backend contract: $name', (fixture) => {
  function createHandle(url = '/bgm/town.mp3'): { handle: AudioPkgHandle; probe: UnderlyingProbe } {
    const { backend, created } = fixture.setup()
    expect(backend.isAvailable?.() ?? true).toBe(true)
    const handle = backend.create(url)
    expect(created).toHaveLength(1)
    return { handle, probe: created[0]! }
  }

  it('creates a paused source pointing at the url', () => {
    const { handle, probe } = createHandle('/sfx/pickup.mp3')
    expect(probe.src).toBe('/sfx/pickup.mp3')
    expect(handle.isPaused()).toBe(true)
  })

  it('play() starts and pause() stops the source', async () => {
    const { handle, probe } = createHandle()
    await handle.play()
    expect(handle.isPaused()).toBe(false)
    expect(probe.paused).toBe(false)

    handle.pause()
    expect(handle.isPaused()).toBe(true)
    expect(probe.paused).toBe(true)
  })

  it('setVolume/getVolume roundtrip onto the source', () => {
    const { handle, probe } = createHandle()
    handle.setVolume(0.35)
    expect(handle.getVolume()).toBe(0.35)
    expect(probe.volume).toBe(0.35)
  })

  it('setLoop toggles looping on the source', () => {
    const { handle, probe } = createHandle()
    handle.setLoop(true)
    expect(probe.loop).toBe(true)
    handle.setLoop(false)
    expect(probe.loop).toBe(false)
  })

  it('onEnded fires on completion and the returned unbind detaches it', () => {
    const { handle, probe } = createHandle()
    const ended = vi.fn()
    const unbind = handle.onEnded(ended)

    probe.fireEnded()
    expect(ended).toHaveBeenCalledTimes(1)

    unbind()
    expect(probe.endedListenerCount()).toBe(0)
    probe.fireEnded()
    expect(ended).toHaveBeenCalledTimes(1)
  })

  it('destroy() releases the source', async () => {
    const { handle, probe } = createHandle()
    await handle.play()
    handle.destroy()
    expect(probe.released).toBe(true)
  })
})

describe('createWeappAudioBackend availability', () => {
  it('is unavailable without a wx global', () => {
    const backend = createWeappAudioBackend()
    expect(backend.isAvailable!()).toBe(false)
  })
})
