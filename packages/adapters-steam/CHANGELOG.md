# @overworld-engine/adapters-steam

## 3.2.0

### Patch Changes

- Updated dependencies [bb73ebf]
  - @overworld-engine/core@3.2.0

## 3.1.0

### Minor Changes

- 2716b3a: **Feature:** new `@overworld-engine/adapters-steam` package — a Steam
  adapter for Tauri desktop shells. `createSteamBridge()` bridges Steamworks
  achievements, Steam Cloud saves, and Rich Presence behind a silent-no-op API
  that degrades gracefully outside Steam; `bridgeSteamAchievements()` forwards
  `@overworld-engine/core`'s `achievement:unlocked` event to Steam. Backed by
  a companion Rust Tauri plugin crate (`overworld-steam`, published separately
  to crates.io) wrapping `steamworks-rs`. Steam Overlay/friends UI is not
  supported — Tauri's WebView2-based rendering doesn't expose the hook Steam
  Overlay needs; achievements, cloud saves, and Rich Presence are unaffected
  since they're plain API calls, not overlay UI.

  See `docs/superpowers/specs/2026-07-23-adapters-steam-design.md` for the
  design and `packages/adapters-steam/README.md` for usage.

### Patch Changes

- @overworld-engine/core@3.1.0
