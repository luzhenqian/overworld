/** Parameters attached to a tracked event. */
export type AnalyticsParams = Record<string, unknown>

/**
 * A pluggable analytics backend. Implement this to route Overworld tracking
 * calls anywhere (GA4, Clarity, PostHog, your own endpoint, …).
 */
export interface AnalyticsProvider {
  /** Identifier used in error logs. */
  name: string
  /**
   * One-time setup (script injection, SDK init). Called lazily before the
   * provider receives its first event; may be async (fire-and-forget).
   */
  init: () => void | Promise<void>
  /** Record a named event with optional parameters. */
  trackEvent: (name: string, params?: AnalyticsParams) => void
  /** Record a page/screen view. */
  trackPage: (path: string) => void
}

interface AnalyticsRegistry {
  providers: AnalyticsProvider[]
  initialized: Set<AnalyticsProvider>
  failed: Set<AnalyticsProvider>
}

const registry: AnalyticsRegistry = {
  providers: [],
  initialized: new Set(),
  failed: new Set(),
}

/**
 * Install the set of active providers. Replaces any previous configuration.
 * Providers are initialized lazily on the first `track`/`trackPage` call.
 *
 * ```ts
 * configureAnalytics({ providers: [ga4Provider('G-XXXX'), consoleProvider()] })
 * ```
 */
export function configureAnalytics(config: { providers: AnalyticsProvider[] }): void {
  registry.providers = [...config.providers]
}

/** Remove all providers and forget init state (mainly for tests). */
export function resetAnalytics(): void {
  registry.providers = []
  registry.initialized.clear()
  registry.failed.clear()
}

function ensureInitialized(provider: AnalyticsProvider): boolean {
  if (registry.failed.has(provider)) return false
  if (registry.initialized.has(provider)) return true
  registry.initialized.add(provider)
  try {
    const result = provider.init()
    if (result instanceof Promise) {
      result.catch((error) => {
        console.error(`[overworld/analytics] provider "${provider.name}" init failed`, error)
      })
    }
    return true
  } catch (error) {
    // A provider that cannot even init is dropped; the others keep working.
    registry.failed.add(provider)
    console.error(`[overworld/analytics] provider "${provider.name}" init failed`, error)
    return false
  }
}

function fanOut(call: (provider: AnalyticsProvider) => void, label: string): void {
  for (const provider of registry.providers) {
    if (!ensureInitialized(provider)) continue
    try {
      call(provider)
    } catch (error) {
      // Errors are isolated per provider: one broken backend never blocks
      // the rest or the game itself.
      console.error(`[overworld/analytics] provider "${provider.name}" ${label} failed`, error)
    }
  }
}

/**
 * Track a named event across all configured providers. Providers are lazily
 * initialized on first use; per-provider errors are logged and swallowed.
 */
export function track(name: string, params?: AnalyticsParams): void {
  fanOut((provider) => provider.trackEvent(name, params), `trackEvent("${name}")`)
}

/** Track a page/screen view across all configured providers. */
export function trackPage(path: string): void {
  fanOut((provider) => provider.trackPage(path), `trackPage("${path}")`)
}
