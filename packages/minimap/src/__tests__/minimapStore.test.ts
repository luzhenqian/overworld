import { beforeEach, describe, expect, it } from 'vitest'
import { useMinimapStore, type MinimapMarker } from '../minimapStore'

const npc: MinimapMarker = { id: 'npc:yi-he', kind: 'npc', position: [4, 0, -2], label: '易禾' }

describe('useMinimapStore', () => {
  beforeEach(() => {
    useMinimapStore.getState().clearMarkers()
  })

  it('registers and unregisters markers by id', () => {
    const store = useMinimapStore.getState()
    store.registerMarker(npc)
    store.registerMarker({ id: 'shop:bank', kind: 'building', position: [10, 0, 10] })
    expect(Object.keys(useMinimapStore.getState().markers).sort()).toEqual([
      'npc:yi-he',
      'shop:bank',
    ])

    store.unregisterMarker('npc:yi-he')
    expect(useMinimapStore.getState().markers['npc:yi-he']).toBeUndefined()
    expect(useMinimapStore.getState().markers['shop:bank']).toBeDefined()
  })

  it('replaces a marker registered with an existing id', () => {
    const store = useMinimapStore.getState()
    store.registerMarker(npc)
    store.registerMarker({ id: 'npc:yi-he', kind: 'npc', position: [9, 0, 9], color: '#f00' })
    const marker = useMinimapStore.getState().markers['npc:yi-he']
    expect(marker?.position).toEqual([9, 0, 9])
    expect(marker?.color).toBe('#f00')
  })

  it('moves markers with setMarkerPosition, keeping other fields', () => {
    const store = useMinimapStore.getState()
    store.registerMarker(npc)
    store.setMarkerPosition('npc:yi-he', [7, 1, 3])
    const marker = useMinimapStore.getState().markers['npc:yi-he']
    expect(marker?.position).toEqual([7, 1, 3])
    expect(marker?.kind).toBe('npc')
    expect(marker?.label).toBe('易禾')
  })

  it('ignores unregister/setMarkerPosition for unknown ids without state churn', () => {
    const store = useMinimapStore.getState()
    store.registerMarker(npc)
    const before = useMinimapStore.getState().markers
    store.unregisterMarker('ghost')
    store.setMarkerPosition('ghost', [0, 0, 0])
    expect(useMinimapStore.getState().markers).toBe(before)
  })

  it('clears all markers', () => {
    const store = useMinimapStore.getState()
    store.registerMarker(npc)
    store.registerMarker({ id: 'b', position: [1, 0, 1] })
    store.clearMarkers()
    expect(useMinimapStore.getState().markers).toEqual({})
  })

  it('notifies subscribers on changes', () => {
    let notified = 0
    const unsubscribe = useMinimapStore.subscribe(() => {
      notified++
    })
    useMinimapStore.getState().registerMarker(npc)
    useMinimapStore.getState().setMarkerPosition(npc.id, [1, 0, 1])
    unsubscribe()
    expect(notified).toBe(2)
  })
})
