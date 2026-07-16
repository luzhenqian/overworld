/**
 * `@overworld-engine/inspector` — developer dev-overlays for the Overworld
 * event bus and zustand stores.
 *
 * - {@link createEventStream} — headless `bus.onAny` ring buffer + counts.
 * - {@link EventBusInspector} — live event-stream / count-table React overlay.
 * - {@link StoreInspector} — collapsible live JSON snapshot of a zustand store.
 *
 * Dev-only tooling: mount the overlays behind an `import.meta.env.DEV` guard
 * and/or a key toggle. Runtime deps are only `@overworld-engine/core` and
 * `@overworld-engine/devtools`; `react` and `zustand` are peers.
 */
export { createEventStream, DEFAULT_EVENT_STREAM_MAX } from './eventStream'
export type { EventEntry, EventStream, EventStreamOptions } from './eventStream'

export { EventBusInspector, DEFAULT_INSPECTOR_TESTID } from './EventBusInspector'
export type { EventBusInspectorProps, InspectorPosition } from './EventBusInspector'

export { StoreInspector, DEFAULT_STORE_INSPECTOR_TESTID } from './StoreInspector'
export type { InspectableStore, StoreInspectorProps } from './StoreInspector'
