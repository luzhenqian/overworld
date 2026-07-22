# @overworld-engine/adapters-steam Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `@overworld-engine/adapters-steam` — a TS bridge + companion Rust Tauri plugin (`overworld-steam`) that lets Overworld games call Steamworks achievements, Steam Cloud saves, and Rich Presence from a Tauri desktop shell, degrading to silent no-ops outside Steam — and wire it into `examples/desktop-tauri` for validation.

**Architecture:** `createSteamBridge()` (TS) talks to a Tauri plugin (`overworld-steam`, Rust) over `invoke()`; the plugin owns a single dedicated OS thread for all Steamworks SDK calls (the SDK is not thread-safe) and answers via a command channel. The TS package depends only on `@overworld-engine/core` — no `platform`/`achievements` coupling — per this repo's depcruise-enforced zero-cross-package-import rule. Steam is **not** a new `PlatformKind`; it's an optional capability layered on top of the existing `tauri` kind.

**Tech Stack:** TypeScript (tsup/vitest, existing repo toolchain), Rust 2021 + `steamworks-rs` 0.13 + Tauri 2 plugin API (`tauri-plugin` 2.6 build crate), pnpm workspaces, changesets.

## Global Constraints

- TS package `dependencies` are **only** `@overworld-engine/core` — no `platform`, no `achievements` (depcruise's `no-cross-package-imports` rule only exempts `core`; see `.dependency-cruiser.cjs`).
- No new `PlatformKind` is registered; `platform`'s `detectPlatform()`/`createBridge()`/`registerBridge()` are untouched.
- Every `SteamBridge` method is a silent no-op when Steam is unavailable — no `console.warn` spam, no throws. `cloudStorage()` returns `undefined` when unavailable; callers fall back explicitly (`steam.cloudStorage() ?? bridge.storage()`).
- v1 capability scope: availability detection, achievements, Steam Cloud saves, Rich Presence. **Out of scope:** Overlay/friends UI (architecturally blocked — Tauri's WebView2 rendering doesn't expose the hook Steam Overlay needs), Workshop, leaderboards, matchmaking, inventory.
- CI depot upload (`game-ci/steam-deploy`) is **documentation only** — no scaffolding files shipped in this package.
- TS tests are pure-logic vitest (no testing-library), matching repo convention (see `packages/adapters-weapp/src/__tests__/storage.test.ts`).
- `package.json` boilerplate (license, repository, keywords, `publishConfig`) mirrors `packages/adapters-weapp/package.json`.
- The Rust crate `overworld-steam` (`packages/adapters-steam/src-tauri`) publishes to **crates.io independently** of the npm changesets fixed group — separate CI workflow, separate versioning, not blocking Phase A.
- Design doc of record: `docs/superpowers/specs/2026-07-23-adapters-steam-design.md`.
- **Deviation from the design doc, discovered while working out the Rust thread architecture (flag this to the user when the plan is presented):** `createSteamBridge()` takes **no options** — the design's sketched `SteamBridgeOptions.appId` was dropped. The Steamworks SDK's `Client::init()` already reads the App ID from `steam_appid.txt` next to the binary (the standard mechanism, used both for local dev and — via Steam's own launch handshake — in production), and the Rust plugin's background thread initializes once at Tauri startup, before any `invoke()` call could deliver a per-call override. There was never a real code path for a JS-supplied `appId` to reach that thread, so the option was removed rather than shipped as dead code.

---

## Task 1: Package scaffold + core types

**Files:**
- Create: `packages/adapters-steam/package.json`
- Create: `packages/adapters-steam/tsconfig.json`
- Create: `packages/adapters-steam/tsup.config.ts`
- Create: `packages/adapters-steam/src/types.ts`
- Create: `packages/adapters-steam/src/index.ts`

**Interfaces:**
- Produces: `SteamFlushableStorage` (getItem/setItem/removeItem/keys/flush shape), `SteamBridge` (isAvailable/ready/unlockAchievement/clearAchievement/setStat/cloudStorage/setRichPresence/clearRichPresence) — both exported from `./types`, consumed by every later task.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "@overworld-engine/adapters-steam",
  "version": "2.4.1",
  "description": "Steam adapter for Overworld: Steamworks achievements, cloud saves, and Rich Presence bridged into a Tauri desktop shell",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "files": [
    "dist",
    "src-tauri"
  ],
  "sideEffects": false,
  "scripts": {
    "build": "tsup",
    "typecheck": "tsc --noEmit",
    "test": "vitest run --passWithNoTests",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "@overworld-engine/core": "workspace:*"
  },
  "peerDependencies": {
    "@tauri-apps/api": "^2.0.0"
  },
  "devDependencies": {
    "@tauri-apps/api": "^2.11.0"
  },
  "publishConfig": {
    "access": "public"
  },
  "keywords": [
    "overworld",
    "game",
    "rpg",
    "steam",
    "steamworks",
    "tauri"
  ],
  "homepage": "https://github.com/luzhenqian/overworld#readme",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/luzhenqian/overworld.git",
    "directory": "packages/adapters-steam"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src"]
}
```

- [ ] **Step 3: Create `tsup.config.ts`**

```ts
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
})
```

- [ ] **Step 4: Create `src/types.ts`**

```ts
/**
 * A minimal FlushableStorage-shaped save backend, structurally compatible
 * with `@overworld-engine/platform`'s `FlushableStorage` (same method
 * shapes) without importing that package — this package only depends on
 * `@overworld-engine/core`, per the repo's zero-cross-package-import rule.
 */
export interface SteamFlushableStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
  keys(): string[]
  flush(): Promise<void>
}

/** The Steam capability bridge returned by {@link createSteamBridge}. */
export interface SteamBridge {
  /**
   * Whether the last {@link SteamBridge.ready} call successfully initialized
   * the Steamworks SDK. Synchronous; `false` before `ready()` resolves and
   * whenever the app isn't running under Steam (`steam_appid.txt` missing,
   * not launched via the Steam client, etc).
   */
  isAvailable(): boolean
  /**
   * Attempt Steamworks initialization (a Tauri `invoke` round-trip).
   * Resolves to the same value {@link SteamBridge.isAvailable} then returns.
   * Call and await this once at startup, before using the rest of the API.
   */
  ready(): Promise<boolean>
  /** No-op when unavailable. Fire-and-forget — does not report failures. */
  unlockAchievement(id: string): void
  /** No-op when unavailable. */
  clearAchievement(id: string): void
  /** No-op when unavailable. */
  setStat(name: string, value: number): void
  /**
   * Steam Cloud-backed save storage, hydrated during {@link SteamBridge.ready}.
   * `undefined` when unavailable — callers fall back explicitly:
   * `steam.cloudStorage() ?? bridge.storage()`.
   */
  cloudStorage(): SteamFlushableStorage | undefined
  /** No-op when unavailable. */
  setRichPresence(key: string, value: string): void
  /** No-op when unavailable. */
  clearRichPresence(): void
}
```

- [ ] **Step 5: Create `src/index.ts`**

```ts
export type { SteamBridge, SteamFlushableStorage } from './types'
```

- [ ] **Step 6: Register the package with the workspace**

Run: `pnpm install` (from repo root)
Expected: pnpm resolves `packages/adapters-steam` (matches the `pnpm-workspace.yaml` `packages/*` glob already) and symlinks `@overworld-engine/core`, `@tauri-apps/api`, `vitest`, `typescript`, `tsup` into its `node_modules`. No errors.

- [ ] **Step 7: Verify typecheck passes**

Run: `pnpm --filter @overworld-engine/adapters-steam typecheck`
Expected: exits 0, no output (only two type-only exports so far — nothing to fail on).

- [ ] **Step 8: Commit**

```bash
git add packages/adapters-steam pnpm-lock.yaml
git commit -m "feat(adapters-steam): scaffold package + core types"
```

---

## Task 2: `createSteamBridge()` — init, achievements, stats, rich presence

**Files:**
- Create: `packages/adapters-steam/src/bridge.ts`
- Create: `packages/adapters-steam/src/__tests__/bridge.test.ts`
- Modify: `packages/adapters-steam/src/index.ts`

**Interfaces:**
- Consumes: `SteamBridge` from `./types` (Task 1).
- Produces: `createSteamBridge(): SteamBridge`, consumed by Tasks 3 (cloud storage wiring), 4 (achievements glue test double), and 7 (example wiring).
- Every Tauri command is invoked as `` `plugin:steam|${command}` `` — this exact prefix is the contract with the Rust plugin built in Task 6 (its `Builder::new("steam")` name is `"steam"`).

- [ ] **Step 1: Write the failing test**

Create `packages/adapters-steam/src/__tests__/bridge.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const invokeMock = vi.fn()
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}))

const { createSteamBridge } = await import('../bridge')

beforeEach(() => {
  invokeMock.mockReset()
})

describe('createSteamBridge', () => {
  it('isAvailable() is false before ready() resolves', () => {
    const steam = createSteamBridge()
    expect(steam.isAvailable()).toBe(false)
  })

  it('ready() resolves true and flips isAvailable() when Steam is available', async () => {
    invokeMock.mockResolvedValueOnce(true) // steam_is_available

    const steam = createSteamBridge()
    const result = await steam.ready()

    expect(result).toBe(true)
    expect(steam.isAvailable()).toBe(true)
    expect(invokeMock).toHaveBeenCalledWith('plugin:steam|steam_is_available', undefined)
  })

  it('ready() resolves false when invoke rejects (no Tauri context / no Steam)', async () => {
    invokeMock.mockRejectedValueOnce(new Error('no Tauri context'))

    const steam = createSteamBridge()
    const result = await steam.ready()

    expect(result).toBe(false)
    expect(steam.isAvailable()).toBe(false)
  })

  it('unlockAchievement/clearAchievement/setStat are no-ops before ready()', () => {
    const steam = createSteamBridge()
    steam.unlockAchievement('FIRST_KILL')
    steam.clearAchievement('FIRST_KILL')
    steam.setStat('enemies_killed', 3)
    expect(invokeMock).not.toHaveBeenCalled()
  })

  it('unlockAchievement invokes steam_unlock_achievement once available', async () => {
    invokeMock.mockResolvedValueOnce(true)
    const steam = createSteamBridge()
    await steam.ready()
    invokeMock.mockClear()

    steam.unlockAchievement('FIRST_KILL')

    expect(invokeMock).toHaveBeenCalledWith('plugin:steam|steam_unlock_achievement', {
      id: 'FIRST_KILL',
    })
  })

  it('clearAchievement invokes steam_clear_achievement once available', async () => {
    invokeMock.mockResolvedValueOnce(true)
    const steam = createSteamBridge()
    await steam.ready()
    invokeMock.mockClear()

    steam.clearAchievement('FIRST_KILL')

    expect(invokeMock).toHaveBeenCalledWith('plugin:steam|steam_clear_achievement', {
      id: 'FIRST_KILL',
    })
  })

  it('setStat invokes steam_set_stat once available', async () => {
    invokeMock.mockResolvedValueOnce(true)
    const steam = createSteamBridge()
    await steam.ready()
    invokeMock.mockClear()

    steam.setStat('enemies_killed', 3)

    expect(invokeMock).toHaveBeenCalledWith('plugin:steam|steam_set_stat', {
      name: 'enemies_killed',
      value: 3,
    })
  })

  it('setRichPresence/clearRichPresence are no-ops before ready(), invoke once available', async () => {
    const steam = createSteamBridge()
    steam.setRichPresence('status', 'Exploring')
    steam.clearRichPresence()
    expect(invokeMock).not.toHaveBeenCalled()

    invokeMock.mockResolvedValueOnce(true)
    await steam.ready()
    invokeMock.mockClear()

    steam.setRichPresence('status', 'Exploring')
    expect(invokeMock).toHaveBeenCalledWith('plugin:steam|steam_set_rich_presence', {
      key: 'status',
      value: 'Exploring',
    })

    steam.clearRichPresence()
    expect(invokeMock).toHaveBeenCalledWith('plugin:steam|steam_clear_rich_presence', undefined)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @overworld-engine/adapters-steam test`
Expected: FAIL — `Cannot find module '../bridge'` (or similar resolution error), since `src/bridge.ts` doesn't exist yet.

- [ ] **Step 3: Create `src/bridge.ts`**

```ts
import { invoke } from '@tauri-apps/api/core'
import type { SteamBridge, SteamFlushableStorage } from './types'

/**
 * Invoke a command on the `overworld-steam` Tauri plugin. Every failure
 * (no Tauri context, plugin not registered, IPC error) is swallowed and
 * logged — callers treat `undefined` as "not available right now" rather
 * than propagating exceptions into game code.
 */
async function callInvoke<T>(
  command: string,
  args?: Record<string, unknown>
): Promise<T | undefined> {
  try {
    return await invoke<T>(`plugin:steam|${command}`, args)
  } catch (error) {
    console.error(`[overworld] adapters-steam: "${command}" failed`, error)
    return undefined
  }
}

/**
 * Create a Steam capability bridge. Call {@link SteamBridge.ready} once at
 * startup and await it before using the rest of the API — every method is a
 * silent no-op until then, and stays a no-op forever outside Steam.
 */
export function createSteamBridge(): SteamBridge {
  let available = false
  let cloudStorage: SteamFlushableStorage | undefined

  return {
    isAvailable: () => available,

    async ready() {
      const result = await callInvoke<boolean>('steam_is_available')
      available = result === true
      return available
    },

    unlockAchievement(id) {
      if (!available) return
      void callInvoke('steam_unlock_achievement', { id })
    },

    clearAchievement(id) {
      if (!available) return
      void callInvoke('steam_clear_achievement', { id })
    },

    setStat(name, value) {
      if (!available) return
      void callInvoke('steam_set_stat', { name, value })
    },

    cloudStorage: () => cloudStorage,

    setRichPresence(key, value) {
      if (!available) return
      void callInvoke('steam_set_rich_presence', { key, value })
    },

    clearRichPresence() {
      if (!available) return
      void callInvoke('steam_clear_rich_presence')
    },
  }
}
```

Note: `cloudStorage` (the closure variable) is declared but never assigned in this task — it stays `undefined` until Task 3 wires in hydration. That's intentional; `SteamBridge.cloudStorage()` is a required interface member so it must exist and type-check now, even before it does anything.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @overworld-engine/adapters-steam test`
Expected: PASS — 8 tests green.

- [ ] **Step 5: Update `src/index.ts`**

```ts
export { createSteamBridge } from './bridge'
export type { SteamBridge, SteamFlushableStorage } from './types'
```

- [ ] **Step 6: Commit**

```bash
git add packages/adapters-steam/src
git commit -m "feat(adapters-steam): add createSteamBridge init/achievements/stats/rich-presence"
```

---

## Task 3: Steam Cloud storage hydration

**Files:**
- Create: `packages/adapters-steam/src/cloudStorage.ts`
- Create: `packages/adapters-steam/src/__tests__/cloudStorage.test.ts`
- Modify: `packages/adapters-steam/src/bridge.ts`
- Modify: `packages/adapters-steam/src/__tests__/bridge.test.ts`

**Interfaces:**
- Consumes: `SteamFlushableStorage` from `./types` (Task 1).
- Produces: `createSteamCloudStorage(callInvoke: InvokeFn): Promise<SteamFlushableStorage>`, called from `bridge.ts`'s `ready()`.

- [ ] **Step 1: Write the failing test**

Create `packages/adapters-steam/src/__tests__/cloudStorage.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { createSteamCloudStorage } from '../cloudStorage'

describe('createSteamCloudStorage', () => {
  it('hydrates existing keys via steam_cloud_list + steam_cloud_read', async () => {
    const callInvoke = vi.fn(async (command: string, args?: Record<string, unknown>) => {
      if (command === 'steam_cloud_list') return ['overworld:quest']
      if (command === 'steam_cloud_read' && args?.key === 'overworld:quest') return '{"a":1}'
      throw new Error(`unexpected call: ${command}`)
    })

    const storage = await createSteamCloudStorage(callInvoke)

    expect(storage.getItem('overworld:quest')).toBe('{"a":1}')
    expect(storage.keys()).toEqual(['overworld:quest'])
    expect(storage.getItem('missing')).toBeNull()
  })

  it('setItem updates the mirror synchronously; flush() awaits steam_cloud_write', async () => {
    const written: Array<[string, string]> = []
    const callInvoke = vi.fn(async (command: string, args?: Record<string, unknown>) => {
      if (command === 'steam_cloud_list') return []
      if (command === 'steam_cloud_write') {
        written.push([args?.key as string, args?.value as string])
        return undefined
      }
      throw new Error(`unexpected call: ${command}`)
    })

    const storage = await createSteamCloudStorage(callInvoke)
    storage.setItem('overworld:inventory', '{"b":2}')

    expect(storage.getItem('overworld:inventory')).toBe('{"b":2}')
    expect(written).toEqual([]) // not flushed yet

    await storage.flush()
    expect(written).toEqual([['overworld:inventory', '{"b":2}']])
  })

  it('removeItem deletes from the mirror; flush() awaits steam_cloud_delete', async () => {
    const deleted: string[] = []
    const callInvoke = vi.fn(async (command: string, args?: Record<string, unknown>) => {
      if (command === 'steam_cloud_list') return ['overworld:quest']
      if (command === 'steam_cloud_read') return '{}'
      if (command === 'steam_cloud_delete') {
        deleted.push(args?.key as string)
        return undefined
      }
      throw new Error(`unexpected call: ${command}`)
    })

    const storage = await createSteamCloudStorage(callInvoke)
    storage.removeItem('overworld:quest')
    await storage.flush()

    expect(storage.getItem('overworld:quest')).toBeNull()
    expect(deleted).toEqual(['overworld:quest'])
  })

  it('removeItem on a key that was never present does not enqueue a write', async () => {
    const callInvoke = vi.fn(async (command: string) => {
      if (command === 'steam_cloud_list') return []
      throw new Error(`unexpected call: ${command}`)
    })

    const storage = await createSteamCloudStorage(callInvoke)
    storage.removeItem('never-existed')
    await storage.flush()

    expect(callInvoke).toHaveBeenCalledTimes(1) // only the initial steam_cloud_list
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @overworld-engine/adapters-steam test`
Expected: FAIL — `Cannot find module '../cloudStorage'`.

- [ ] **Step 3: Create `src/cloudStorage.ts`**

```ts
import type { SteamFlushableStorage } from './types'

/** Shape of `bridge.ts`'s internal `callInvoke` helper, threaded in so this module never imports `@tauri-apps/api` directly. */
export type InvokeFn = <T>(
  command: string,
  args?: Record<string, unknown>
) => Promise<T | undefined>

/**
 * Hydrate a Steam Cloud-backed {@link SteamFlushableStorage}: lists every
 * existing file, reads each into an in-memory mirror, then returns a
 * storage whose reads are synchronous against that mirror and whose writes
 * update the mirror synchronously while flushing to Steam Cloud through a
 * serialized queue.
 *
 * Mirrors the pattern `@overworld-engine/platform` uses for
 * `createTauriFileStorage`/`createTelegramCloudStorage` (hydrate once,
 * sync reads, queued async writes, awaitable `flush()`), reimplemented
 * locally to avoid depending on `platform` (see the zero-cross-package-import
 * rule in `.dependency-cruiser.cjs`).
 */
export async function createSteamCloudStorage(
  callInvoke: InvokeFn
): Promise<SteamFlushableStorage> {
  const keys = (await callInvoke<string[]>('steam_cloud_list')) ?? []
  const entries = new Map<string, string>()
  for (const key of keys) {
    const value = await callInvoke<string | null>('steam_cloud_read', { key })
    if (typeof value === 'string') entries.set(key, value)
  }

  let pendingWrite: Promise<void> = Promise.resolve()
  const enqueue = (task: () => Promise<void>): void => {
    pendingWrite = pendingWrite.then(task).catch((error: unknown) => {
      console.error('[overworld] adapters-steam: cloud write failed', error)
    })
  }

  return {
    getItem: (key) => entries.get(key) ?? null,

    setItem: (key, value) => {
      entries.set(key, value)
      enqueue(async () => {
        await callInvoke('steam_cloud_write', { key, value })
      })
    },

    removeItem: (key) => {
      if (!entries.delete(key)) return
      enqueue(async () => {
        await callInvoke('steam_cloud_delete', { key })
      })
    },

    keys: () => [...entries.keys()],

    async flush() {
      let tail: Promise<void>
      do {
        tail = pendingWrite
        await tail
      } while (tail !== pendingWrite)
    },
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @overworld-engine/adapters-steam test`
Expected: PASS — the 4 new `cloudStorage.test.ts` tests green; existing `bridge.test.ts` tests still green (untouched so far).

- [ ] **Step 5: Wire hydration into `bridge.ts`'s `ready()`**

Edit `packages/adapters-steam/src/bridge.ts`:

```diff
 import { invoke } from '@tauri-apps/api/core'
+import { createSteamCloudStorage } from './cloudStorage'
 import type { SteamBridge, SteamFlushableStorage } from './types'
```

```diff
     async ready() {
       const result = await callInvoke<boolean>('steam_is_available')
       available = result === true
+      if (available) {
+        cloudStorage = await createSteamCloudStorage(callInvoke)
+      }
       return available
     },
```

- [ ] **Step 6: Add a bridge-level regression test for `cloudStorage()`**

Append to `packages/adapters-steam/src/__tests__/bridge.test.ts`, inside the existing `describe('createSteamBridge', ...)` block:

```ts
  it('cloudStorage() is undefined before ready(), defined after ready() succeeds', async () => {
    const steam = createSteamBridge()
    expect(steam.cloudStorage()).toBeUndefined()

    invokeMock.mockResolvedValueOnce(true) // steam_is_available
    invokeMock.mockResolvedValueOnce([]) // steam_cloud_list (hydration, empty)
    await steam.ready()

    expect(steam.cloudStorage()).toBeDefined()
    expect(steam.cloudStorage()?.keys()).toEqual([])
  })

  it('cloudStorage() stays undefined when ready() fails', async () => {
    invokeMock.mockRejectedValueOnce(new Error('no Tauri context'))
    const steam = createSteamBridge()
    await steam.ready()

    expect(steam.cloudStorage()).toBeUndefined()
  })
```

- [ ] **Step 7: Run the full test suite to verify it passes**

Run: `pnpm --filter @overworld-engine/adapters-steam test`
Expected: PASS — all tests green (bridge.test.ts now 10 tests, cloudStorage.test.ts 4 tests).

- [ ] **Step 8: Commit**

```bash
git add packages/adapters-steam/src
git commit -m "feat(adapters-steam): hydrate Steam Cloud storage on ready()"
```

---

## Task 4: `bridgeSteamAchievements()` glue

**Files:**
- Create: `packages/adapters-steam/src/achievements.ts`
- Create: `packages/adapters-steam/src/__tests__/achievements.test.ts`
- Modify: `packages/adapters-steam/src/index.ts`

**Interfaces:**
- Consumes: `SteamBridge` from `./types` (Task 1); `EventBus`, `OverworldEventMap`, `gameEvents` from `@overworld-engine/core`.
- Produces: `bridgeSteamAchievements(steam: SteamBridge, bus?: EventBus<OverworldEventMap>): () => void`.

- [ ] **Step 1: Write the failing test**

Create `packages/adapters-steam/src/__tests__/achievements.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { EventBus, type OverworldEventMap } from '@overworld-engine/core'
import { bridgeSteamAchievements } from '../achievements'
import type { SteamBridge } from '../types'

function makeFakeSteamBridge(): SteamBridge {
  return {
    isAvailable: () => true,
    ready: vi.fn(async () => true),
    unlockAchievement: vi.fn(),
    clearAchievement: vi.fn(),
    setStat: vi.fn(),
    cloudStorage: () => undefined,
    setRichPresence: vi.fn(),
    clearRichPresence: vi.fn(),
  }
}

describe('bridgeSteamAchievements', () => {
  it('forwards achievement:unlocked to steam.unlockAchievement', () => {
    const bus = new EventBus<OverworldEventMap>()
    const steam = makeFakeSteamBridge()

    bridgeSteamAchievements(steam, bus)
    bus.emit('achievement:unlocked', { achievementId: 'FIRST_KILL' })

    expect(steam.unlockAchievement).toHaveBeenCalledWith('FIRST_KILL')
  })

  it('returns an unsubscribe function', () => {
    const bus = new EventBus<OverworldEventMap>()
    const steam = makeFakeSteamBridge()

    const unbind = bridgeSteamAchievements(steam, bus)
    unbind()
    bus.emit('achievement:unlocked', { achievementId: 'FIRST_KILL' })

    expect(steam.unlockAchievement).not.toHaveBeenCalled()
  })

  it('defaults to the global gameEvents bus when none is given', async () => {
    const { gameEvents } = await import('@overworld-engine/core')
    const steam = makeFakeSteamBridge()

    const unbind = bridgeSteamAchievements(steam)
    gameEvents.emit('achievement:unlocked', { achievementId: 'GLOBAL_BUS' })
    unbind()

    expect(steam.unlockAchievement).toHaveBeenCalledWith('GLOBAL_BUS')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @overworld-engine/adapters-steam test`
Expected: FAIL — `Cannot find module '../achievements'`.

- [ ] **Step 3: Create `src/achievements.ts`**

```ts
import { gameEvents, type EventBus, type OverworldEventMap } from '@overworld-engine/core'
import type { SteamBridge } from './types'

/**
 * Subscribe a Steam bridge to `achievement:unlocked` on the given bus
 * (default: the global `gameEvents`) and forward every unlock to
 * `steam.unlockAchievement`. Returns an unsubscribe function.
 *
 * Optional glue — this package never imports `@overworld-engine/achievements`;
 * call this yourself after wiring up that package, if your game uses it.
 */
export function bridgeSteamAchievements(
  steam: SteamBridge,
  bus: EventBus<OverworldEventMap> = gameEvents
): () => void {
  return bus.on('achievement:unlocked', ({ achievementId }) => {
    steam.unlockAchievement(achievementId)
  })
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @overworld-engine/adapters-steam test`
Expected: PASS — all tests green across `bridge.test.ts`, `cloudStorage.test.ts`, `achievements.test.ts`.

- [ ] **Step 5: Update `src/index.ts`**

```ts
export { createSteamBridge } from './bridge'
export { bridgeSteamAchievements } from './achievements'
export type { SteamBridge, SteamFlushableStorage } from './types'
```

- [ ] **Step 6: Commit**

```bash
git add packages/adapters-steam/src
git commit -m "feat(adapters-steam): add bridgeSteamAchievements glue"
```

---

## Task 5: Package README, changeset, final verification

**Files:**
- Create: `packages/adapters-steam/README.md`
- Create: `.changeset/adapters-steam.md`

**Interfaces:**
- Consumes: nothing new — this task packages up Tasks 1–4's finished API surface for consumers.

- [ ] **Step 1: Create `packages/adapters-steam/README.md`**

```md
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
```

- [ ] **Step 2: Create `.changeset/adapters-steam.md`**

```md
---
'@overworld-engine/adapters-steam': minor
---

**Feature:** new `@overworld-engine/adapters-steam` package — a Steam
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
```

- [ ] **Step 3: Run the full package verification**

Run: `pnpm --filter @overworld-engine/adapters-steam build && pnpm --filter @overworld-engine/adapters-steam typecheck && pnpm --filter @overworld-engine/adapters-steam test`
Expected: all three succeed — `dist/index.js` + `dist/index.d.ts` produced, typecheck clean, all tests pass (14 total across the 3 test files).

- [ ] **Step 4: Run the repo-wide dependency boundary check**

Run: `pnpm depcruise`
Expected: exits 0 — `adapters-steam/src` only imports `@overworld-engine/core` (plus its own sibling files and `@tauri-apps/api`, which isn't a `packages/*` path so the rule doesn't apply to it), no cross-package violation reported.

- [ ] **Step 5: Commit**

```bash
git add packages/adapters-steam/README.md .changeset/adapters-steam.md
git commit -m "docs(adapters-steam): add package README and changeset"
```

---

## Task 6: Rust plugin crate `overworld-steam`

**Files:**
- Create: `packages/adapters-steam/src-tauri/Cargo.toml`
- Create: `packages/adapters-steam/src-tauri/build.rs`
- Create: `packages/adapters-steam/src-tauri/README.md`
- Create: `packages/adapters-steam/src-tauri/permissions/default.toml`
- Create: `packages/adapters-steam/src-tauri/src/lib.rs`

**Interfaces:**
- Produces: `pub fn init<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R>`, registered via `.plugin(overworld_steam::init())` in a consuming app's `lib.rs` (Task 7). Exposes 10 Tauri commands under the `steam` plugin namespace: `steam_is_available`, `steam_unlock_achievement`, `steam_clear_achievement`, `steam_set_stat`, `steam_cloud_read`, `steam_cloud_write`, `steam_cloud_delete`, `steam_cloud_list`, `steam_set_rich_presence`, `steam_clear_rich_presence` — these exact names are the contract with `bridge.ts`'s `` `plugin:steam|${command}` `` calls (Task 2).

This crate has **no automated tests** — the Steamworks SDK requires a real,
running Steam client to do anything (see the design doc §7's documented
testing gap). Verification here is `cargo check` (compiles cleanly against
the real `steamworks` 0.13 / `tauri` 2 / `tauri-plugin` 2 APIs) plus manual
QA in Task 7. Every command signature below has already been checked against
`steamworks` 0.13.1's actual source (`Client::init`, `UserStats::achievement`,
`AchievementHelper::set/clear`, `RemoteStorage::file`, `SteamFile::read/write`,
`Friends::set_rich_presence/clear_rich_presence`) and `tauri-plugin` 2.6.3's
actual `build::Builder` API — this whole crate was compiled successfully
against those real dependencies while writing this plan (not guessed from
memory).

- [ ] **Step 1: Create `Cargo.toml`**

```toml
[package]
name = "overworld-steam"
links = "overworld-steam"
version = "0.1.0"
description = "Tauri 2 plugin bridging the Steamworks SDK (achievements, Steam Cloud saves, Rich Presence) for Overworld game engine apps"
authors = ["Overworld"]
edition = "2021"
license = "MIT"
repository = "https://github.com/luzhenqian/overworld"
readme = "README.md"
keywords = ["tauri-plugin", "steam", "steamworks", "gamedev"]
categories = ["game-development"]

[lib]
name = "overworld_steam"
crate-type = ["staticlib", "cdylib", "rlib"]

[build-dependencies]
tauri-plugin = { version = "2", features = ["build"] }

[dependencies]
tauri = { version = "2", features = [] }
steamworks = "0.13"
tokio = { version = "1", features = ["sync"] }
```

`links = "overworld-steam"` (matching `package.name`) is required — `tauri-plugin`'s
build-time permission generator (used in Step 2) fails at build time without it
("package.links field in the Cargo manifest is not set").

- [ ] **Step 2: Create `build.rs`**

```rust
const COMMANDS: &[&str] = &[
    "steam_is_available",
    "steam_unlock_achievement",
    "steam_clear_achievement",
    "steam_set_stat",
    "steam_cloud_read",
    "steam_cloud_write",
    "steam_cloud_delete",
    "steam_cloud_list",
    "steam_set_rich_presence",
    "steam_clear_rich_presence",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).build();
}
```

This generates one `allow-<command>`/`deny-<command>` permission pair per
command into `permissions/autogenerated/commands/` on every build — Step 4's
`permissions/default.toml` aggregates them into a single `steam:default`
grant.

- [ ] **Step 3: Create `README.md`**

```md
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

Then add `"steam:default"` to your app's `capabilities/*.json` `permissions`
array.
```

- [ ] **Step 4: Create `permissions/default.toml`**

```toml
"$schema" = "schemas/schema.json"

[default]
description = "Allows all Steam bridge commands: achievements, cloud storage, and rich presence."
permissions = [
  "allow-steam-is-available",
  "allow-steam-unlock-achievement",
  "allow-steam-clear-achievement",
  "allow-steam-set-stat",
  "allow-steam-cloud-read",
  "allow-steam-cloud-write",
  "allow-steam-cloud-delete",
  "allow-steam-cloud-list",
  "allow-steam-set-rich-presence",
  "allow-steam-clear-rich-presence",
]
```

- [ ] **Step 5: Create `src/lib.rs`**

```rust
use std::io::{Read, Write};
use std::sync::mpsc::{self, Sender};
use std::thread;
use std::time::Duration;

use steamworks::Client;
use tauri::plugin::{Builder, TauriPlugin};
use tauri::{Manager, Runtime};

/// Everything the command layer can ask the dedicated Steam thread to do.
/// One variant per Tauri command; each carries a `tokio::sync::oneshot`
/// reply channel so the (async) command handler can `.await` the result
/// without blocking the Steam thread itself, which stays fully synchronous.
enum SteamCommand {
    IsAvailable(tokio::sync::oneshot::Sender<bool>),
    UnlockAchievement(String, tokio::sync::oneshot::Sender<()>),
    ClearAchievement(String, tokio::sync::oneshot::Sender<()>),
    SetStat(String, f32, tokio::sync::oneshot::Sender<()>),
    CloudRead(String, tokio::sync::oneshot::Sender<Option<String>>),
    CloudWrite(String, String, tokio::sync::oneshot::Sender<()>),
    CloudDelete(String, tokio::sync::oneshot::Sender<()>),
    CloudList(tokio::sync::oneshot::Sender<Vec<String>>),
    SetRichPresence(String, String, tokio::sync::oneshot::Sender<()>),
    ClearRichPresence(tokio::sync::oneshot::Sender<()>),
}

/// Tauri-managed state. Cloning just clones the channel sender (`mpsc::Sender`
/// is `Send + Sync` since Rust 1.72, well under this crate's MSRV).
#[derive(Clone)]
struct SteamHandle {
    tx: Sender<SteamCommand>,
}

/// Steamworks calls must all happen on the thread that initialized the SDK
/// (the Steam API is not thread-safe). This spawns one dedicated OS thread
/// that owns the `Client` for the plugin's whole lifetime, drains
/// `SteamCommand`s from `rx`, and pumps `run_callbacks()` on every loop
/// tick — including on timeout, so callbacks keep flowing even when no
/// command is queued (Steam expects this roughly once per frame).
///
/// `Client::init()` reads the App ID from `steam_appid.txt` next to the
/// binary (or from Steam's own launch handshake in production) — see the
/// package README for local-dev setup. If it fails (not running under
/// Steam), `client` stays `None` for the thread's whole lifetime and every
/// command below replies with its "unavailable" default instead of
/// touching a nonexistent client.
fn spawn_steam_thread() -> Sender<SteamCommand> {
    let (tx, rx) = mpsc::channel::<SteamCommand>();
    thread::spawn(move || {
        let client = Client::init().ok();
        loop {
            match rx.recv_timeout(Duration::from_millis(33)) {
                Ok(cmd) => handle_command(&client, cmd),
                Err(mpsc::RecvTimeoutError::Timeout) => {}
                Err(mpsc::RecvTimeoutError::Disconnected) => break,
            }
            if let Some(client) = &client {
                client.run_callbacks();
            }
        }
    });
    tx
}

fn handle_command(client: &Option<Client>, cmd: SteamCommand) {
    match cmd {
        SteamCommand::IsAvailable(reply) => {
            let _ = reply.send(client.is_some());
        }
        SteamCommand::UnlockAchievement(id, reply) => {
            if let Some(client) = client {
                let _ = client.user_stats().achievement(&id).set();
                let _ = client.user_stats().store_stats();
            }
            let _ = reply.send(());
        }
        SteamCommand::ClearAchievement(id, reply) => {
            if let Some(client) = client {
                let _ = client.user_stats().achievement(&id).clear();
                let _ = client.user_stats().store_stats();
            }
            let _ = reply.send(());
        }
        SteamCommand::SetStat(name, value, reply) => {
            if let Some(client) = client {
                let _ = client.user_stats().set_stat_f32(&name, value);
                let _ = client.user_stats().store_stats();
            }
            let _ = reply.send(());
        }
        SteamCommand::CloudRead(key, reply) => {
            let value = client.as_ref().and_then(|client| {
                let file = client.remote_storage().file(&key);
                if !file.exists() {
                    return None;
                }
                let mut buf = String::new();
                file.read().read_to_string(&mut buf).ok()?;
                Some(buf)
            });
            let _ = reply.send(value);
        }
        SteamCommand::CloudWrite(key, value, reply) => {
            if let Some(client) = client {
                let mut writer = client.remote_storage().file(&key).write();
                let _ = writer.write_all(value.as_bytes());
            }
            let _ = reply.send(());
        }
        SteamCommand::CloudDelete(key, reply) => {
            if let Some(client) = client {
                client.remote_storage().file(&key).delete();
            }
            let _ = reply.send(());
        }
        SteamCommand::CloudList(reply) => {
            let keys = client
                .as_ref()
                .map(|client| {
                    client
                        .remote_storage()
                        .files()
                        .into_iter()
                        .map(|f| f.name)
                        .collect()
                })
                .unwrap_or_default();
            let _ = reply.send(keys);
        }
        SteamCommand::SetRichPresence(key, value, reply) => {
            if let Some(client) = client {
                let _ = client.friends().set_rich_presence(&key, Some(&value));
            }
            let _ = reply.send(());
        }
        SteamCommand::ClearRichPresence(reply) => {
            if let Some(client) = client {
                client.friends().clear_rich_presence();
            }
            let _ = reply.send(());
        }
    }
}

#[tauri::command]
async fn steam_is_available(state: tauri::State<'_, SteamHandle>) -> Result<bool, String> {
    let (reply_tx, reply_rx) = tokio::sync::oneshot::channel();
    state
        .tx
        .send(SteamCommand::IsAvailable(reply_tx))
        .map_err(|e| e.to_string())?;
    reply_rx.await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn steam_unlock_achievement(
    state: tauri::State<'_, SteamHandle>,
    id: String,
) -> Result<(), String> {
    let (reply_tx, reply_rx) = tokio::sync::oneshot::channel();
    state
        .tx
        .send(SteamCommand::UnlockAchievement(id, reply_tx))
        .map_err(|e| e.to_string())?;
    reply_rx.await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn steam_clear_achievement(
    state: tauri::State<'_, SteamHandle>,
    id: String,
) -> Result<(), String> {
    let (reply_tx, reply_rx) = tokio::sync::oneshot::channel();
    state
        .tx
        .send(SteamCommand::ClearAchievement(id, reply_tx))
        .map_err(|e| e.to_string())?;
    reply_rx.await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn steam_set_stat(
    state: tauri::State<'_, SteamHandle>,
    name: String,
    value: f32,
) -> Result<(), String> {
    let (reply_tx, reply_rx) = tokio::sync::oneshot::channel();
    state
        .tx
        .send(SteamCommand::SetStat(name, value, reply_tx))
        .map_err(|e| e.to_string())?;
    reply_rx.await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn steam_cloud_read(
    state: tauri::State<'_, SteamHandle>,
    key: String,
) -> Result<Option<String>, String> {
    let (reply_tx, reply_rx) = tokio::sync::oneshot::channel();
    state
        .tx
        .send(SteamCommand::CloudRead(key, reply_tx))
        .map_err(|e| e.to_string())?;
    reply_rx.await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn steam_cloud_write(
    state: tauri::State<'_, SteamHandle>,
    key: String,
    value: String,
) -> Result<(), String> {
    let (reply_tx, reply_rx) = tokio::sync::oneshot::channel();
    state
        .tx
        .send(SteamCommand::CloudWrite(key, value, reply_tx))
        .map_err(|e| e.to_string())?;
    reply_rx.await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn steam_cloud_delete(
    state: tauri::State<'_, SteamHandle>,
    key: String,
) -> Result<(), String> {
    let (reply_tx, reply_rx) = tokio::sync::oneshot::channel();
    state
        .tx
        .send(SteamCommand::CloudDelete(key, reply_tx))
        .map_err(|e| e.to_string())?;
    reply_rx.await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn steam_cloud_list(state: tauri::State<'_, SteamHandle>) -> Result<Vec<String>, String> {
    let (reply_tx, reply_rx) = tokio::sync::oneshot::channel();
    state
        .tx
        .send(SteamCommand::CloudList(reply_tx))
        .map_err(|e| e.to_string())?;
    reply_rx.await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn steam_set_rich_presence(
    state: tauri::State<'_, SteamHandle>,
    key: String,
    value: String,
) -> Result<(), String> {
    let (reply_tx, reply_rx) = tokio::sync::oneshot::channel();
    state
        .tx
        .send(SteamCommand::SetRichPresence(key, value, reply_tx))
        .map_err(|e| e.to_string())?;
    reply_rx.await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn steam_clear_rich_presence(state: tauri::State<'_, SteamHandle>) -> Result<(), String> {
    let (reply_tx, reply_rx) = tokio::sync::oneshot::channel();
    state
        .tx
        .send(SteamCommand::ClearRichPresence(reply_tx))
        .map_err(|e| e.to_string())?;
    reply_rx.await.map_err(|e| e.to_string())
}

/// Register the `steam` Tauri plugin: spawns the dedicated Steam thread on
/// setup and exposes the 10 commands above under `plugin:steam|<command>`.
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("steam")
        .setup(|app, _api| {
            let tx = spawn_steam_thread();
            app.manage(SteamHandle { tx });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            steam_is_available,
            steam_unlock_achievement,
            steam_clear_achievement,
            steam_set_stat,
            steam_cloud_read,
            steam_cloud_write,
            steam_cloud_delete,
            steam_cloud_list,
            steam_set_rich_presence,
            steam_clear_rich_presence,
        ])
        .build()
}
```

- [ ] **Step 6: Run `cargo check`**

Run: `cd packages/adapters-steam/src-tauri && cargo check`
Expected: `Finished` — compiles cleanly. (This exact code was already verified
to compile against `steamworks` 0.13.1 / `tauri` 2.11.5 / `tauri-plugin`
2.6.3 while writing this plan; a real `cargo check` here should reproduce
that green result. If your resolved dependency versions differ and something
doesn't compile, check the `steamworks`/`tauri`/`tauri-plugin` docs.rs pages
for the versions Cargo actually picked, at `Cargo.lock`.)

- [ ] **Step 7: Verify the generated permission files exist**

Run: `ls packages/adapters-steam/src-tauri/permissions/autogenerated/commands/`
Expected: 10 files, one per command (`steam_is_available.toml`,
`steam_unlock_achievement.toml`, …), each auto-generated by Step 6's build
script run. These are build artifacts — commit them too (Tauri plugins check
autogenerated permissions into version control; they're regenerated on every
build but are also what `cargo publish` and IDEs read without running a
build first).

- [ ] **Step 8: Commit**

```bash
git add packages/adapters-steam/src-tauri
git commit -m "feat(adapters-steam): add overworld-steam Tauri plugin crate"
```

---

## Task 7: Wire into `examples/desktop-tauri`

**Files:**
- Modify: `examples/desktop-tauri/package.json`
- Modify: `examples/desktop-tauri/src-tauri/Cargo.toml`
- Modify: `examples/desktop-tauri/src-tauri/src/lib.rs`
- Modify: `examples/desktop-tauri/src-tauri/capabilities/default.json`
- Modify: `examples/desktop-tauri/src/main.tsx`
- Modify: `examples/desktop-tauri/README.md`

**Interfaces:**
- Consumes: `createSteamBridge`, `bridgeSteamAchievements` from `@overworld-engine/adapters-steam` (Tasks 2, 4); `overworld_steam::init()` from the Rust crate (Task 6).

This task validates "does the wiring compile and run" — not "does it pass
Steam's store review." No automated test exercises real Steamworks calls
(see Task 6's testing-gap note); the manual QA step below requires a
Steamworks account and downloaded SDK, which cannot be scripted here.

- [ ] **Step 1: Add the npm dependency**

Edit `examples/desktop-tauri/package.json`, in `dependencies` (alphabetical, next to the other `@overworld-engine/*` entries):

```diff
     "@overworld-engine/scene": "workspace:*",
+    "@overworld-engine/adapters-steam": "workspace:*",
```

(Match this repo's existing key ordering in that file exactly — check the surrounding lines before inserting.)

- [ ] **Step 2: Add the Cargo path dependency**

Edit `examples/desktop-tauri/src-tauri/Cargo.toml`:

```diff
 [dependencies]
 tauri = { version = "2", features = [] }
 tauri-plugin-fs = "2"
 tauri-plugin-shell = "2"
 serde = { version = "1", features = ["derive"] }
 serde_json = "1"
+overworld-steam = { path = "../../../packages/adapters-steam/src-tauri" }
```

- [ ] **Step 3: Register the plugin**

Edit `examples/desktop-tauri/src-tauri/src/lib.rs`:

```diff
 #[cfg_attr(mobile, tauri::mobile_entry_point)]
 pub fn run() {
     tauri::Builder::default()
         // fs:createTauriFileStorage() 的文件存档(应用数据目录)
         .plugin(tauri_plugin_fs::init())
         // shell:bridge.openExternal() 用系统浏览器开外链
         .plugin(tauri_plugin_shell::init())
+        // steam:createSteamBridge() 的成就/云存档/Rich Presence(非 Steam 环境自动降级为 no-op)
+        .plugin(overworld_steam::init())
         .run(tauri::generate_context!())
         .expect("error while running tauri application");
 }
```

- [ ] **Step 4: Grant the plugin's permissions**

Edit `examples/desktop-tauri/src-tauri/capabilities/default.json`:

```diff
   "permissions": [
     "core:default",
     "shell:allow-open",
     "fs:allow-appdata-read-recursive",
     "fs:allow-appdata-write-recursive",
-    "fs:allow-appdata-meta-recursive"
+    "fs:allow-appdata-meta-recursive",
+    "steam:default"
   ]
```

- [ ] **Step 5: Run `cargo check` on the combined dependency tree**

Run: `cd examples/desktop-tauri/src-tauri && cargo check`
Expected: `Finished` — confirms `overworld-steam` (Task 6) composes cleanly
alongside the existing `tauri-plugin-fs`/`tauri-plugin-shell` dependencies
and that `.plugin(overworld_steam::init())` type-checks in `lib.rs`.

- [ ] **Step 6: Wire the TS bootstrap**

Edit `examples/desktop-tauri/src/main.tsx`:

```diff
 import React from 'react'
 import ReactDOM from 'react-dom/client'
 import { createTauriFileStorage } from '@overworld-engine/platform'
+import { createSteamBridge, bridgeSteamAchievements } from '@overworld-engine/adapters-steam'
 import { bridge, platform } from './game/platform'
 import { setSaveStorage } from './game/save-storage'

 /**
  * 异步引导模式:Tauri 的文件存储是异步创建的(动态加载
  * @tauri-apps/plugin-fs、准备应用数据目录),而持久化引擎在其模块求值时
  * 就需要 storage。因此先 await 出 storage,再动态 import 引擎与 App。
  *
  * 浏览器直开(pnpm dev / pnpm preview)时 platform === 'web',
  * 回退到桥的默认存储(localStorage),同一份代码无需条件编译。
+ *
+ * Steam 接线:createSteamBridge().ready() 在非 Steam 环境(包括浏览器直开、
+ * 或 Tauri 但未从 Steam 客户端启动)会静默解析为 false,cloudStorage()
+ * 相应恒为 undefined —— 下面用 ?? 显式回退到原有的存档介质,同一份代码
+ * 三种环境(浏览器/Tauri/Steam)都能跑。
  */
 async function bootstrap() {
-  const storage = platform === 'tauri' ? await createTauriFileStorage() : bridge.storage()
+  const steam = createSteamBridge()
+  await steam.ready()
+  bridgeSteamAchievements(steam)
+
+  const fallbackStorage =
+    platform === 'tauri' ? await createTauriFileStorage() : bridge.storage()
+  const storage = steam.cloudStorage() ?? fallbackStorage
   setSaveStorage(storage)

+  steam.setRichPresence('status', 'Exploring')
+
   const { default: App } = await import('./App')
   ReactDOM.createRoot(document.getElementById('root')!).render(
     <React.StrictMode>
       <App />
     </React.StrictMode>
   )
 }

 void bootstrap()
```

Note: this example's `engines.ts` doesn't wire up `@overworld-engine/achievements`
(its own README says it was deliberately trimmed out — see "相比 starter 裁剪掉…成就").
`bridgeSteamAchievements(steam)` is still wired here to demonstrate the API and
because it's a harmless one-line subscribe (no-op until something emits
`achievement:unlocked`), but there's no in-example flow that actually fires
an achievement unlock. That's an honest gap in this example's coverage, not
a bug — cloud storage and Rich Presence *are* fully exercisable end-to-end
(quest persistence already runs through `getSaveStorage()`; Rich Presence is
set once at bootstrap).

- [ ] **Step 7: Run TS typecheck**

Run: `pnpm --filter desktop-tauri typecheck`
Expected: exits 0.

- [ ] **Step 8: Update the example README's platform table**

Edit `examples/desktop-tauri/README.md`, in the "平台接线一览" table:

```diff
 | 外链 | `bridge.openExternal()` 走 shell 插件(系统默认浏览器) |
+| Steam | `createSteamBridge()` + `bridgeSteamAchievements()`(`@overworld-engine/adapters-steam`);非 Steam 环境自动降级为 no-op,见该包 README |
```

- [ ] **Step 9: Manual QA (not automatable — do this yourself, not part of task completion)**

This step needs a free Steamworks account and the downloaded SDK
redistributable (see `packages/adapters-steam/README.md`'s "Redistributable
libraries" section) — it cannot be scripted here due to Valve's SDK license.
When you're ready to verify against a real Steam client:

1. Download the Steamworks SDK from partner.steamgames.com, copy the
   platform redistributable library next to
   `examples/desktop-tauri/src-tauri/target/debug/` binary.
2. Create `examples/desktop-tauri/src-tauri/steam_appid.txt` containing `480`
   (Spacewar, Valve's public test app).
3. With the Steam client running and you logged in, run
   `cd examples/desktop-tauri && pnpm tauri:dev`.
4. Confirm in the console/logs that `steam.ready()` resolves `true`, and
   that Steam's own "Overlay" client-side friends list shows the game's Rich
   Presence status ("Exploring") — this is the actual proof the plugin
   reached a real Steam client, since it can't be asserted in an automated
   test.

- [ ] **Step 10: Commit**

```bash
git add examples/desktop-tauri
git commit -m "feat(desktop-tauri): wire up Steam adapter (achievements, cloud storage, rich presence)"
```

---

## Task 8 (Phase B — separate, non-blocking): crates.io publish CI

**Files:**
- Create: `.github/workflows/publish-steam-crate.yml`

**Interfaces:**
- Consumes: nothing from Tasks 1–7's code — this only needs Task 6's crate to exist at `packages/adapters-steam/src-tauri`.

This is new infrastructure for the repo (its first Rust publish pipeline) and does not block Phase A — the TS package and example wiring are already usable within the monorepo via the Task 7 path dependency regardless of whether this workflow exists.

- [ ] **Step 1: Request the `CARGO_REGISTRY_TOKEN` secret**

This cannot be automated — tell the user directly (do not attempt to script
crates.io account creation or token generation):

> To enable automated crate publishing, create a crates.io account (if you
> don't have one), generate an API token at
> https://crates.io/settings/tokens with publish scope, and add it as a
> repository secret named `CARGO_REGISTRY_TOKEN` under Settings → Secrets
> and variables → Actions.

Wait for confirmation the secret exists before proceeding to Step 3 (Step 2
can be written and committed regardless, since the workflow simply won't
successfully publish until the secret is present).

- [ ] **Step 2: Create the workflow**

```yaml
name: Publish Steam crate

on:
  push:
    branches:
      - main
    paths:
      - 'packages/adapters-steam/src-tauri/**'

jobs:
  publish:
    name: cargo publish overworld-steam
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Install Rust
        uses: actions-rs/toolchain@v1
        with:
          toolchain: stable
          override: true

      - name: Check whether this version is already published
        id: version-check
        working-directory: packages/adapters-steam/src-tauri
        run: |
          CRATE_VERSION=$(cargo metadata --no-deps --format-version 1 | jq -r '.packages[0].version')
          if cargo search overworld-steam --limit 1 | grep -q "\"$CRATE_VERSION\""; then
            echo "already_published=true" >> "$GITHUB_OUTPUT"
          else
            echo "already_published=false" >> "$GITHUB_OUTPUT"
          fi

      - name: Publish to crates.io
        if: steps.version-check.outputs.already_published == 'false'
        working-directory: packages/adapters-steam/src-tauri
        run: cargo publish --token ${{ secrets.CARGO_REGISTRY_TOKEN }}
```

This mirrors the npm side's own manual-bump convention (Global Constraints:
Cargo and npm are independent version spaces) — bumping
`packages/adapters-steam/src-tauri/Cargo.toml`'s `version` and pushing to
`main` is what triggers a new publish; pushes that don't change the version
are no-ops via the `already_published` check, so this is safe to run on
every merge that touches the crate directory without double-publishing.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/publish-steam-crate.yml
git commit -m "ci(adapters-steam): add crates.io publish workflow for overworld-steam"
```

---

## Self-Review Notes

- **Spec coverage:** design doc §1 (no PlatformKind) → Task 2/6 architecture; §2 (package structure) → Task 1/6; §3 (TS API) → Task 1/2/4 (minus the documented `appId` deviation, called out in Global Constraints); §4 (Rust plugin) → Task 6, actually compiled; §5 (v1 scope) → Task 6's 10-command list, nothing extra added; §6 (error handling) → Task 2's no-op tests; §7 (testing strategy) → Task 2–4's mocked-invoke tests + Task 6/7's explicit testing-gap notes; §8 (example wiring) → Task 7; §9 (publish flow) → Task 5 (npm/changeset) + Task 8 (crates.io), kept as two independent, non-blocking tracks as specified.
- **Type consistency verified:** `SteamBridge`/`SteamFlushableStorage` (Task 1) used identically in Tasks 2–4 and the example (Task 7); the `plugin:steam|<command>` invoke strings in `bridge.ts`/`cloudStorage.ts` match the Rust command function names and `build.rs`'s `COMMANDS` list and `permissions/default.toml`'s `allow-<command>` identifiers exactly (cross-checked against the real `cargo check` output's autogenerated permission filenames).
- **No placeholders:** every step has complete, either-compiled-or-test-passing-verifiable code; the only intentionally-deferred piece (`cloudStorage` staying `undefined` after Task 2) is explicitly noted as intentional and completed in Task 3, not left dangling.
