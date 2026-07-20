---
'@overworld-engine/core': minor
---

Add a headless, framework-agnostic `inputLock` (`acquire`/`release`/
`isLocked`/`activeLocks`/`subscribe`/`releaseAll`) plus `createInputLock()`
for isolated instances, and the `input:lock-changed` bus event. This is the
single source of truth that `input` (keyboard layers, joystick) and `scene`
(`Player`, interaction, `FollowCamera` orbit) now consult so one
`inputLock.acquire('dialogue')` suspends gameplay input everywhere without
per-source wiring.
