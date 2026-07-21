import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// preloadManifest fires `useGLTF.preload(url)` for model URLs; stub it out so
// importing the real drei package (and its three.js/GLTFLoader chain) isn't
// required just to exercise the image/audio paths below.
vi.mock('@react-three/drei', () => ({
  useGLTF: Object.assign(() => {}, { preload: vi.fn() }),
}))

class StubImage {
  static instances: StubImage[] = []
  onload: (() => void) | null = null
  onerror: ((e?: unknown) => void) | null = null
  src = ''
  constructor() {
    StubImage.instances.push(this)
  }
}

class StubAudio {
  static instances: StubAudio[] = []
  oncanplaythrough: (() => void) | null = null
  onerror: ((e?: unknown) => void) | null = null
  preload = ''
  src = ''
  constructor() {
    StubAudio.instances.push(this)
  }
}

/**
 * These tests exercise the real-browser branch of `preloadManifest`
 * (`typeof window !== 'undefined'`), which the plain manifest.test.ts suite
 * never reaches — that suite relies on the default Node test environment
 * having no `window`, so it only covers the SSR no-op path. `window`,
 * `Image`, and `Audio` are stubbed globals here so we can drive
 * onload/onerror by hand and assert on the promise the function returns.
 */
describe('preloadManifest (browser path)', () => {
  beforeEach(() => {
    vi.resetModules()
    StubImage.instances = []
    StubAudio.instances = []
    vi.stubGlobal('window', {})
    vi.stubGlobal('Image', StubImage)
    vi.stubGlobal('Audio', StubAudio)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('Bug 1: rejects when an image errors, and onProgress still reaches 1', async () => {
    const { preloadManifest } = await import('../manifest')
    const progress: number[] = []

    const promise = preloadManifest(
      { images: ['/images/broken.png'] },
      { onProgress: (f) => progress.push(f) }
    )

    expect(StubImage.instances).toHaveLength(1)
    StubImage.instances[0]!.onerror?.()

    await expect(promise).rejects.toBeTruthy()
    expect(progress[progress.length - 1]).toBe(1)
  })

  it('Bug 2: a failed URL is evicted from the dedup cache and re-attempted by a later call', async () => {
    const { preloadManifest } = await import('../manifest')
    const url = '/images/retry-me.png'

    const first = preloadManifest({ images: [url] })
    expect(StubImage.instances).toHaveLength(1)
    StubImage.instances[0]!.onerror?.()
    await expect(first).rejects.toBeTruthy()

    // A second call with the SAME url must construct a NEW Image — i.e. the
    // failed url was evicted from `preloadedUrls`, not left dedup-filtered.
    const second = preloadManifest({ images: [url] })
    expect(StubImage.instances).toHaveLength(2)
    StubImage.instances[1]!.onload?.()

    await expect(second).resolves.toBeUndefined()
  })

  it('a successfully-loaded URL stays deduped on a later call', async () => {
    const { preloadManifest } = await import('../manifest')
    const url = '/images/ok.png'

    const first = preloadManifest({ images: [url] })
    expect(StubImage.instances).toHaveLength(1)
    StubImage.instances[0]!.onload?.()
    await expect(first).resolves.toBeUndefined()

    // Same url again: no new Image should be constructed, and it resolves
    // immediately since `total` is 0 for the (fully deduped) manifest.
    const second = preloadManifest({ images: [url] })
    expect(StubImage.instances).toHaveLength(1)
    await expect(second).resolves.toBeUndefined()
  })
})
