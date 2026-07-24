# @overworld-engine/adapters-savefile

Tauri adapter for Overworld: a hardened `AtomicFileBackend` (temp write →
fsync → read-back verify → rotating backups → atomic rename) for desktop
game saves. This package only speaks opaque bytes — save-file header
schema, versioning, and business-level checksums are the caller's
responsibility; see `docs/superpowers/specs/2026-07-24-save-hardening-design.md`.

## Install

Two installs — the TS bridge (npm) and the Rust plugin (crates.io):

```bash
pnpm add @overworld-engine/adapters-savefile @overworld-engine/core
cd src-tauri && cargo add overworld-savefile
```

Register the plugin in your Tauri app's `src-tauri/src/lib.rs`:

```rust
tauri::Builder::default()
    .plugin(overworld_savefile::init())
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
```

And grant its commands in `src-tauri/capabilities/default.json`:

```diff
   "permissions": [
     "core:default",
+    "overworld-savefile:default"
   ]
```

## Usage

```ts
import { createTauriSaveFileBackend } from '@overworld-engine/adapters-savefile'
import { commitSlot, recoverSlot } from '@overworld-engine/core'

const backend = createTauriSaveFileBackend()

await commitSlot(backend, 'saves/slot-1', payloadBytes)
const outcome = await recoverSlot(backend, 'saves/slot-1', {
  isValid: (bytes) => yourOwnHeaderChecksumPasses(bytes),
})
if (outcome.result) {
  console.log(`Recovered from ${outcome.result.source}`)
}
```

Paths are relative to the app's `AppData` directory and must not contain
`..` segments.
