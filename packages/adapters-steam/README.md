# @overworld-engine/adapters-steam

Steam adapter for Overworld: bridges Steamworks achievements, Steam Cloud
saves, and Rich Presence into a Tauri desktop shell. Steam is **not** a new
platform kind — a Steam build is still a Tauri app (`detectPlatform()` stays
`'tauri'`); this package is an optional capability layered on top, the same
relationship `createTauriFileStorage()` has with the `tauri` kind.

Not supported: Steam Overlay / the friends-list overlay. Tauri's WebView2
rendering architecture doesn't expose the hook Steam Overlay needs to attach
— this is an upstream limitation, not something this package works around.
Achievements, cloud saves, and Rich Presence are unaffected (they're plain
API calls, not overlay UI).

## Install

Two installs — the TS bridge (npm) and the Rust plugin (crates.io):

```bash
pnpm add @overworld-engine/adapters-steam @overworld-engine/core
cd src-tauri && cargo add overworld-steam
```

Register the plugin in your Tauri app's `src-tauri/src/lib.rs`:

```rust
tauri::Builder::default()
    .plugin(overworld_steam::init())
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
```

And grant its commands in `src-tauri/capabilities/default.json`:

```diff
   "permissions": [
     "core:default",
+    "steam:default"
   ]
```

## Usage

```ts
import { createSteamBridge, bridgeSteamAchievements } from '@overworld-engine/adapters-steam'
import { bridge } from './platform' // your @overworld-engine/platform bridge

const steam = createSteamBridge()
await steam.ready() // Tauri invoke round-trip; false outside Steam

bridgeSteamAchievements(steam) // forwards core's achievement:unlocked → Steam

const storage = steam.cloudStorage() ?? bridge.storage() // fall back explicitly
persistOptions({ name: 'inventory', storage: () => storage })

steam.setRichPresence('status', 'Exploring the ruins')
```

Every method is a silent no-op when Steam isn't available (not launched via
Steam, `steam_appid.txt` missing) — no throws, no console spam. Check
`steam.isAvailable()` (or the return value of `ready()`) if your game wants
to branch on it.

## Local testing without a real Steam listing

Steam's SDK reads the App ID from a `steam_appid.txt` file next to the
running binary. For local dev, put one in `src-tauri/` containing Valve's
public test App ID:

```
480
```

(`480` is Spacewar, Valve's official Steamworks SDK test app — works from any
machine with a Steam client installed and running, no partner account
purchase needed.) You'll also need the Steamworks SDK redistributable
library next to your dev binary — see "Redistributable libraries" below.

## Redistributable libraries

`steamworks-rs` loads the Steam API dynamically rather than statically
linking it. Download the Steamworks SDK from
[partner.steamgames.com](https://partner.steamgames.com/) (free Steamworks
account required — this file is under Valve's SDK license and isn't
redistributed by this package), then from `sdk/redistributable_bin/`:

| Platform | File | Place next to |
|---|---|---|
| macOS | `osx/libsteam_api.dylib` | your dev binary (`src-tauri/target/debug/`) and bundled app |
| Windows | `win64/steam_api64.dll` | same |
| Linux | `linux64/libsteam_api.so` | same |

For production bundles, add the platform file to `tauri.conf.json`'s
`bundle.resources` so it ships inside the installer:

```json
{
  "bundle": {
    "resources": {
      "path/to/libsteam_api.dylib": "./"
    }
  }
}
```

## CI: uploading to Steam

This package only bridges the running game to Steamworks — it does not
automate the actual store upload. For CI depot uploads, use
[`game-ci/steam-deploy`](https://github.com/game-ci/steam-deploy) (a
GitHub Action wrapping `steamcmd`), pointed at your `tauri:build` output.
See that project's README for its TOTP/`config.vdf` authentication setup
and multi-depot configuration — this package doesn't wrap or vendor it.
