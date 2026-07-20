---
'@overworld-engine/environment': minor
---

Add `<WorldEnvironment preset engine quality>`, a quality-aware sky/fog/
ground/lighting/stars layer built from a named or custom preset, with
`WORLD_ENV_PRESETS` (`clear-noon` / `overcast` / `foggy-dusk` / `night`) and
the pure `resolvePreset` / `resolveLight` helpers. When an `engine` is
supplied, ambient/sun light interpolate with its time of day.
