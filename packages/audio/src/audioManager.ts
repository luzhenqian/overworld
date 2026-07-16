import { persist } from 'zustand/middleware'
import type { StateStorage } from 'zustand/middleware'
import { createStore, type StoreApi } from 'zustand/vanilla'
import {
  createMemoryStorage,
  gameEvents,
  persistOptions,
  type EventBus,
  type OverworldEventMap,
} from '@overworld-engine/core'

/** Persistence tuning for {@link createAudioManager}. */
export interface AudioPersistConfig {
  /** Storage key (namespaced as `overworld:<name>`). Defaults to `audio`. */
  name?: string
  /** Persisted-shape version, paired with zustand migrations. */
  version?: number
  /** Storage backend. Defaults to `localStorage` (memory storage in Node/SSR). */
  storage?: () => StateStorage
}

/** Configuration for {@link createAudioManager}. */
export interface AudioManagerConfig {
  /** Track id → audio file URL. Used for both BGM tracks and SFX one-shots. */
  tracks: Record<string, string>
  /** Scene id → track id. Scenes without an entry stop the current BGM. */
  sceneTracks?: Record<string, string>
  /**
   * Subscribe to `scene:changed` on the bus and switch BGM automatically.
   * Only applies when `sceneTracks` is provided. Defaults to `true`.
   */
  autoSubscribeSceneChanges?: boolean
  /**
   * Event bus to subscribe on. Defaults to the global `gameEvents` bus.
   * Canonical name, matching the `events` config of every other engine.
   * Takes precedence over the legacy `bus` alias when both are provided.
   */
  events?: EventBus<OverworldEventMap>
  /** Legacy alias of `events`, kept for backwards compatibility. Prefer `events`. */
  bus?: EventBus<OverworldEventMap>
  /** Initial BGM volume (0–1). Defaults to `0.7`. */
  volume?: number
  /** Initial SFX volume (0–1). Defaults to `0.7`. */
  sfxVolume?: number
  /** Fade in/out duration on track switch, in ms. Defaults to `1000`. */
  fadeDuration?: number
  /** Loop BGM tracks. Defaults to `true`. */
  loop?: boolean
  /**
   * Persist volume/mute settings (localStorage under `overworld:audio`).
   * Framework convention: omitted or `false` = disabled; `true` = enabled
   * with defaults; object = custom.
   */
  persist?: boolean | AudioPersistConfig
}

/** Reactive audio state exposed via `manager.store`. */
export interface AudioState {
  /** BGM volume, 0–1. Persisted. */
  volume: number
  /** SFX volume, 0–1. Persisted. */
  sfxVolume: number
  /** Whether all audio output is muted. Persisted. */
  muted: boolean
  /** Track id the manager currently wants playing (even while muted/locked). */
  currentTrackId: string | null
  /** Becomes `true` once the browser has allowed playback. */
  unlocked: boolean
}

/** The audio manager returned by {@link createAudioManager}. */
export interface AudioManager {
  /** Underlying zustand vanilla store of {@link AudioState} — subscribe directly or via `useStore` in React. */
  store: StoreApi<AudioState>
  /** Snapshot of the current state (non-reactive). */
  getState: () => AudioState
  /** Play a BGM track by id, fading out the previous one. */
  playTrack: (trackId: string) => Promise<void>
  /** Play the BGM mapped to a scene id; unmapped scenes stop the BGM. */
  playSceneTrack: (sceneId: string) => Promise<void>
  /** Stop the current BGM (with fade-out). */
  stopTrack: () => void
  /** Fire a one-shot sound effect by track id. */
  playSfx: (trackId: string) => void
  /** Set BGM volume (clamped to 0–1). */
  setVolume: (volume: number) => void
  /** Set SFX volume (clamped to 0–1). */
  setSfxVolume: (volume: number) => void
  /** Mute/unmute all output; unmuting resumes the pending BGM. */
  setMuted: (muted: boolean) => void
  /** Toggle {@link AudioState.muted}. */
  toggleMute: () => void
  /** Resolve the track id mapped to a scene id, or `null`. */
  resolveSceneTrack: (sceneId: string) => string | null
  /** Unsubscribe from the bus, remove listeners and stop playback. */
  dispose: () => void
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

/** Persisted subset of {@link AudioState}. */
type PersistedAudioState = Pick<AudioState, 'volume' | 'sfxVolume' | 'muted'>

function createAudioStore(
  persistConfig: AudioManagerConfig['persist'],
  initial: AudioState
): StoreApi<AudioState> {
  if (!persistConfig) {
    return createStore<AudioState>()(() => initial)
  }
  const cfg = typeof persistConfig === 'object' ? persistConfig : {}
  const storage =
    cfg.storage ??
    (() => (typeof localStorage !== 'undefined' ? localStorage : createMemoryStorage()))
  return createStore<AudioState>()(
    persist(
      () => initial,
      persistOptions<AudioState, PersistedAudioState>({
        name: cfg.name ?? 'audio',
        version: cfg.version ?? 0,
        storage,
        partialize: (state) => ({
          volume: state.volume,
          sfxVolume: state.sfxVolume,
          muted: state.muted,
        }),
      })
    )
  )
}

/**
 * Create an audio manager: a singleton HTMLAudio BGM pool with fade in/out
 * on track switches, browser autoplay-policy handling (playback retries
 * after the first user interaction) and optional persisted volume/mute
 * settings (opt in via `persist`, like every other engine).
 *
 * All browser APIs are guarded, so the manager is safe to create (and its
 * pure logic testable) in Node/SSR — it simply tracks state without playing.
 *
 * ```ts
 * const audio = createAudioManager({
 *   tracks: { town: '/bgm/town.mp3', pickup: '/sfx/pickup.mp3' },
 *   sceneTracks: { plaza: 'town' },
 * })
 * audio.playSfx('pickup')
 * ```
 */
export function createAudioManager(config: AudioManagerConfig): AudioManager {
  const {
    tracks,
    sceneTracks,
    autoSubscribeSceneChanges = true,
    fadeDuration = 1000,
    loop = true,
  } = config
  // `events` is the canonical config name; `bus` is the pre-1.0 alias.
  const bus = config.events ?? config.bus ?? gameEvents

  const store = createAudioStore(config.persist, {
    volume: clamp01(config.volume ?? 0.7),
    sfxVolume: clamp01(config.sfxVolume ?? 0.7),
    muted: false,
    currentTrackId: null,
    unlocked: false,
  })

  // Per-manager singleton: at most one BGM element exists at any time.
  let currentAudio: HTMLAudioElement | null = null
  let unlockCleanup: (() => void) | null = null
  let disposed = false

  function fadeTo(
    audio: HTMLAudioElement,
    target: number,
    options: { onDone?: () => void; isCancelled?: () => boolean } = {}
  ): void {
    if (fadeDuration <= 0) {
      audio.volume = target
      options.onDone?.()
      return
    }
    const steps = 20
    const delta = (target - audio.volume) / steps
    let step = 0
    const timer = setInterval(() => {
      if (options.isCancelled?.()) {
        clearInterval(timer)
        return
      }
      step++
      audio.volume = clamp01(audio.volume + delta)
      if (step >= steps) {
        clearInterval(timer)
        audio.volume = target
        options.onDone?.()
      }
    }, fadeDuration / steps)
  }

  function teardown(audio: HTMLAudioElement): void {
    audio.pause()
    audio.src = ''
  }

  /** Stop (and forget) the current BGM element, optionally with fade-out. */
  function stopCurrent(withFade: boolean): void {
    const audio = currentAudio
    if (!audio) return
    currentAudio = null
    if (withFade && !audio.paused) {
      fadeTo(audio, 0, { onDone: () => teardown(audio) })
    } else {
      teardown(audio)
    }
  }

  /** Retry the pending track after the first user interaction (autoplay policy). */
  function registerUnlockListeners(): void {
    if (unlockCleanup || typeof window === 'undefined') return
    const retry = () => {
      cleanup()
      const { currentTrackId, muted } = store.getState()
      if (disposed || muted || !currentTrackId) return
      const url = tracks[currentTrackId]
      if (url) void startPlayback(url)
    }
    const cleanup = () => {
      window.removeEventListener('pointerdown', retry)
      window.removeEventListener('keydown', retry)
      unlockCleanup = null
    }
    window.addEventListener('pointerdown', retry)
    window.addEventListener('keydown', retry)
    unlockCleanup = cleanup
  }

  /** Create the BGM element for `url`, play it and fade it in. */
  async function startPlayback(url: string): Promise<void> {
    if (typeof Audio === 'undefined') return // Node/SSR: state-only.
    const audio = new Audio(url)
    audio.loop = loop
    audio.volume = 0 // Start silent for fade-in.
    currentAudio = audio
    try {
      await audio.play()
      // Verify this is still the current element (guards races on switches).
      if (currentAudio !== audio) {
        teardown(audio)
        return
      }
      store.setState({ unlocked: true })
      fadeTo(audio, store.getState().volume, {
        isCancelled: () => currentAudio !== audio,
      })
    } catch {
      // Autoplay blocked by the browser — retry after first interaction.
      if (currentAudio === audio) {
        currentAudio = null
        registerUnlockListeners()
      }
    }
  }

  async function playTrack(trackId: string): Promise<void> {
    const url = tracks[trackId]
    if (!url) {
      console.warn(`[overworld/audio] unknown track "${trackId}"`)
      return
    }
    const state = store.getState()
    if (state.currentTrackId === trackId && currentAudio && !currentAudio.paused) return

    stopCurrent(true)
    store.setState({ currentTrackId: trackId })

    // While muted only remember the track; it resumes on unmute.
    if (state.muted) return
    await startPlayback(url)
  }

  function resolveSceneTrack(sceneId: string): string | null {
    return sceneTracks?.[sceneId] ?? null
  }

  async function playSceneTrack(sceneId: string): Promise<void> {
    const trackId = resolveSceneTrack(sceneId)
    if (!trackId) {
      stopTrack()
      return
    }
    await playTrack(trackId)
  }

  function stopTrack(): void {
    stopCurrent(true)
    store.setState({ currentTrackId: null })
  }

  function playSfx(trackId: string): void {
    const url = tracks[trackId]
    if (!url) {
      console.warn(`[overworld/audio] unknown track "${trackId}"`)
      return
    }
    const { muted, sfxVolume } = store.getState()
    if (muted || typeof Audio === 'undefined') return
    const audio = new Audio(url)
    audio.volume = sfxVolume
    void audio.play().catch(() => {
      // One-shots are best-effort; a blocked SFX is not worth retrying.
    })
  }

  function setVolume(volume: number): void {
    const clamped = clamp01(volume)
    store.setState({ volume: clamped })
    if (currentAudio && !currentAudio.paused) currentAudio.volume = clamped
  }

  function setSfxVolume(volume: number): void {
    store.setState({ sfxVolume: clamp01(volume) })
  }

  function setMuted(muted: boolean): void {
    const state = store.getState()
    if (state.muted === muted) return
    store.setState({ muted })
    if (muted) {
      currentAudio?.pause()
      return
    }
    if (currentAudio) {
      // Element exists (was paused by mute): resume at full volume.
      currentAudio.volume = state.volume
      void currentAudio.play().catch(() => registerUnlockListeners())
    } else if (state.currentTrackId) {
      const url = tracks[state.currentTrackId]
      if (url) void startPlayback(url)
    }
  }

  function toggleMute(): void {
    setMuted(!store.getState().muted)
  }

  let unsubscribe: (() => void) | null = null
  if (autoSubscribeSceneChanges && sceneTracks) {
    unsubscribe = bus.on('scene:changed', ({ to }) => {
      void playSceneTrack(to)
    })
  }

  function dispose(): void {
    disposed = true
    unsubscribe?.()
    unsubscribe = null
    unlockCleanup?.()
    stopCurrent(false)
  }

  return {
    store,
    getState: () => store.getState(),
    playTrack,
    playSceneTrack,
    stopTrack,
    playSfx,
    setVolume,
    setSfxVolume,
    setMuted,
    toggleMute,
    resolveSceneTrack,
    dispose,
  }
}
