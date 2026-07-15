import { beforeEach, describe, expect, it } from 'vitest'
import { KEYBOARD_PRIORITY, useKeyboardStore } from '../keyboardStore'

const store = () => useKeyboardStore.getState()

beforeEach(() => {
  useKeyboardStore.setState({ activeLayers: [] })
})

describe('registerLayer / unregisterLayer', () => {
  it('registers layers sorted by priority descending', () => {
    store().registerLayer({ id: 'panel', priority: KEYBOARD_PRIORITY.SIDE_PANEL })
    store().registerLayer({ id: 'modal', priority: KEYBOARD_PRIORITY.SYSTEM_MODAL })
    store().registerLayer({ id: 'game', priority: KEYBOARD_PRIORITY.GAME_CONTROLS })

    expect(store().activeLayers.map((l) => l.id)).toEqual(['modal', 'panel', 'game'])
  })

  it('replaces a layer when the same id is re-registered', () => {
    store().registerLayer({ id: 'panel', priority: 60 })
    store().registerLayer({ id: 'panel', priority: 90, blockedKeys: ['e'] })

    expect(store().activeLayers).toHaveLength(1)
    expect(store().activeLayers[0]).toEqual({ id: 'panel', priority: 90, blockedKeys: ['e'] })
  })

  it('unregisters a layer by id', () => {
    store().registerLayer({ id: 'a', priority: 10 })
    store().registerLayer({ id: 'b', priority: 20 })
    store().unregisterLayer('a')

    expect(store().activeLayers.map((l) => l.id)).toEqual(['b'])
  })

  it('unregistering an unknown id is a no-op', () => {
    store().registerLayer({ id: 'a', priority: 10 })
    store().unregisterLayer('missing')

    expect(store().activeLayers).toHaveLength(1)
  })
})

describe('isKeyBlocked', () => {
  it('blocks all keys when a higher-priority layer has no blockedKeys', () => {
    store().registerLayer({ id: 'modal', priority: KEYBOARD_PRIORITY.SYSTEM_MODAL })

    expect(store().isKeyBlocked('e', KEYBOARD_PRIORITY.GAME_CONTROLS)).toBe(true)
    expect(store().isKeyBlocked('anything', KEYBOARD_PRIORITY.GAME_CONTROLS)).toBe(true)
  })

  it('only blocks listed keys when blockedKeys is specified', () => {
    store().registerLayer({
      id: 'dialogue',
      priority: KEYBOARD_PRIORITY.NPC_DIALOGUE,
      blockedKeys: ['e', 'escape'],
    })

    expect(store().isKeyBlocked('e', KEYBOARD_PRIORITY.GAME_CONTROLS)).toBe(true)
    expect(store().isKeyBlocked('Escape', KEYBOARD_PRIORITY.GAME_CONTROLS)).toBe(true)
    expect(store().isKeyBlocked('w', KEYBOARD_PRIORITY.GAME_CONTROLS)).toBe(false)
  })

  it('matches keys case-insensitively against lowercase blockedKeys', () => {
    store().registerLayer({ id: 'panel', priority: 60, blockedKeys: ['q'] })

    expect(store().isKeyBlocked('Q', 10)).toBe(true)
  })

  it('does not block for handlers at equal or higher priority', () => {
    store().registerLayer({ id: 'panel', priority: 60 })

    expect(store().isKeyBlocked('e', 60)).toBe(false)
    expect(store().isKeyBlocked('e', 100)).toBe(false)
    expect(store().isKeyBlocked('e', 10)).toBe(true)
  })

  it('defaults forPriority to DEFAULT (0)', () => {
    store().registerLayer({ id: 'game', priority: KEYBOARD_PRIORITY.GAME_CONTROLS })

    expect(store().isKeyBlocked('e')).toBe(true)
  })

  it('checks every higher-priority layer, not just the top one', () => {
    store().registerLayer({ id: 'top', priority: 100, blockedKeys: ['x'] })
    store().registerLayer({ id: 'mid', priority: 60, blockedKeys: ['e'] })

    // 'e' passes the top layer but is blocked by the mid layer.
    expect(store().isKeyBlocked('e', 10)).toBe(true)
    // 'w' passes both.
    expect(store().isKeyBlocked('w', 10)).toBe(false)
  })

  it('blocks nothing when no layers are active', () => {
    expect(store().isKeyBlocked('e', 0)).toBe(false)
  })
})

describe('getActiveMaxPriority', () => {
  it('returns DEFAULT when no layers are active', () => {
    expect(store().getActiveMaxPriority()).toBe(KEYBOARD_PRIORITY.DEFAULT)
  })

  it('returns the highest registered priority', () => {
    store().registerLayer({ id: 'a', priority: 10 })
    store().registerLayer({ id: 'b', priority: 75 })

    expect(store().getActiveMaxPriority()).toBe(75)
  })
})

describe('shouldHandleKey', () => {
  it('mirrors isKeyBlocked', () => {
    store().registerLayer({ id: 'modal', priority: 100 })

    expect(store().shouldHandleKey('e', 10)).toBe(false)
    expect(store().shouldHandleKey('e', 100)).toBe(true)

    store().unregisterLayer('modal')
    expect(store().shouldHandleKey('e', 10)).toBe(true)
  })
})
