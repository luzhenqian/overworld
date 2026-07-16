/**
 * Framework event map extension — dogfoods `@overworld-engine/core`'s declaration
 * merging so `app:*` lifecycle events are fully typed on any bus.
 *
 * The events are emitted by the platform bridges' `bindLifecycle(bus)`:
 *
 * - `app:paused` — the app went to the background (tab hidden, mini-app
 *   `onHide`, Capacitor `pause`, window closing).
 * - `app:resumed` — the app came back to the foreground.
 * - `app:back` — a platform back affordance was pressed (Android back
 *   button, Telegram `BackButton`). The *game* decides what it means:
 *   close the top panel, or quit.
 *
 * All three carry an empty payload.
 */
declare module '@overworld-engine/core' {
  interface OverworldEventMap {
    'app:paused': Record<string, never>
    'app:resumed': Record<string, never>
    'app:back': Record<string, never>
  }
}

/** The lifecycle events added to the framework event map by this package. */
export const APP_EVENTS = ['app:paused', 'app:resumed', 'app:back'] as const

/** Name of one platform lifecycle event. */
export type AppEventName = (typeof APP_EVENTS)[number]
