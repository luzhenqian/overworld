import { describe, expect, it } from 'vitest'
import { parseLayerOpts } from '../hooks'
import { resolveJoystickOutput } from '../joystickMath'

describe('parseLayerOpts', () => {
  it('reads the legacy array form as blockedKeys with no lock', () => {
    expect(parseLayerOpts(['e', 'q'])).toEqual({ blockedKeys: ['e', 'q'], lockInput: false })
  })
  it('reads the object form with lockInput', () => {
    expect(parseLayerOpts({ blockedKeys: ['e'], lockInput: true })).toEqual({
      blockedKeys: ['e'],
      lockInput: true,
    })
  })
  it('defaults to no blockedKeys, no lock when omitted', () => {
    expect(parseLayerOpts(undefined)).toEqual({ blockedKeys: undefined, lockInput: false })
  })
})

describe('resolveJoystickOutput', () => {
  const raw = { x: 0.8, z: -0.5, running: true }
  it('passes the raw vector through when not locked', () => {
    expect(resolveJoystickOutput(raw, { locked: false, respect: true })).toEqual(raw)
  })
  it('zeroes output when locked and respecting the lock', () => {
    expect(resolveJoystickOutput(raw, { locked: true, respect: true })).toEqual({ x: 0, z: 0, running: false })
  })
  it('ignores the lock when respect is false', () => {
    expect(resolveJoystickOutput(raw, { locked: true, respect: false })).toEqual(raw)
  })
})
