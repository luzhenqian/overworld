import { describe, expect, it } from 'vitest'
import { createSceneTheme, defaultSceneTheme } from '../types'

describe('createSceneTheme', () => {
  it('returns the default theme when called without overrides', () => {
    expect(createSceneTheme()).toEqual(defaultSceneTheme)
  })

  it('deep-merges partial overrides onto the default theme', () => {
    const theme = createSceneTheme({
      npc: { primaryColor: '#ff00ff' },
      building: { ringOpacity: 0.2 },
    })
    expect(theme.npc.primaryColor).toBe('#ff00ff')
    expect(theme.npc.nameLabelBg).toBe(defaultSceneTheme.npc.nameLabelBg)
    expect(theme.building.ringOpacity).toBe(0.2)
    expect(theme.building.primaryColor).toBe(defaultSceneTheme.building.primaryColor)
  })

  it('does not mutate the default theme', () => {
    const before = JSON.stringify(defaultSceneTheme)
    createSceneTheme({ npc: { primaryColor: '#123456' } })
    expect(JSON.stringify(defaultSceneTheme)).toBe(before)
  })
})
