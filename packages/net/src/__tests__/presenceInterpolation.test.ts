import { EventBus, type OverworldEventMap } from '@overworld-engine/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPresenceSync, type PresenceSync } from '../presence'
import { createLocalTransportHub, type LocalTransportHub } from '../transport'

type Vec3 = [number, number, number]

describe('createPresenceSync interpolation', () => {
  let hub: LocalTransportHub
  let posA: Vec3
  let rotA: number
  let syncA: PresenceSync
  let syncB: PresenceSync

  const makeSyncB = (interpolation?: { delayMs?: number } | false) =>
    createPresenceSync({
      transport: hub.createTransport('B'),
      getLocal: () => ({ position: [50, 0, 50] }),
      events: new EventBus<OverworldEventMap>(),
      ...(interpolation !== undefined && { interpolation }),
    })

  beforeEach(() => {
    vi.useFakeTimers()
    hub = createLocalTransportHub()
    posA = [0, 0, 0]
    rotA = 0
    syncA = createPresenceSync({
      transport: hub.createTransport('A'),
      getLocal: () => ({ position: posA, rotationY: rotA }),
      events: new EventBus<OverworldEventMap>(),
    })
  })

  afterEach(() => {
    syncA.stop()
    syncB.stop()
    vi.useRealTimers()
  })

  it('is disabled by default: samplePeer returns null even with data', () => {
    syncB = makeSyncB()
    syncB.start()
    syncA.start()
    vi.advanceTimersByTime(600)
    expect(syncB.interpolationEnabled).toBe(false)
    expect(syncB.store.getState()['A']).toBeDefined()
    expect(syncB.samplePeer('A')).toBeNull()
  })

  it('samples smoothly between two received positions at the delayed timepoint', () => {
    syncB = makeSyncB({ delayMs: 100 })
    syncB.start() // subscribe before A's first beat
    syncA.start() // immediate tick → B buffers snapshot #1 at t0
    expect(syncB.interpolationEnabled).toBe(true)

    // Single snapshot → returned as-is.
    expect(syncB.samplePeer('A')).toEqual({ position: [0, 0, 0], rotationY: 0 })

    posA = [10, 0, 0]
    rotA = 1
    vi.advanceTimersByTime(100) // A's next beat → snapshot #2 at t0 + 100

    // now = t0 + 100 → render time = t0 → exactly snapshot #1.
    const atStart = syncB.samplePeer('A')
    expect(atStart?.position[0]).toBeCloseTo(0)
    expect(atStart?.rotationY).toBeCloseTo(0)

    // now = t0 + 150 → render time = t0 + 50 → midpoint of the snapshots.
    vi.advanceTimersByTime(50)
    const mid = syncB.samplePeer('A')
    expect(mid?.position).toEqual([5, 0, 0])
    expect(mid?.rotationY).toBeCloseTo(0.5)

    // Quarter of the way a frame-ish later: still monotonic, no snapping.
    vi.advanceTimersByTime(25) // render time = t0 + 75 → t = 0.75
    expect(syncB.samplePeer('A')?.position[0]).toBeCloseTo(7.5)

    // Store still exposes the raw latest packet, untouched.
    expect(syncB.store.getState()['A']?.position).toEqual([10, 0, 0])
  })

  it('clamps to the last snapshot when the sender stalls', () => {
    syncB = makeSyncB({ delayMs: 100 })
    syncB.start()
    syncA.start()
    posA = [10, 0, 0]
    vi.advanceTimersByTime(100) // second snapshot, then A goes "quiet"
    // (unchanged transform → next beats send nothing until the keepalive)
    vi.advanceTimersByTime(250) // render time far past snapshot #2
    expect(syncB.samplePeer('A')?.position).toEqual([10, 0, 0])
  })

  it('lerps rotation across the -π/π boundary via the shortest arc', () => {
    syncB = makeSyncB({ delayMs: 100 })
    syncB.start()
    rotA = 3.0
    syncA.start() // snapshot #1: rotationY = 3.0
    rotA = -3.0
    vi.advanceTimersByTime(100) // snapshot #2: rotationY = -3.0
    vi.advanceTimersByTime(50) // render time at the midpoint

    const mid = syncB.samplePeer('A')
    // Shortest arc from 3.0 to -3.0 crosses ±π (≈ 0.283 rad), so the
    // midpoint is ≈ π — NOT 0, which the naive long-way lerp would give.
    expect(mid?.rotationY).toBeCloseTo(Math.PI, 3)
  })

  it('drops the buffer with the peer (bye → samplePeer null)', () => {
    syncB = makeSyncB({ delayMs: 100 })
    syncB.start()
    syncA.start()
    vi.advanceTimersByTime(100)
    expect(syncB.samplePeer('A')).not.toBeNull()

    syncA.stop() // broadcasts bye → B removes the peer immediately
    expect(syncB.store.getState()['A']).toBeUndefined()
    expect(syncB.samplePeer('A')).toBeNull()
  })

  it('returns null for unknown peers', () => {
    syncB = makeSyncB({ delayMs: 100 })
    syncB.start()
    expect(syncB.samplePeer('nobody')).toBeNull()
  })
})
