import { persist } from 'zustand/middleware'
import type { StateStorage } from 'zustand/middleware'
import { createStore, type StoreApi } from 'zustand/vanilla'
import {
  createMemoryStorage,
  gameEvents,
  persistOptions,
  type EventBus,
  type OverworldEventMap,
  type Vec3,
} from '@overworld-engine/core'
import { htmlAudioBackend, type AudioBackend, type AudioHandle } from './backend'
import { zoneWeight, mixBuses, type BusName, type AmbientZone } from './ambientZones'

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
   * Playback backend. Defaults to {@link htmlAudioBackend} (`new Audio(url)`,
   * historical behavior). Inject e.g. `createWeappAudioBackend()` from
   * `@overworld-engine/adapters-weapp` on WeChat mini-games.
   */
  backend?: AudioBackend
  /**
   * Pause the BGM on `app:paused` and resume it on `app:resumed` (events
   * emitted on the configured bus by `@overworld-engine/platform` bridges'
   * `bindLifecycle`). Defaults to `false` — no subscription, historical
   * behavior. `dispose()` unsubscribes.
   */
  pauseOnHide?: boolean
  /**
   * Persist volume/mute settings (localStorage under `overworld:audio`).
   * Framework convention: omitted or `false` = disabled; `true` = enabled
   * with defaults; object = custom.
   */
  persist?: boolean | AudioPersistConfig
  /**
   * Initial named-bus volumes (0–1 each), mixed multiplicatively with
   * `master` by {@link mixBuses}. Missing buses default to `master: 1`,
   * `music: volume`, `ambience: 1`, `sfx: sfxVolume`.
   */
  buses?: Partial<Record<BusName, number>>
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
  /** Named-bus volumes (0–1 each); `master` scales the other three. Not persisted. */
  buses: Record<BusName, number>
  /** Per-zone crossfade weight (0–1) from the last {@link AudioManager.updateListener} call. */
  ambientWeights: Record<string, number>
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
  /** Set a named bus's volume (clamped to 0–1). `master` scales the other three. */
  setBusVolume: (bus: BusName, volume: number) => void
  /** Read a named bus's current volume. */
  getBusVolume: (bus: BusName) => number
  /**
   * Replace the active ambient zones. Each zone's track loops at a gain
   * crossfaded by listener distance (see {@link updateListener}) on the
   * `ambience` bus; zones are lazily backed by one looping handle per
   * `trackId`, created on first `updateListener` call after being set.
   */
  setAmbientZones: (zones: AmbientZone[]) => void
  /**
   * Recompute per-zone crossfade weights for the listener position and
   * apply them (`ambientWeights` in state, plus each zone handle's volume
   * and play/pause state) on the `ambience` bus.
   */
  updateListener: (position: Vec3) => void
  /**
   * Fire a one-shot sound effect on the `sfx` bus, optionally attenuated by
   * distance between `opts.listener` and `opts.at` (linear falloff over 30
   * units on the XZ plane, floored at 0).
   */
  playCue: (sfxId: string, opts?: { listener?: Vec3; at?: Vec3 }) => void
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
 * Create an audio manager: a singleton BGM handle with fade in/out on track
 * switches, browser autoplay-policy handling (playback retries after the
 * first user interaction) and optional persisted volume/mute settings (opt
 * in via `persist`, like every other engine).
 *
 * Playback goes through an injectable {@link AudioBackend}; the default is
 * {@link htmlAudioBackend} (`new Audio(url)`, historical behavior). All
 * browser APIs are guarded, so the manager is safe to create (and its pure
 * logic testable) in Node/SSR — it simply tracks state without playing.
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
  const backend = config.backend ?? htmlAudioBackend

  const initialVolume = clamp01(config.volume ?? 0.7)
  const initialSfxVolume = clamp01(config.sfxVolume ?? 0.7)
  const defaultBuses: Record<BusName, number> = {
    master: clamp01(config.buses?.master ?? 1),
    music: clamp01(config.buses?.music ?? initialVolume),
    ambience: clamp01(config.buses?.ambience ?? 1),
    sfx: clamp01(config.buses?.sfx ?? initialSfxVolume),
  }

  const store = createAudioStore(config.persist, {
    volume: initialVolume,
    sfxVolume: initialSfxVolume,
    muted: false,
    currentTrackId: null,
    unlocked: false,
    buses: defaultBuses,
    ambientWeights: {},
  })

  // Per-manager singleton: at most one BGM handle exists at any time.
  let currentAudio: AudioHandle | null = null
  let unlockCleanup: (() => void) | null = null
  let disposed = false
  // Ambient zones: last configuration set via `setAmbientZones`, and one
  // lazily-created looping handle per zone id (keyed by zone, not track, so
  // two zones sharing a `trackId` still crossfade independently). Handles
  // are created on first `updateListener` call after a zone is set.
  let ambientZonesRef: AmbientZone[] = []
  const zoneHandles = new Map<string, AudioHandle>()

  /** Whether the backend can actually play here (Node/SSR: state-only). */
  const backendAvailable = (): boolean => backend.isAvailable?.() ?? true

  /** `handle.play()` normalized to a promise (sync throws become rejections). */
  async function playHandle(handle: AudioHandle): Promise<void> {
    await handle.play()
  }

  function fadeTo(
    audio: AudioHandle,
    target: number,
    options: { onDone?: () => void; isCancelled?: () => boolean } = {}
  ): void {
    if (fadeDuration <= 0) {
      audio.setVolume(target)
      options.onDone?.()
      return
    }
    const steps = 20
    const delta = (target - audio.getVolume()) / steps
    let step = 0
    const timer = setInterval(() => {
      if (options.isCancelled?.()) {
        clearInterval(timer)
        return
      }
      step++
      audio.setVolume(clamp01(audio.getVolume() + delta))
      if (step >= steps) {
        clearInterval(timer)
        audio.setVolume(target)
        options.onDone?.()
      }
    }, fadeDuration / steps)
  }

  /** Stop (and forget) the current BGM handle, optionally with fade-out. */
  function stopCurrent(withFade: boolean): void {
    const audio = currentAudio
    if (!audio) return
    currentAudio = null
    if (withFade && !audio.isPaused()) {
      fadeTo(audio, 0, { onDone: () => audio.destroy() })
    } else {
      audio.destroy()
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

  /** Create the BGM handle for `url`, play it and fade it in. */
  async function startPlayback(url: string): Promise<void> {
    if (!backendAvailable()) return // Node/SSR: state-only.
    const audio = backend.create(url)
    audio.setLoop(loop)
    audio.setVolume(0) // Start silent for fade-in.
    currentAudio = audio
    try {
      await playHandle(audio)
      // Verify this is still the current handle (guards races on switches).
      if (currentAudio !== audio) {
        audio.destroy()
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
    if (state.currentTrackId === trackId && currentAudio && !currentAudio.isPaused()) return

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
    if (muted || !backendAvailable()) return
    const audio = backend.create(url)
    audio.setLoop(false)
    audio.setVolume(sfxVolume)
    // Release the handle as soon as the one-shot finishes (backends like
    // wx.createInnerAudioContext hold real native resources per handle).
    const unbind = audio.onEnded(() => {
      unbind()
      audio.destroy()
    })
    void playHandle(audio).catch(() => {
      // One-shots are best-effort; a blocked SFX is not worth retrying.
    })
  }

  function setVolume(volume: number): void {
    const clamped = clamp01(volume)
    store.setState({ volume: clamped })
    if (currentAudio && !currentAudio.isPaused()) currentAudio.setVolume(clamped)
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
      // Handle exists (was paused by mute): resume at full volume.
      currentAudio.setVolume(state.volume)
      void playHandle(currentAudio).catch(() => registerUnlockListeners())
    } else if (state.currentTrackId) {
      const url = tracks[state.currentTrackId]
      if (url) void startPlayback(url)
    }
  }

  function toggleMute(): void {
    setMuted(!store.getState().muted)
  }

  function setBusVolume(busName: BusName, volume: number): void {
    store.setState((s) => ({ buses: { ...s.buses, [busName]: clamp01(volume) } }))
  }

  function getBusVolume(busName: BusName): number {
    return store.getState().buses[busName]
  }

  /** Apply a zone's current weight to its (lazily-created) handle. */
  function applyZoneWeight(zone: AmbientZone, weight: number): void {
    if (!backendAvailable()) return
    let handle = zoneHandles.get(zone.id)
    if (!handle) {
      const url = tracks[zone.trackId]
      if (!url) {
        console.warn(`[overworld/audio] unknown ambient zone track "${zone.trackId}"`)
        return
      }
      handle = backend.create(url)
      handle.setLoop(true)
      handle.setVolume(0)
      zoneHandles.set(zone.id, handle)
    }
    const { muted, buses } = store.getState()
    const gain = weight * mixBuses(buses, 'ambience')
    handle.setVolume(muted ? 0 : gain)
    if (weight > 0 && !muted) {
      void playHandle(handle).catch(() => {
        // Ambient zones are best-effort, same as SFX: a blocked play is not worth retrying.
      })
    } else {
      handle.pause()
    }
  }

  function setAmbientZones(zones: AmbientZone[]): void {
    ambientZonesRef = zones
    const activeIds = new Set(zones.map((z) => z.id))
    // Tear down handles for zones that are no longer configured.
    for (const [id, handle] of zoneHandles) {
      if (!activeIds.has(id)) {
        handle.destroy()
        zoneHandles.delete(id)
      }
    }
  }

  function updateListener(position: Vec3): void {
    const weights: Record<string, number> = {}
    for (const zone of ambientZonesRef) {
      const weight = zoneWeight(zone, position)
      weights[zone.id] = weight
      applyZoneWeight(zone, weight)
    }
    store.setState({ ambientWeights: weights })
  }

  function playCue(sfxId: string, opts?: { listener?: Vec3; at?: Vec3 }): void {
    const url = tracks[sfxId]
    if (!url) {
      console.warn(`[overworld/audio] unknown track "${sfxId}"`)
      return
    }
    const { muted, buses } = store.getState()
    if (muted || !backendAvailable()) return
    let atten = 1
    if (opts?.listener && opts?.at) {
      const dx = opts.listener[0] - opts.at[0]
      const dz = opts.listener[2] - opts.at[2]
      const d = Math.hypot(dx, dz)
      atten = Math.max(0, 1 - d / 30)
    }
    const handle = backend.create(url)
    handle.setLoop(false)
    handle.setVolume(atten * mixBuses(buses, 'sfx'))
    const unbind = handle.onEnded(() => {
      unbind()
      handle.destroy()
    })
    void playHandle(handle).catch(() => {
      // One-shots are best-effort; a blocked cue is not worth retrying.
    })
  }

  let unsubscribe: (() => void) | null = null
  if (autoSubscribeSceneChanges && sceneTracks) {
    unsubscribe = bus.on('scene:changed', ({ to }) => {
      void playSceneTrack(to)
    })
  }

  // `app:paused` / `app:resumed` are merged into OverworldEventMap by
  // `@overworld-engine/platform` (which audio does not depend on), so the
  // bus is viewed through a local structural map for these two events.
  const lifecycleBus = bus as unknown as EventBus<{
    'app:paused': Record<string, never>
    'app:resumed': Record<string, never>
  }>
  const lifecycleUnsubs: Array<() => void> = []
  if (config.pauseOnHide) {
    // Only resume what *this* subscription paused: an already-paused (muted,
    // stopped) BGM must stay paused when the app comes back.
    let pausedByLifecycle = false
    lifecycleUnsubs.push(
      lifecycleBus.on('app:paused', () => {
        if (currentAudio && !currentAudio.isPaused()) {
          pausedByLifecycle = true
          currentAudio.pause()
        }
      }),
      lifecycleBus.on('app:resumed', () => {
        if (!pausedByLifecycle) return
        pausedByLifecycle = false
        if (disposed || store.getState().muted || !currentAudio) return
        void playHandle(currentAudio).catch(() => registerUnlockListeners())
      })
    )
  }

  function dispose(): void {
    disposed = true
    unsubscribe?.()
    unsubscribe = null
    for (const off of lifecycleUnsubs.splice(0, lifecycleUnsubs.length)) off()
    unlockCleanup?.()
    stopCurrent(false)
    for (const handle of zoneHandles.values()) handle.destroy()
    zoneHandles.clear()
    ambientZonesRef = []
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
    setBusVolume,
    getBusVolume,
    setAmbientZones,
    updateListener,
    playCue,
    dispose,
  }
}
