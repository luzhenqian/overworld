import { beforeEach, describe, expect, it } from 'vitest'
import { defineAssetManifest, mergeManifests, preloadManifest } from '../manifest'
import { useLoadingStore } from '../loadingStore'

describe('defineAssetManifest', () => {
  it('is an identity function (returns the exact same object)', () => {
    const manifest = { models: ['/models/a.glb'], audio: ['/audio/bgm/a.mp3'] }
    expect(defineAssetManifest(manifest)).toBe(manifest)
  })

  it('accepts an empty manifest', () => {
    expect(defineAssetManifest({})).toEqual({})
  })
})

describe('mergeManifests', () => {
  it('returns an empty manifest for no inputs', () => {
    expect(mergeManifests()).toEqual({})
  })

  it('returns an empty manifest for empty inputs', () => {
    expect(mergeManifests({}, {})).toEqual({})
  })

  it('merges categories across manifests', () => {
    const merged = mergeManifests(
      { models: ['/models/a.glb'], audio: ['/audio/a.mp3'] },
      { models: ['/models/b.glb'], images: ['/images/a.png'] }
    )
    expect(merged).toEqual({
      models: ['/models/a.glb', '/models/b.glb'],
      audio: ['/audio/a.mp3'],
      images: ['/images/a.png'],
    })
  })

  it('dedupes URLs within a category, preserving first-seen order', () => {
    const merged = mergeManifests(
      { models: ['/models/a.glb', '/models/b.glb'] },
      { models: ['/models/b.glb', '/models/c.glb', '/models/a.glb'] }
    )
    expect(merged.models).toEqual(['/models/a.glb', '/models/b.glb', '/models/c.glb'])
  })

  it('dedupes within a single manifest too', () => {
    expect(mergeManifests({ audio: ['/a.mp3', '/a.mp3'] })).toEqual({ audio: ['/a.mp3'] })
  })

  it('leaves categories absent from every input undefined', () => {
    const merged = mergeManifests({ models: ['/models/a.glb'] })
    expect(merged.audio).toBeUndefined()
    expect(merged.images).toBeUndefined()
    expect(merged.fonts).toBeUndefined()
  })
})

describe('preloadManifest', () => {
  beforeEach(() => {
    useLoadingStore.getState().reset()
  })

  it('does not crash in Node (browser APIs guarded, becomes a no-op)', () => {
    expect(() =>
      preloadManifest({
        models: ['/models/a.glb'],
        audio: ['/audio/a.mp3'],
        images: ['/images/a.png'],
        fonts: ['/fonts/a.woff2'],
      })
    ).not.toThrow()
  })

  it('accepts an empty manifest and category filters', () => {
    expect(() => preloadManifest({})).not.toThrow()
    expect(() =>
      preloadManifest({ models: ['/models/b.glb'] }, { categories: ['models'] })
    ).not.toThrow()
  })

  it('never touches the loading store (no fake progress tasks)', () => {
    preloadManifest({ models: ['/models/c.glb'], audio: ['/audio/c.mp3'] })
    const state = useLoadingStore.getState()
    expect(state.tasks).toEqual({})
    expect(state.isLoading).toBe(false)
    expect(state.progress).toBe(0)
  })
})
