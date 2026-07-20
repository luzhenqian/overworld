---
'@overworld-engine/minimap': minor
---

Add radar selectors for a player-relative HUD: `selectRadarMarkers` (world
entities → rotated, range-clamped markers) and `computeOffscreenIndicator`
(edge angle for off-range entities), with `RadarConfig`/`RadarMarker`/
`RadarEntity` types.
