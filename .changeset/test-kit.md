---
'@overworld-engine/core': minor
'@overworld-engine/test-kit': minor
---

**Feature:** `createSeededRng`/`RngSource` in `@overworld-engine/core` — a
small, dependency-free deterministic PRNG (mulberry32) any factory function
can accept as an injectable randomness source, so production code can pass
`{ next: Math.random }` and tests can pass a fixed seed for byte-identical,
reproducible results.

**New package:** `@overworld-engine/test-kit` — app-layer integration-test
primitives for Overworld games: `createEventRecorder` (deterministic
event-stream recording for assertions, built on `core`'s `EventBus.onAny`)
and `renderHook` (mounts a single React hook via `react-test-renderer`, no
DOM/Canvas/WebGL, to prove hook-to-action wiring is correct). Not a
rendering/E2E framework — see
`docs/superpowers/specs/2026-07-25-test-kit-design.md` for the design and
scope boundaries.
