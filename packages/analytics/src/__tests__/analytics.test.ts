import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EventBus, type OverworldEventMap } from '@overworld/core'
import {
  configureAnalytics,
  resetAnalytics,
  track,
  trackPage,
  type AnalyticsParams,
} from '../analytics'
import { bindAnalyticsToBus } from '../busBinding'
import { consoleProvider } from '../providers'

function fakeProvider(name: string) {
  return {
    name,
    init: vi.fn<() => void | Promise<void>>(),
    trackEvent: vi.fn<(eventName: string, params?: AnalyticsParams) => void>(),
    trackPage: vi.fn<(path: string) => void>(),
  }
}

beforeEach(() => {
  resetAnalytics()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('fan-out', () => {
  it('forwards track() to every configured provider', () => {
    const a = fakeProvider('a')
    const b = fakeProvider('b')
    configureAnalytics({ providers: [a, b] })

    track('quest_completed', { questId: 'q1' })

    expect(a.trackEvent).toHaveBeenCalledWith('quest_completed', { questId: 'q1' })
    expect(b.trackEvent).toHaveBeenCalledWith('quest_completed', { questId: 'q1' })
  })

  it('forwards trackPage() to every configured provider', () => {
    const a = fakeProvider('a')
    const b = fakeProvider('b')
    configureAnalytics({ providers: [a, b] })

    trackPage('/town')

    expect(a.trackPage).toHaveBeenCalledWith('/town')
    expect(b.trackPage).toHaveBeenCalledWith('/town')
  })

  it('is a silent no-op when nothing is configured', () => {
    expect(() => track('anything')).not.toThrow()
  })

  it('initializes each provider lazily and only once', () => {
    const a = fakeProvider('a')
    configureAnalytics({ providers: [a] })
    expect(a.init).not.toHaveBeenCalled()

    track('one')
    trackPage('/two')
    track('three')

    expect(a.init).toHaveBeenCalledTimes(1)
  })
})

describe('error isolation', () => {
  it('a throwing trackEvent does not block other providers', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const broken = fakeProvider('broken')
    broken.trackEvent.mockImplementation(() => {
      throw new Error('backend down')
    })
    const healthy = fakeProvider('healthy')
    configureAnalytics({ providers: [broken, healthy] })

    track('event')

    expect(healthy.trackEvent).toHaveBeenCalledWith('event', undefined)
    expect(error).toHaveBeenCalled()
  })

  it('a provider whose init throws is dropped; others keep tracking', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const broken = fakeProvider('broken')
    broken.init.mockImplementation(() => {
      throw new Error('no window')
    })
    const healthy = fakeProvider('healthy')
    configureAnalytics({ providers: [broken, healthy] })

    track('first')
    track('second')

    expect(broken.trackEvent).not.toHaveBeenCalled()
    expect(broken.init).toHaveBeenCalledTimes(1) // Not retried.
    expect(healthy.trackEvent).toHaveBeenCalledTimes(2)
  })

  it('catches async init rejections', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const flaky = fakeProvider('flaky')
    flaky.init.mockRejectedValue(new Error('script blocked'))
    configureAnalytics({ providers: [flaky] })

    track('event')
    await vi.waitFor(() => expect(error).toHaveBeenCalled())
    // Sync tracking still went through (gtag-style providers queue anyway).
    expect(flaky.trackEvent).toHaveBeenCalled()
  })
})

describe('bindAnalyticsToBus', () => {
  it('auto-tracks every bus event by default', () => {
    const provider = fakeProvider('spy')
    configureAnalytics({ providers: [provider] })
    const bus = new EventBus<OverworldEventMap>()
    bindAnalyticsToBus(bus)

    bus.emit('quest:completed', { questId: 'q1' })
    bus.emit('scene:changed', { from: null, to: 'plaza' })

    expect(provider.trackEvent).toHaveBeenCalledWith('quest:completed', { questId: 'q1' })
    expect(provider.trackEvent).toHaveBeenCalledWith('scene:changed', { from: null, to: 'plaza' })
  })

  it('honors the events filter', () => {
    const provider = fakeProvider('spy')
    configureAnalytics({ providers: [provider] })
    const bus = new EventBus<OverworldEventMap>()
    bindAnalyticsToBus(bus, { events: ['achievement:unlocked'] })

    bus.emit('quest:completed', { questId: 'q1' })
    bus.emit('achievement:unlocked', { achievementId: 'a1' })

    expect(provider.trackEvent).toHaveBeenCalledTimes(1)
    expect(provider.trackEvent).toHaveBeenCalledWith('achievement:unlocked', {
      achievementId: 'a1',
    })
  })

  it('stops tracking after unsubscribe', () => {
    const provider = fakeProvider('spy')
    configureAnalytics({ providers: [provider] })
    const bus = new EventBus<OverworldEventMap>()
    const unbind = bindAnalyticsToBus(bus)

    unbind()
    bus.emit('quest:started', { questId: 'q1' })

    expect(provider.trackEvent).not.toHaveBeenCalled()
  })
})

describe('consoleProvider', () => {
  it('logs init, events and pages', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    configureAnalytics({ providers: [consoleProvider({ prefix: '[test]' })] })

    track('boot', { ok: true })
    trackPage('/home')

    expect(info).toHaveBeenCalledWith('[test] initialized')
    expect(info).toHaveBeenCalledWith('[test] event', 'boot', { ok: true })
    expect(info).toHaveBeenCalledWith('[test] page', '/home')
  })
})

describe('Node/SSR safety', () => {
  it('ga4/clarity providers no-op without a DOM', async () => {
    const { ga4Provider, clarityProvider } = await import('../providers')
    configureAnalytics({ providers: [ga4Provider('G-TEST'), clarityProvider('proj')] })

    expect(() => {
      track('event', { n: 1 })
      trackPage('/path')
    }).not.toThrow()
  })
})
