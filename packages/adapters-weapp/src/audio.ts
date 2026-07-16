/**
 * WeChat audio backend for `@overworld-engine/audio`:
 * `wx.createInnerAudioContext()` mapped onto the audio manager's backend
 * contract.
 *
 * `AudioBackend`/`AudioHandle` are declared here **structurally identical**
 * to `@overworld-engine/audio`'s exports (this package only depends on
 * core/input/platform), so the return value of
 * {@link createWeappAudioBackend} plugs straight into
 * `createAudioManager({ backend })`. The contract-parity test suite runs
 * the same assertions against both this backend and audio's
 * `htmlAudioBackend`.
 */
import { getWx } from './wxTypes'

/**
 * One playable audio source. Structurally identical to
 * `@overworld-engine/audio`'s `AudioHandle`.
 */
export interface AudioHandle {
  /** Start (or resume) playback. */
  play(): Promise<void> | void
  /** Pause playback, keeping the current position. */
  pause(): void
  /** Set the playback volume (0–1). */
  setVolume(volume: number): void
  /** Current playback volume. */
  getVolume(): number
  /** Enable/disable looping. */
  setLoop(loop: boolean): void
  /** Whether the source is currently paused (or never started). */
  isPaused(): boolean
  /** Subscribe to "playback finished" (never fired while looping). Returns unbind. */
  onEnded(callback: () => void): () => void
  /** Release the source. The handle must not be used afterwards. */
  destroy(): void
}

/**
 * Creates {@link AudioHandle}s. Structurally identical to
 * `@overworld-engine/audio`'s `AudioBackend`.
 */
export interface AudioBackend {
  create(url: string): AudioHandle
  isAvailable?(): boolean
}

/**
 * Audio backend over `wx.createInnerAudioContext()` — one context per
 * handle; `destroy()` releases the native resource (the audio manager does
 * this automatically for finished SFX one-shots and replaced BGM).
 *
 * ```ts
 * const audio = createAudioManager({ tracks, backend: createWeappAudioBackend() })
 * ```
 */
export function createWeappAudioBackend(): AudioBackend {
  return {
    isAvailable: () => typeof (globalThis as { wx?: unknown }).wx !== 'undefined',

    create(url: string): AudioHandle {
      const context = getWx().createInnerAudioContext()
      context.src = url
      return {
        play: () => {
          context.play()
        },
        pause: () => {
          context.pause()
        },
        setVolume: (volume) => {
          context.volume = volume
        },
        getVolume: () => context.volume,
        setLoop: (loop) => {
          context.loop = loop
        },
        isPaused: () => context.paused,
        onEnded: (callback) => {
          context.onEnded(callback)
          return () => context.offEnded(callback)
        },
        destroy: () => {
          context.destroy()
        },
      }
    },
  }
}
