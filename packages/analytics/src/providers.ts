import type { AnalyticsParams, AnalyticsProvider } from './analytics'

/**
 * All built-in providers guard browser APIs, so importing and configuring
 * them in Node/SSR is safe — they simply become no-ops there.
 */

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined'
}

function injectScript(src: string): void {
  if (document.querySelector(`script[src="${src}"]`)) return
  const script = document.createElement('script')
  script.async = true
  script.src = src
  document.head.appendChild(script)
}

/** GA4 accepts `[a-z0-9_]` event names; normalize e.g. `quest:completed`. */
function sanitizeEventName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, '_')
}

type GtagFn = (...args: unknown[]) => void

interface Ga4Window {
  dataLayer?: unknown[]
  gtag?: GtagFn
}

/** Options for {@link ga4Provider}. */
export interface Ga4ProviderOptions {
  /** Ask GA to anonymize IPs. Defaults to `true`. */
  anonymizeIp?: boolean
  /**
   * Let GA send its own automatic page_view. Defaults to `false`
   * (page views go through `trackPage` instead).
   */
  sendPageView?: boolean
}

/**
 * Google Analytics 4 via plain gtag.js script injection — zero dependencies.
 * Events fired before the script loads are queued in `dataLayer` by design.
 */
export function ga4Provider(
  measurementId: string,
  options: Ga4ProviderOptions = {}
): AnalyticsProvider {
  let gtag: GtagFn | null = null

  return {
    name: 'ga4',

    init: () => {
      if (!isBrowser()) return
      const w = window as unknown as Ga4Window
      w.dataLayer = w.dataLayer ?? []
      if (!w.gtag) {
        // gtag.js requires the *arguments object* (not an array) on dataLayer.
        w.gtag = function () {
          // eslint-disable-next-line prefer-rest-params
          w.dataLayer!.push(arguments)
        }
      }
      gtag = w.gtag
      gtag('js', new Date())
      gtag('config', measurementId, {
        send_page_view: options.sendPageView ?? false,
        anonymize_ip: options.anonymizeIp ?? true,
      })
      injectScript(`https://www.googletagmanager.com/gtag/js?id=${measurementId}`)
    },

    trackEvent: (name, params) => {
      gtag?.('event', sanitizeEventName(name), params ?? {})
    },

    trackPage: (path) => {
      gtag?.('event', 'page_view', { page_path: path })
    },
  }
}

type ClarityFn = ((...args: unknown[]) => void) & { q?: unknown[] }

interface ClarityWindow {
  clarity?: ClarityFn
}

/**
 * Microsoft Clarity via its standard queueing snippet — zero dependencies.
 * Page views are recorded by Clarity automatically; `trackPage` additionally
 * tags the session with the current path.
 */
export function clarityProvider(projectId: string): AnalyticsProvider {
  let clarity: ClarityFn | null = null

  return {
    name: 'clarity',

    init: () => {
      if (!isBrowser()) return
      const w = window as unknown as ClarityWindow
      if (!w.clarity) {
        const queued: ClarityFn = function (...args: unknown[]) {
          ;(queued.q = queued.q ?? []).push(args)
        }
        w.clarity = queued
      }
      clarity = w.clarity
      injectScript(`https://www.clarity.ms/tag/${projectId}`)
    },

    trackEvent: (name) => {
      clarity?.('event', name)
    },

    trackPage: (path) => {
      clarity?.('set', 'page', path)
    },
  }
}

/** Options for {@link consoleProvider}. */
export interface ConsoleProviderOptions {
  /** Log prefix. Defaults to `[analytics]`. */
  prefix?: string
}

/** Logs every call to the console — handy during development and in tests. */
export function consoleProvider(options: ConsoleProviderOptions = {}): AnalyticsProvider {
  const prefix = options.prefix ?? '[analytics]'
  return {
    name: 'console',
    init: () => {
      console.info(`${prefix} initialized`)
    },
    trackEvent: (name: string, params?: AnalyticsParams) => {
      console.info(`${prefix} event`, name, params ?? {})
    },
    trackPage: (path: string) => {
      console.info(`${prefix} page`, path)
    },
  }
}
