# overworld-steam

Rust half of `@overworld-engine/adapters-steam` — a Tauri 2 plugin wrapping
`steamworks-rs`. Steamworks calls are not thread-safe, so this plugin owns a
single dedicated OS thread for the SDK's whole lifetime; Tauri commands
proxy to it over a channel.

See the npm package's README (`@overworld-engine/adapters-steam`) for full
usage, redistributable-library setup, and CI notes — this file just covers
the Rust side.

## Install

```bash
cargo add overworld-steam
```

```rust
tauri::Builder::default()
    .plugin(overworld_steam::init())
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
```

Then add `"overworld-steam:default"` to your app's `capabilities/*.json` `permissions`
array.
