import { describe, expect, it } from 'vitest'
import { createAudioManager } from '../audioManager'
import { silentBackend } from '../backend'

describe('audio zones + buses (silent backend)', () => {
  it('crossfades ambient zone volume by listener distance', () => {
    const mgr = createAudioManager({
      tracks: { forest: 'forest.mp3' },
      backend: silentBackend,
      autoSubscribeSceneChanges: false,
    })
    mgr.setAmbientZones([
      { id: 'forest', trackId: 'forest', center: [0, 0, 0], innerRadius: 5, outerRadius: 15 },
    ])
    mgr.updateListener([0, 0, 0])
    expect(mgr.getState().ambientWeights?.forest).toBeCloseTo(1)
    mgr.updateListener([10, 0, 0])
    expect(mgr.getState().ambientWeights?.forest).toBeCloseTo(0.5)
    mgr.dispose()
  })

  it('bus volume cascades through master', () => {
    const mgr = createAudioManager({
      tracks: {},
      backend: silentBackend,
      buses: { master: 0.5, music: 0.8, ambience: 1, sfx: 1 },
      autoSubscribeSceneChanges: false,
    })
    expect(mgr.getBusVolume('music')).toBe(0.8)
    mgr.setBusVolume('master', 0.25)
    expect(mgr.getBusVolume('master')).toBe(0.25)
    mgr.dispose()
  })
})
