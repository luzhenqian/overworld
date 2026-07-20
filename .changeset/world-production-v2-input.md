---
'@overworld-engine/input': minor
---

`useKeyboardLayer` accepts an options object with `lockInput`, which acquires
the shared `@overworld-engine/core` `inputLock` for the layer's lifetime
(exported helper: `parseLayerOpts`). `<VirtualJoystick respectInputLock>`
(default `true`) zeroes its output while the lock is held, via the new pure
`resolveJoystickOutput` helper.
