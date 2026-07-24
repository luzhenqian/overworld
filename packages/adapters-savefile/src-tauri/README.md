# overworld-savefile

Rust half of `@overworld-engine/adapters-savefile` — a Tauri 2 plugin
exposing six generic, stateless `std::fs` primitives (write/sync/rename/
read/delete/exists) so `@overworld-engine/core`'s `commitSlot`/
`recoverSlot` can get real fsync guarantees, which `@tauri-apps/plugin-fs`'s
JS API does not expose.

See the npm package's README (`@overworld-engine/adapters-savefile`) for
usage — this file just covers the Rust side.

## Install

```bash
cargo add overworld-savefile
```

```rust
tauri::Builder::default()
    .plugin(overworld_savefile::init())
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
```

Then add `"overworld-savefile:default"` to your app's `capabilities/*.json`
`permissions` array.
