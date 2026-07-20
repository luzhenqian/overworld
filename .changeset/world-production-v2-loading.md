---
'@overworld-engine/loading': minor
---

Add scene-level load-state tracking: `useSceneLoadStore` (phases `idle` →
`module` → `geometry` → `texture` → `first-frame` → `ready`, `SCENE_PHASES`,
`aggregateSceneProgress`) plus zone streaming (`useZoneStreaming`,
`orderZonesByDistance`, `ZoneManifest`/`ZoneBounds`), a `<FirstFramePhase />`
Canvas marker, and `installSceneLoadDebugHandle()` for Playwright-friendly
`window.__overworldSceneLoad` inspection in dev builds.
