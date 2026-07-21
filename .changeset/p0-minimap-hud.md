---
'@overworld-engine/ui': minor
---

Add navigation HUD components — MinimapFrame, Compass, WaypointIndicator —
plus `normalizeAngle` / `compassOffset` / `compassTicks` / `edgeAnchor` pure helpers. These
compose with `@overworld-engine/minimap` without the UI package importing it
(the host nests `<MiniMap>` inside `<MinimapFrame>` and feeds `Compass`/
`WaypointIndicator` the heading / off-screen bearing).
