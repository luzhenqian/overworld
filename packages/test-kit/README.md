# @overworld-engine/test-kit

App-layer integration-test primitives for Overworld games: catch "store ↔
event ↔ React wiring" bugs that kernel unit tests and golden-fixture tests
can't — a required dependency (an RNG, a key binding) omitted at
construction/mount time, only crashing or silently no-op'ing the first time
it's actually used. **Not a rendering/E2E framework** — no headless
browser, no visual assertions, no "semantic action" DSL. See
`docs/superpowers/specs/2026-07-25-test-kit-design.md` for the full design
and scope boundaries.

## Install

```bash
pnpm add -D @overworld-engine/test-kit
```

## `createEventRecorder`

Record every event emitted on a bus, in order, with a monotonic counter
(not `Date.now()`) so ordering assertions stay deterministic:

```ts
import { createEventRecorder } from '@overworld-engine/test-kit'

const recorder = createEventRecorder(bus)
// ... exercise the game (call real store actions / emit real events)
expect(recorder.events.map((e) => e.event)).toEqual(['quest:started', 'quest:completed'])
recorder.stop() // unsubscribe
```

A small, standalone implementation — not re-exported from `@overworld-engine/devtools`'s
`createEventRecorder` or `@overworld-engine/inspector`'s `createEventStream`,
which do the same thing. This repo's zero-cross-package-import rule means
`test-kit` can only depend on `core`, not on sibling packages.

## `renderHook`

Mount a single React hook inside a minimal tree and run its effects — no
DOM, no Canvas/WebGL, just a real React lifecycle so `useEffect` actually
fires. Use this to prove a hook is wired to what it's supposed to be wired
to (a key binding calling the right action, an event listener actually
attaching):

```ts
import { renderHook, createEventRecorder } from '@overworld-engine/test-kit'
import { gameEvents } from '@overworld-engine/core'
import { useInteractKey } from '@overworld-engine/scene'

const recorder = createEventRecorder(gameEvents)
const { unmount } = renderHook(useInteractKey, 'e', { isInputBlocked: () => false })

window.dispatchEvent(new KeyboardEvent('keydown', { key: 'e' }))
expect(recorder.events.map((e) => e.event)).toContain('entity:interact')

unmount()
```

If the hook touches `window`/`document` (e.g. `window.addEventListener`),
run the test file under jsdom via a `// @vitest-environment jsdom` comment
at the top of the file — `renderHook` itself needs no DOM, but the hook's
own code might.

## Determinism: pair with `core`'s `createSeededRng`

Neither utility here does anything about randomness — that's
`@overworld-engine/core`'s `RngSource`/`createSeededRng`. Give your game's
factory functions an injectable `rng` parameter, default it to
`{ next: Math.random }` in production, and pass a seeded one from your
test:

```ts
import { createSeededRng } from '@overworld-engine/core'

const engines = createEngines({ rng: createSeededRng(1234) })
```

## What this doesn't do

No headless browser, no `@react-three/fiber`/Canvas rendering, no
generic "semantic action" DSL (the verbs a game scripts — "open the pause
menu", "enter a battle" — are the game's own exported functions/store
actions; this package doesn't invent a vocabulary for them). Store/scene
snapshot assertions are just Vitest's own `toMatchSnapshot()` against real
`.getState()` — no separate snapshot mechanism here either.

## Dependencies

`peerDependencies`: `react`, `react-test-renderer` (must match your app's
React version — React requires them to match exactly). `dependencies`:
`@overworld-engine/core` only.
