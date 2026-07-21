---
"@overworld-engine/scene": minor
"@overworld-engine/environment": minor
"@overworld-engine/loading": minor
"@overworld-engine/minimap": minor
---

World-production v2.1 — close audited feedback gaps:

- scene: GPU-aware quality detection (software renderer → low); animated NPC
  contract (animationMap.idle, default idle playback, onModelReady); moving-NPC
  idle↔walk↔run via animStateRef; runtime LOD device-tier cap + nearest-first
  preload; decoration per-set LOD switching. (Per-instance LOD disposal was
  intentionally not shipped — incompatible with drei's shared GLTF cache, where
  cloned entities share geometry/material by reference.)
- environment: exposure + distinct moon knobs; interpolated day/night light
  colors applied per-frame (fixes the 0.5 hard-switch snap). transitionDuration
  is exposed as a declarable preset field.
- loading: cross-zone progress aggregation; priority-bucket zone ordering; real
  zone retry that re-fetches failed assets; asset-load failures surfaced to
  failZone.
- minimap: radar heading inference from successive positions (createHeadingTracker)
  + config-shaped RadarEntity (structural, no scene import).
