# @overworld-engine/adapters-savefile

## 3.2.0

### Minor Changes

- 8b21ea2: **New package:** Tauri adapter for hardened save files.
  `createTauriSaveFileBackend()` implements `@overworld-engine/core`'s
  `AtomicFileBackend` (temp write → fsync → read-back verify → rotating
  backups → atomic rename) for desktop game saves, backed by the companion
  Rust Tauri plugin crate `overworld-savefile` (published separately to
  crates.io) so writes get a real `fsync` — Tauri's official `plugin-fs`
  JS API doesn't expose one. The backend speaks opaque bytes only:
  save-header schema, versioning, and business-level checksums remain the
  caller's responsibility. Relative save paths only — the Rust
  `resolve_path` rejects absolute and Windows-root paths.

### Patch Changes

- Updated dependencies [bb73ebf]
  - @overworld-engine/core@3.2.0
