---
'@overworld-engine/audio': minor
---

Add named audio buses (`master`/`music`/`ambience`/`sfx`) with
`setBusVolume`/`getBusVolume`, distance-based ambient zones
(`setAmbientZones`, `updateListener`, pure `zoneWeight`/`mixBuses` helpers,
`AmbientZone`/`BusName` types), a positional one-shot `playCue`, and a
`silentBackend` for tests/headless environments.
