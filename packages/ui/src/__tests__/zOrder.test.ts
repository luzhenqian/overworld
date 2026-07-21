import { describe, expect, test } from 'vitest'
import {
  BASE_Z,
  anyWindowOpen,
  closeWindowState,
  focusWindowState,
  openWindowState,
  toggleWindowState,
  type WindowsState,
} from '../zOrder'

const empty: WindowsState = { windows: {}, topZ: BASE_Z }

describe('zOrder reducers', () => {
  test('openWindowState opens with increasing z', () => {
    const a = openWindowState(empty, 'inv')
    const b = openWindowState(a, 'quest')
    expect(a.windows.inv).toEqual({ open: true, z: BASE_Z + 1 })
    expect(b.windows.quest).toEqual({ open: true, z: BASE_Z + 2 })
    expect(b.topZ).toBe(BASE_Z + 2)
  })

  test('openWindowState re-opening an open window refocuses it', () => {
    const s = openWindowState(openWindowState(empty, 'a'), 'b')
    const re = openWindowState(s, 'a')
    expect(re.windows.a!.z).toBeGreaterThan(re.windows.b!.z)
  })

  test('closeWindowState keeps entry but marks closed', () => {
    const s = closeWindowState(openWindowState(empty, 'a'), 'a')
    expect(s.windows.a!.open).toBe(false)
  })

  test('closeWindowState on unknown id is a no-op', () => {
    expect(closeWindowState(empty, 'ghost')).toBe(empty)
  })

  test('toggleWindowState opens then closes', () => {
    const open = toggleWindowState(empty, 'a')
    expect(open.windows.a!.open).toBe(true)
    const closed = toggleWindowState(open, 'a')
    expect(closed.windows.a!.open).toBe(false)
  })

  test('focusWindowState bumps only open windows', () => {
    const s = openWindowState(openWindowState(empty, 'a'), 'b')
    const f = focusWindowState(s, 'a')
    expect(f.windows.a!.z).toBe(f.topZ)
    expect(f.windows.a!.z).toBeGreaterThan(f.windows.b!.z)
    const closed = closeWindowState(f, 'a')
    expect(focusWindowState(closed, 'a')).toBe(closed)
  })

  test('anyWindowOpen', () => {
    expect(anyWindowOpen(empty.windows)).toBe(false)
    expect(anyWindowOpen(openWindowState(empty, 'a').windows)).toBe(true)
    expect(anyWindowOpen(closeWindowState(openWindowState(empty, 'a'), 'a').windows)).toBe(false)
  })
})
