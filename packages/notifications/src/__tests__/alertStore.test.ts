import { beforeEach, describe, expect, it } from 'vitest'
import { alert, confirm, useAlertStore } from '../alertStore'

const store = () => useAlertStore.getState()

beforeEach(() => {
  // Drain anything left over from a failed test.
  while (useAlertStore.getState().current) {
    useAlertStore.getState().resolveCurrent()
  }
})

describe('queue behavior', () => {
  it('sets current to the first queued dialog', () => {
    void confirm({ message: 'first?' })
    void alert({ message: 'second!' })

    const state = useAlertStore.getState()
    expect(state.queue).toHaveLength(2)
    expect(state.current?.message).toBe('first?')
    expect(state.current?.kind).toBe('confirm')
    expect(state.queue[1]?.kind).toBe('alert')
  })

  it('advances the queue after each resolution', () => {
    void alert({ message: 'a' })
    void alert({ message: 'b' })

    store().resolveCurrent()
    expect(useAlertStore.getState().current?.message).toBe('b')

    store().resolveCurrent()
    expect(useAlertStore.getState().current).toBeNull()
    expect(useAlertStore.getState().queue).toHaveLength(0)
  })

  it('resolveCurrent with an empty queue is a no-op', () => {
    expect(() => store().resolveCurrent(true)).not.toThrow()
  })

  it('carries opaque options through to the queue entry', () => {
    void confirm({
      title: 'Danger',
      message: { rich: true },
      confirmLabel: 'Do it',
      cancelLabel: 'Nope',
    })

    const current = useAlertStore.getState().current
    expect(current?.title).toBe('Danger')
    expect(current?.message).toEqual({ rich: true })
    expect(current?.confirmLabel).toBe('Do it')
    expect(current?.cancelLabel).toBe('Nope')
  })
})

describe('promise resolution', () => {
  it('confirm resolves true when confirmed', async () => {
    const promise = confirm({ message: 'sure?' })
    store().resolveCurrent(true)
    await expect(promise).resolves.toBe(true)
  })

  it('confirm resolves false when cancelled (default result)', async () => {
    const promise = confirm({ message: 'sure?' })
    store().resolveCurrent()
    await expect(promise).resolves.toBe(false)
  })

  it('alert resolves void regardless of result', async () => {
    const promise = alert({ message: 'heads up' })
    store().resolveCurrent(true)
    await expect(promise).resolves.toBeUndefined()
  })

  it('resolves queued dialogs in order with their own results', async () => {
    const first = confirm({ message: '1' })
    const second = confirm({ message: '2' })

    store().resolveCurrent(false)
    store().resolveCurrent(true)

    await expect(first).resolves.toBe(false)
    await expect(second).resolves.toBe(true)
  })
})
