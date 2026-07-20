/**
 * Audio backend abstraction: the seam between the audio manager's pure
 * logic (track state, fades, mute, scene mapping) and the actual playback
 * technology. The default {@link htmlAudioBackend} wraps `HTMLAudioElement`
 * (`new Audio(url)`), preserving the manager's historical behavior; other
 * environments inject their own backend — e.g.
 * `createWeappAudioBackend()` from `@overworld-engine/adapters-weapp`,
 * which maps the same contract onto `wx.createInnerAudioContext()`.
 *
 * The interface is deliberately minimal: exactly what the manager needs to
 * run BGM (play/pause, volume get+set for fades, loop, paused query,
 * teardown) plus `onEnded`, which the manager uses to release one-shot SFX
 * handles as soon as they finish.
 */

/** One playable audio source created by an {@link AudioBackend}. */
export interface AudioHandle {
  /**
   * Start (or resume) playback. May return a promise that rejects when the
   * platform blocks playback (browser autoplay policy) — the manager then
   * retries after the first user interaction.
   */
  play(): Promise<void> | void
  /** Pause playback, keeping the current position. */
  pause(): void
  /** Set the playback volume (the manager only passes values in 0–1). */
  setVolume(volume: number): void
  /** Current playback volume (read by the fade loop). */
  getVolume(): number
  /** Enable/disable looping. */
  setLoop(loop: boolean): void
  /** Whether the source is currently paused (or never started). */
  isPaused(): boolean
  /**
   * Subscribe to the "playback finished" signal (never fired for looping
   * sources). Returns an unsubscribe function.
   */
  onEnded(callback: () => void): () => void
  /** Release the source. The handle must not be used afterwards. */
  destroy(): void
}

/** Creates {@link AudioHandle}s for a playback technology. */
export interface AudioBackend {
  /** Create a handle for `url`. Playback does not start until `play()`. */
  create(url: string): AudioHandle
  /**
   * Whether the backend can actually play in the current environment.
   * When it returns `false` the manager only tracks state (Node/SSR
   * safety). Omitted = always available.
   */
  isAvailable?(): boolean
}

/**
 * The default backend: `HTMLAudioElement` via the global `Audio`
 * constructor. `isAvailable()` reports `false` in Node/SSR, where the
 * manager degrades to state-only tracking (historical behavior).
 */
export const htmlAudioBackend: AudioBackend = {
  isAvailable: () => typeof Audio !== 'undefined',

  create(url: string): AudioHandle {
    const audio = new Audio(url)
    return {
      play: () => audio.play(),
      pause: () => {
        audio.pause()
      },
      setVolume: (volume) => {
        audio.volume = volume
      },
      getVolume: () => audio.volume,
      setLoop: (loop) => {
        audio.loop = loop
      },
      isPaused: () => audio.paused,
      onEnded: (callback) => {
        // Optional call: test stand-ins for `Audio` often skip the
        // EventTarget surface; a handle without events simply never ends.
        audio.addEventListener?.('ended', callback)
        return () => audio.removeEventListener?.('ended', callback)
      },
      destroy: () => {
        audio.pause()
        audio.src = ''
      },
    }
  },
}

/** No-op backend for headless/muted tests: state is queryable, nothing plays. */
export const silentBackend: AudioBackend = {
  isAvailable: () => true,
  create(_url: string): AudioHandle {
    let volume = 1
    let paused = true
    return {
      play() {
        paused = false
      },
      pause() {
        paused = true
      },
      setVolume(v: number) {
        volume = v
      },
      getVolume() {
        return volume
      },
      setLoop(_loop: boolean) {
        // no-op
      },
      isPaused() {
        return paused
      },
      onEnded(_callback: () => void) {
        // Never fires in silent backend; return no-op unsubscribe
        return () => {}
      },
      destroy() {
        // no-op
      },
    }
  },
}
