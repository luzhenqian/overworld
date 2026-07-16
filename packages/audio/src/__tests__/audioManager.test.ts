import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EventBus, type OverworldEventMap } from '@overworld/core'
import { createAudioManager, type AudioManagerConfig } from '../audioManager'

/** Minimal HTMLAudioElement stand-in for pure-logic tests. */
class MockAudio {
  static instances: MockAudio[] = []
  static rejectPlay = false

  src: string
  loop = false
  volume = 1
  paused = true

  constructor(src = '') {
    this.src = src
    MockAudio.instances.push(this)
  }

  play(): Promise<void> {
    if (MockAudio.rejectPlay) {
      return Promise.reject(new DOMException('autoplay blocked', 'NotAllowedError'))
    }
    this.paused = false
    return Promise.resolve()
  }

  pause(): void {
    this.paused = true
  }
}

const TRACKS = {
  town: '/bgm/town.mp3',
  dungeon: '/bgm/dungeon.mp3',
  pickup: '/sfx/pickup.mp3',
}

function makeManager(overrides: Partial<AudioManagerConfig> = {}) {
  return createAudioManager({
    tracks: TRACKS,
    sceneTracks: { plaza: 'town', crypt: 'dungeon' },
    fadeDuration: 0, // Keep tests synchronous — no fade intervals.
    // `persist` omitted: disabled by framework convention.
    bus: new EventBus<OverworldEventMap>(),
    ...overrides,
  })
}

beforeEach(() => {
  MockAudio.instances = []
  MockAudio.rejectPlay = false
  vi.stubGlobal('Audio', MockAudio)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('track resolution', () => {
  it('resolves scene ids to track ids', () => {
    const manager = makeManager()
    expect(manager.resolveSceneTrack('plaza')).toBe('town')
    expect(manager.resolveSceneTrack('crypt')).toBe('dungeon')
    expect(manager.resolveSceneTrack('void')).toBeNull()
  })

  it('warns and keeps state on unknown track ids', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const manager = makeManager()
    await manager.playTrack('missing')
    expect(warn).toHaveBeenCalled()
    expect(manager.getState().currentTrackId).toBeNull()
    expect(MockAudio.instances).toHaveLength(0)
  })
})

describe('BGM playback', () => {
  it('plays a track: creates a looping element with the mapped url', async () => {
    const manager = makeManager()
    await manager.playTrack('town')

    expect(manager.getState().currentTrackId).toBe('town')
    expect(manager.getState().unlocked).toBe(true)
    expect(MockAudio.instances).toHaveLength(1)
    const audio = MockAudio.instances[0]!
    expect(audio.src).toBe('/bgm/town.mp3')
    expect(audio.loop).toBe(true)
    expect(audio.paused).toBe(false)
    expect(audio.volume).toBe(0.7) // Faded to target volume.
  })

  it('is a no-op when the same track is already playing', async () => {
    const manager = makeManager()
    await manager.playTrack('town')
    await manager.playTrack('town')
    expect(MockAudio.instances).toHaveLength(1)
  })

  it('stops the previous element when switching tracks', async () => {
    const manager = makeManager()
    await manager.playTrack('town')
    const first = MockAudio.instances[0]!
    await manager.playTrack('dungeon')

    expect(first.paused).toBe(true)
    expect(first.src).toBe('')
    expect(manager.getState().currentTrackId).toBe('dungeon')
    expect(MockAudio.instances).toHaveLength(2)
    expect(MockAudio.instances[1]!.paused).toBe(false)
  })

  it('stopTrack clears playback and state', async () => {
    const manager = makeManager()
    await manager.playTrack('town')
    manager.stopTrack()

    expect(manager.getState().currentTrackId).toBeNull()
    expect(MockAudio.instances[0]!.paused).toBe(true)
  })

  it('playSceneTrack plays mapped scenes and stops on unmapped scenes', async () => {
    const manager = makeManager()
    await manager.playSceneTrack('plaza')
    expect(manager.getState().currentTrackId).toBe('town')

    await manager.playSceneTrack('unmapped-scene')
    expect(manager.getState().currentTrackId).toBeNull()
    expect(MockAudio.instances[0]!.paused).toBe(true)
  })
})

describe('scene:changed bus subscription', () => {
  it('switches BGM on scene:changed by default', async () => {
    const bus = new EventBus<OverworldEventMap>()
    const manager = makeManager({ bus })

    bus.emit('scene:changed', { from: null, to: 'plaza' })
    await vi.waitFor(() => expect(manager.getState().currentTrackId).toBe('town'))

    bus.emit('scene:changed', { from: 'plaza', to: 'crypt' })
    await vi.waitFor(() => expect(manager.getState().currentTrackId).toBe('dungeon'))
  })

  it('does not subscribe when autoSubscribeSceneChanges is false', async () => {
    const bus = new EventBus<OverworldEventMap>()
    const manager = makeManager({ bus, autoSubscribeSceneChanges: false })

    bus.emit('scene:changed', { from: null, to: 'plaza' })
    await Promise.resolve()
    expect(manager.getState().currentTrackId).toBeNull()
    expect(bus.listenerCount('scene:changed')).toBe(0)
  })

  it('accepts the canonical `events` config name', async () => {
    const events = new EventBus<OverworldEventMap>()
    const manager = makeManager({ bus: undefined, events })

    events.emit('scene:changed', { from: null, to: 'plaza' })
    await vi.waitFor(() => expect(manager.getState().currentTrackId).toBe('town'))
  })

  it('prefers `events` over the legacy `bus` alias when both are set', async () => {
    const events = new EventBus<OverworldEventMap>()
    const legacy = new EventBus<OverworldEventMap>()
    const manager = makeManager({ bus: legacy, events })

    legacy.emit('scene:changed', { from: null, to: 'plaza' })
    await Promise.resolve()
    expect(manager.getState().currentTrackId).toBeNull()

    events.emit('scene:changed', { from: null, to: 'plaza' })
    await vi.waitFor(() => expect(manager.getState().currentTrackId).toBe('town'))
  })

  it('stops listening after dispose()', async () => {
    const bus = new EventBus<OverworldEventMap>()
    const manager = makeManager({ bus })
    manager.dispose()

    bus.emit('scene:changed', { from: null, to: 'plaza' })
    await Promise.resolve()
    expect(manager.getState().currentTrackId).toBeNull()
  })
})

describe('mute and volume', () => {
  it('remembers the track while muted and resumes on unmute', async () => {
    const manager = makeManager()
    manager.setMuted(true)
    await manager.playTrack('town')

    expect(manager.getState().currentTrackId).toBe('town')
    expect(MockAudio.instances).toHaveLength(0) // Nothing created while muted.

    manager.setMuted(false)
    await vi.waitFor(() => expect(MockAudio.instances).toHaveLength(1))
    expect(MockAudio.instances[0]!.paused).toBe(false)
  })

  it('pauses the playing element on mute and resumes it on unmute', async () => {
    const manager = makeManager()
    await manager.playTrack('town')
    const audio = MockAudio.instances[0]!

    manager.setMuted(true)
    expect(audio.paused).toBe(true)

    manager.setMuted(false)
    await vi.waitFor(() => expect(audio.paused).toBe(false))
    expect(MockAudio.instances).toHaveLength(1) // Same element reused.
  })

  it('toggleMute flips the flag', () => {
    const manager = makeManager()
    expect(manager.getState().muted).toBe(false)
    manager.toggleMute()
    expect(manager.getState().muted).toBe(true)
    manager.toggleMute()
    expect(manager.getState().muted).toBe(false)
  })

  it('clamps volumes and applies BGM volume to the playing element', async () => {
    const manager = makeManager()
    await manager.playTrack('town')

    manager.setVolume(1.5)
    expect(manager.getState().volume).toBe(1)
    expect(MockAudio.instances[0]!.volume).toBe(1)

    manager.setVolume(-2)
    expect(manager.getState().volume).toBe(0)

    manager.setSfxVolume(7)
    expect(manager.getState().sfxVolume).toBe(1)
  })
})

describe('playSfx', () => {
  it('fires a one-shot at sfxVolume without touching BGM state', () => {
    const manager = makeManager({ sfxVolume: 0.4 })
    manager.playSfx('pickup')

    expect(MockAudio.instances).toHaveLength(1)
    const audio = MockAudio.instances[0]!
    expect(audio.src).toBe('/sfx/pickup.mp3')
    expect(audio.loop).toBe(false)
    expect(audio.volume).toBe(0.4)
    expect(manager.getState().currentTrackId).toBeNull()
  })

  it('is silent while muted', () => {
    const manager = makeManager()
    manager.setMuted(true)
    manager.playSfx('pickup')
    expect(MockAudio.instances).toHaveLength(0)
  })
})

describe('autoplay policy unlock', () => {
  it('registers interaction listeners on blocked playback and retries on interaction', async () => {
    const listeners = new Map<string, () => void>()
    vi.stubGlobal('window', {
      addEventListener: (type: string, fn: () => void) => listeners.set(type, fn),
      removeEventListener: (type: string) => listeners.delete(type),
    })

    MockAudio.rejectPlay = true
    const manager = makeManager()
    await manager.playTrack('town')

    // Playback was blocked; state remembers the track, unlock is pending.
    expect(manager.getState().currentTrackId).toBe('town')
    expect(manager.getState().unlocked).toBe(false)
    expect(listeners.has('pointerdown')).toBe(true)
    expect(listeners.has('keydown')).toBe(true)

    // First user interaction unlocks playback.
    MockAudio.rejectPlay = false
    listeners.get('pointerdown')!()
    await vi.waitFor(() => expect(manager.getState().unlocked).toBe(true))
    expect(MockAudio.instances.at(-1)!.paused).toBe(false)
    expect(listeners.size).toBe(0) // Listeners removed after retry.
  })
})

describe('persist config convention', () => {
  it('is disabled when omitted and enabled via persist: true', () => {
    // omitted -> no persist wrapper -> no `persist` API on the store
    const off = makeManager()
    expect((off.store as unknown as { persist?: unknown }).persist).toBeUndefined()

    // `true` -> enabled with defaults (memory storage in Node).
    const on = makeManager({ persist: true })
    expect((on.store as unknown as { persist?: unknown }).persist).toBeDefined()
    on.setVolume(0.3)
    expect(on.store.getState().volume).toBe(0.3)
  })
})

describe('store exposure', () => {
  it('exposes the vanilla store: getState() matches and subscribe() sees changes', () => {
    const manager = makeManager()
    expect(manager.store.getState()).toBe(manager.getState())

    const muted: boolean[] = []
    const unsubscribe = manager.store.subscribe((state) => muted.push(state.muted))
    manager.toggleMute()
    manager.toggleMute()
    unsubscribe()
    manager.toggleMute()
    expect(muted).toEqual([true, false])
  })
})

describe('Node/SSR safety', () => {
  it('tracks state without crashing when Audio is unavailable', async () => {
    vi.unstubAllGlobals() // Remove the Audio stub → typeof Audio === 'undefined'.
    const manager = makeManager()
    await manager.playTrack('town')
    expect(manager.getState().currentTrackId).toBe('town')
    manager.stopTrack()
    manager.playSfx('pickup')
    expect(manager.getState().currentTrackId).toBeNull()
  })
})
