# Save Hardening (REQ-003) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a business-agnostic "atomic file + rotating backups" write/recovery primitive (temp write → fsync → read-back verify → backup rotation → atomic rename) as `core/src/saveFiles/`, with a Tauri backend (new Rust plugin package) and a web/localStorage backend, per the approved design at `docs/superpowers/specs/2026-07-24-save-hardening-design.md`.

**Architecture:** `core/src/saveFiles/` defines an `AtomicFileBackend` interface (six single-purpose file primitives: writeFile/syncFile/renameFile/readFile/deleteFile/exists) plus pure orchestration (`commitSlot`, `recoverSlot`) that is 100% backend-agnostic and unit-tested via fault injection. `packages/adapters-savefile` (new, mirrors `adapters-steam`'s structure) implements the interface over a new Rust Tauri plugin that does real fsync — the only place fsync genuinely happens. `packages/platform` gets a `localStorage`-based implementation for web.

**Tech Stack:** TypeScript (core/adapters-savefile/platform), Rust + Tauri 2 plugin (`overworld-savefile` crate), Vitest, Web Crypto (`crypto.subtle.digest`) for SHA-256.

## Global Constraints

- Zero cross-package imports outside `core` (`.dependency-cruiser.cjs`): `adapters-savefile` and `platform` may only import `@overworld-engine/core`, never each other.
- No testing-library; pure-logic Vitest tests only, matching existing style in `packages/core/src/__tests__/` and `packages/adapters-steam/src/__tests__/`.
- Node 22 / TS target ES2022, `lib: ["ES2022", "DOM", "DOM.Iterable"]`, `strict: true`, `noUncheckedIndexedAccess: true`, `noUnusedLocals`/`noUnusedParameters: true` (see `tsconfig.base.json`).
- Tauri plugin runtime namespace (`Builder::new(...)`) MUST equal the Rust crate's Cargo package name — a real prior bug (commit `5570047`) had these mismatched and every command was silently denied. Both must be `"overworld-savefile"`.
- Out of scope (already implemented by the requesting team, per the design doc): save-file header business schema (schema_version/save_generation/rng_roots), auto-save chain semantics, real process-level `kill -9` stress script. This plan covers only the atomic-file-with-backups primitive and its two backends.
- Only commit when explicitly instructed; this plan's steps show `git commit` commands for when execution proceeds — follow the repo's standard commit workflow (new commits, no `--no-verify`).

---

### Task 1: Integrity envelope (`core/src/saveFiles/envelope.ts`)

**Files:**
- Create: `packages/core/src/saveFiles/envelope.ts`
- Test: `packages/core/src/__tests__/envelope.test.ts`

**Interfaces:**
- Produces: `wrapEnvelope(payload: Uint8Array): Promise<Uint8Array>`, `unwrapEnvelope(raw: Uint8Array): Promise<Uint8Array | null>`, `bytesEqual(a: Uint8Array, b: Uint8Array): boolean` — all pure, no backend dependency.

This is our own physical-integrity check (magic + length + SHA-256), independent of the caller's business-level checksum — see design doc §4.

- [ ] **Step 1: Write the failing tests**

```ts
// packages/core/src/__tests__/envelope.test.ts
import { describe, expect, it } from 'vitest'
import { bytesEqual, unwrapEnvelope, wrapEnvelope } from '../saveFiles/envelope'

describe('wrapEnvelope / unwrapEnvelope', () => {
  it('round-trips payload bytes', async () => {
    const payload = new TextEncoder().encode('hello save file')
    const envelope = await wrapEnvelope(payload)
    const unwrapped = await unwrapEnvelope(envelope)

    expect(unwrapped).not.toBeNull()
    expect(bytesEqual(unwrapped!, payload)).toBe(true)
  })

  it('round-trips an empty payload', async () => {
    const payload = new Uint8Array(0)
    const envelope = await wrapEnvelope(payload)
    const unwrapped = await unwrapEnvelope(envelope)
    expect(unwrapped).toEqual(payload)
  })

  it('rejects a buffer too short to contain a header', async () => {
    expect(await unwrapEnvelope(new Uint8Array(10))).toBeNull()
  })

  it('rejects wrong magic bytes', async () => {
    const envelope = await wrapEnvelope(new TextEncoder().encode('data'))
    envelope[0] = 0x00
    expect(await unwrapEnvelope(envelope)).toBeNull()
  })

  it('rejects a bit-flipped payload (checksum mismatch)', async () => {
    const envelope = await wrapEnvelope(new TextEncoder().encode('data'))
    envelope[envelope.length - 1] ^= 0xff
    expect(await unwrapEnvelope(envelope)).toBeNull()
  })

  it('rejects a truncated buffer (length mismatch)', async () => {
    const envelope = await wrapEnvelope(new TextEncoder().encode('data'))
    expect(await unwrapEnvelope(envelope.slice(0, envelope.length - 1))).toBeNull()
  })
})

describe('bytesEqual', () => {
  it('compares by content, not identity or length-prefix', () => {
    expect(bytesEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3]))).toBe(true)
    expect(bytesEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 4]))).toBe(false)
    expect(bytesEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2, 3]))).toBe(false)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @overworld-engine/core test -- envelope`
Expected: FAIL — `Cannot find module '../saveFiles/envelope'`

- [ ] **Step 3: Implement `envelope.ts`**

```ts
// packages/core/src/saveFiles/envelope.ts
/**
 * A minimal integrity envelope wrapped around opaque save-file bytes:
 * physical corruption/truncation detection only, independent of any
 * business-level checksum the caller's own save format defines.
 *
 * Layout: `[4B magic "OWSF"][1B format version][4B payload length (LE
 * u32)][32B SHA-256(payload)][payload bytes]`.
 */

const MAGIC = new Uint8Array([0x4f, 0x57, 0x53, 0x46]) // "OWSF"
const FORMAT_VERSION = 1
const DIGEST_LENGTH = 32
const HEADER_LENGTH = MAGIC.length + 1 + 4 + DIGEST_LENGTH // 41

async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
}

/** Byte-for-byte equality; used for digest comparison and read-back verification. */
export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false
  for (let i = 0; i < a.byteLength; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

/** Wrap `payload` in the integrity envelope described above. */
export async function wrapEnvelope(payload: Uint8Array): Promise<Uint8Array> {
  const digest = await sha256(payload)
  const out = new Uint8Array(HEADER_LENGTH + payload.byteLength)
  out.set(MAGIC, 0)
  out[MAGIC.length] = FORMAT_VERSION
  new DataView(out.buffer).setUint32(MAGIC.length + 1, payload.byteLength, true)
  out.set(digest, MAGIC.length + 1 + 4)
  out.set(payload, HEADER_LENGTH)
  return out
}

/**
 * Unwrap an envelope produced by {@link wrapEnvelope}. Returns `null` (never
 * throws) for anything that doesn't check out — wrong magic, wrong format
 * version, length mismatch, or a SHA-256 mismatch — so callers can treat any
 * failure uniformly as "this generation is not usable, try the next one".
 */
export async function unwrapEnvelope(raw: Uint8Array): Promise<Uint8Array | null> {
  if (raw.byteLength < HEADER_LENGTH) return null
  for (let i = 0; i < MAGIC.length; i++) {
    if (raw[i] !== MAGIC[i]) return null
  }
  if (raw[MAGIC.length] !== FORMAT_VERSION) return null

  const length = new DataView(raw.buffer, raw.byteOffset, raw.byteLength).getUint32(MAGIC.length + 1, true)
  if (HEADER_LENGTH + length !== raw.byteLength) return null

  const storedDigest = raw.slice(MAGIC.length + 1 + 4, HEADER_LENGTH)
  const payload = raw.slice(HEADER_LENGTH)
  const actualDigest = await sha256(payload)
  if (!bytesEqual(storedDigest, actualDigest)) return null

  return payload
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @overworld-engine/core test -- envelope`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/saveFiles/envelope.ts packages/core/src/__tests__/envelope.test.ts
git commit -m "feat(core): add save-file integrity envelope"
```

---

### Task 2: `AtomicFileBackend` interface + in-memory test backend + `commitSlot`

**Files:**
- Create: `packages/core/src/saveFiles/types.ts`
- Create: `packages/core/src/saveFiles/paths.ts`
- Create: `packages/core/src/saveFiles/commitSlot.ts`
- Create: `packages/core/src/__tests__/testBackend.ts` (test helper, not a `.test.ts` file — Vitest won't collect it)
- Test: `packages/core/src/__tests__/commitSlot.test.ts`

**Interfaces:**
- Consumes: `wrapEnvelope`, `bytesEqual` from Task 1 (`../envelope`).
- Produces: `AtomicFileBackend` interface (`writeFile(path, bytes): Promise<void>`, `syncFile(path): Promise<void>`, `renameFile(from, to): Promise<void>`, `readFile(path): Promise<Uint8Array | null>`, `deleteFile(path): Promise<void>`, `exists(path): Promise<boolean>`); `tmpPath(path): string`; `backupPath(path, n): string`; `commitSlot(backend, path, bytes, options?: { backupCount?: number }): Promise<void>`; test helper `createInMemoryBackend(): AtomicFileBackend`.

- [ ] **Step 1: Write the failing tests**

```ts
// packages/core/src/__tests__/testBackend.ts
import type { AtomicFileBackend } from '../saveFiles/types'

/** An in-memory `AtomicFileBackend` for tests: a plain Map keyed by path. */
export function createInMemoryBackend(): AtomicFileBackend {
  const files = new Map<string, Uint8Array>()
  return {
    async writeFile(path, bytes) {
      files.set(path, bytes.slice())
    },
    async syncFile() {
      // No-op: the in-memory map has no separate "durable" state to flush.
    },
    async renameFile(from, to) {
      const value = files.get(from)
      if (value === undefined) {
        throw new Error(`[test] renameFile: "${from}" does not exist`)
      }
      files.set(to, value)
      files.delete(from)
    },
    async readFile(path) {
      return files.get(path) ?? null
    },
    async deleteFile(path) {
      files.delete(path)
    },
    async exists(path) {
      return files.has(path)
    },
  }
}
```

```ts
// packages/core/src/__tests__/commitSlot.test.ts
import { describe, expect, it } from 'vitest'
import { commitSlot } from '../saveFiles/commitSlot'
import { unwrapEnvelope } from '../saveFiles/envelope'
import { createInMemoryBackend } from './testBackend'

const enc = (s: string) => new TextEncoder().encode(s)
const dec = async (backend: ReturnType<typeof createInMemoryBackend>, path: string) => {
  const raw = await backend.readFile(path)
  if (raw === null) return null
  const payload = await unwrapEnvelope(raw)
  return payload === null ? null : new TextDecoder().decode(payload)
}

describe('commitSlot', () => {
  it('writes the first generation as current, no backups yet', async () => {
    const backend = createInMemoryBackend()
    await commitSlot(backend, 'slot', enc('gen0'))

    expect(await dec(backend, 'slot')).toBe('gen0')
    expect(await backend.exists('slot.bak1')).toBe(false)
    expect(await backend.exists('slot.tmp')).toBe(true) // tmp is left in place, harmless
  })

  it('rotates backups across three generations (default backupCount=2)', async () => {
    const backend = createInMemoryBackend()
    await commitSlot(backend, 'slot', enc('gen0'))
    await commitSlot(backend, 'slot', enc('gen1'))
    await commitSlot(backend, 'slot', enc('gen2'))

    expect(await dec(backend, 'slot')).toBe('gen2')
    expect(await dec(backend, 'slot.bak1')).toBe('gen1')
    expect(await dec(backend, 'slot.bak2')).toBe('gen0')
  })

  it('honors a custom backupCount', async () => {
    const backend = createInMemoryBackend()
    await commitSlot(backend, 'slot', enc('gen0'), { backupCount: 1 })
    await commitSlot(backend, 'slot', enc('gen1'), { backupCount: 1 })

    expect(await dec(backend, 'slot')).toBe('gen1')
    expect(await dec(backend, 'slot.bak1')).toBe('gen0')
    expect(await backend.exists('slot.bak2')).toBe(false)
  })

  it('aborts without touching current/backups when read-back does not match', async () => {
    const base = createInMemoryBackend()
    await commitSlot(base, 'slot', enc('good'))

    const corrupting = {
      ...base,
      async readFile(path: string) {
        if (path === 'slot.tmp') return enc('corrupted-on-disk')
        return base.readFile(path)
      },
    }

    await expect(commitSlot(corrupting, 'slot', enc('new-data'))).rejects.toThrow(
      'read-back verification failed'
    )
    expect(await dec(base, 'slot')).toBe('good')
    expect(await backend_bak1_absent(base)).toBe(true)
  })
})

async function backend_bak1_absent(backend: ReturnType<typeof createInMemoryBackend>): Promise<boolean> {
  return !(await backend.exists('slot.bak1'))
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @overworld-engine/core test -- commitSlot`
Expected: FAIL — `Cannot find module '../saveFiles/types'` / `'../saveFiles/commitSlot'`

- [ ] **Step 3: Implement `types.ts`, `paths.ts`, `commitSlot.ts`**

```ts
// packages/core/src/saveFiles/types.ts
/**
 * Six single-purpose file primitives. No business semantics — reusable for
 * any hardened-write scenario, not just save games. `commitSlot`/
 * `recoverSlot` orchestrate these into a crash-safe protocol; the
 * primitives themselves stay dumb.
 */
export interface AtomicFileBackend {
  /** Create or wholesale-overwrite a file. No durability guarantee alone — pair with `syncFile`. */
  writeFile(path: string, bytes: Uint8Array): Promise<void>
  /** Force whatever was written to `path` to durable storage (fsync). */
  syncFile(path: string): Promise<void>
  /** Atomic replace: if `to` already exists it is replaced wholesale, never left half-written. */
  renameFile(from: string, to: string): Promise<void>
  /** `null` if `path` does not exist. Never throws for a missing file. */
  readFile(path: string): Promise<Uint8Array | null>
  /** No-op if `path` does not exist. */
  deleteFile(path: string): Promise<void>
  exists(path: string): Promise<boolean>
}
```

```ts
// packages/core/src/saveFiles/paths.ts
/** Temp-file path used mid-write by {@link commitSlot}. */
export function tmpPath(path: string): string {
  return `${path}.tmp`
}

/** Path of the nth rotated backup (1 = most recent). */
export function backupPath(path: string, n: number): string {
  return `${path}.bak${n}`
}
```

```ts
// packages/core/src/saveFiles/commitSlot.ts
import { bytesEqual, wrapEnvelope } from './envelope'
import { backupPath, tmpPath } from './paths'
import type { AtomicFileBackend } from './types'

export interface CommitSlotOptions {
  /** How many rotated backups to keep alongside `current`. @default 2 */
  backupCount?: number
}

/**
 * Durably commit `bytes` as the new `current` generation at `path`:
 * temp write → fsync → read-back verify → rotate existing backups
 * oldest-first → atomic rename into place.
 *
 * Crash-safe at every step: `renameFile` is a single atomic filesystem
 * operation, so no matter where a kill lands, `path` always resolves to
 * either the previous complete generation or the new complete one — never
 * a partial file. See design doc §5 for the full argument.
 */
export async function commitSlot(
  backend: AtomicFileBackend,
  path: string,
  bytes: Uint8Array,
  options?: CommitSlotOptions
): Promise<void> {
  const backupCount = options?.backupCount ?? 2
  const tmp = tmpPath(path)
  const envelope = await wrapEnvelope(bytes)

  await backend.writeFile(tmp, envelope)
  await backend.syncFile(tmp)

  const readBack = await backend.readFile(tmp)
  if (readBack === null || !bytesEqual(readBack, envelope)) {
    throw new Error(`[overworld] commitSlot: read-back verification failed for "${tmp}"`)
  }

  // Rotate oldest-first: at no point does a backup slot go through an
  // "empty" state before being refilled by an already-verified file.
  for (let n = backupCount; n >= 2; n--) {
    const older = backupPath(path, n - 1)
    if (await backend.exists(older)) {
      await backend.renameFile(older, backupPath(path, n))
    }
  }
  if (backupCount >= 1 && (await backend.exists(path))) {
    await backend.renameFile(path, backupPath(path, 1))
  }
  await backend.renameFile(tmp, path)
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @overworld-engine/core test -- commitSlot`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/saveFiles/types.ts packages/core/src/saveFiles/paths.ts \
  packages/core/src/saveFiles/commitSlot.ts \
  packages/core/src/__tests__/testBackend.ts \
  packages/core/src/__tests__/commitSlot.test.ts
git commit -m "feat(core): add AtomicFileBackend interface and commitSlot"
```

---

### Task 3: `recoverSlot`

**Files:**
- Create: `packages/core/src/saveFiles/recoverSlot.ts`
- Test: `packages/core/src/__tests__/recoverSlot.test.ts`

**Interfaces:**
- Consumes: `AtomicFileBackend` (Task 2 `./types`), `backupPath` (Task 2 `./paths`), `unwrapEnvelope` (Task 1 `./envelope`), `commitSlot` + `createInMemoryBackend` (Tasks 1-2, for test setup).
- Produces: `RecoverResult { bytes: Uint8Array; source: string }`, `RecoverFailure { path: string; reason: 'missing' | 'envelope-invalid' | 'validator-rejected' }`, `RecoverOutcome { result: RecoverResult | null; failures: RecoverFailure[] }`, `recoverSlot(backend, path, options?: { backupCount?: number; isValid?: (bytes: Uint8Array) => boolean }): Promise<RecoverOutcome>`.

- [ ] **Step 1: Write the failing tests**

```ts
// packages/core/src/__tests__/recoverSlot.test.ts
import { describe, expect, it } from 'vitest'
import { commitSlot } from '../saveFiles/commitSlot'
import { recoverSlot } from '../saveFiles/recoverSlot'
import { createInMemoryBackend } from './testBackend'

const enc = (s: string) => new TextEncoder().encode(s)
const dec = (bytes: Uint8Array) => new TextDecoder().decode(bytes)

describe('recoverSlot', () => {
  it('returns current when it is valid', async () => {
    const backend = createInMemoryBackend()
    await commitSlot(backend, 'slot', enc('gen0'))

    const outcome = await recoverSlot(backend, 'slot')
    expect(outcome.result?.source).toBe('current')
    expect(dec(outcome.result!.bytes)).toBe('gen0')
    expect(outcome.failures).toEqual([])
  })

  it('falls back to backup1 when current is missing, reporting the failure', async () => {
    const backend = createInMemoryBackend()
    await commitSlot(backend, 'slot', enc('gen0'))
    await commitSlot(backend, 'slot', enc('gen1'))
    await backend.deleteFile('slot')

    const outcome = await recoverSlot(backend, 'slot')
    expect(outcome.result?.source).toBe('backup1')
    expect(dec(outcome.result!.bytes)).toBe('gen1')
    expect(outcome.failures).toEqual([{ path: 'slot', reason: 'missing' }])
  })

  it('falls back to backup2 when current and backup1 are corrupt', async () => {
    const backend = createInMemoryBackend()
    await commitSlot(backend, 'slot', enc('gen0'))
    await commitSlot(backend, 'slot', enc('gen1'))
    await commitSlot(backend, 'slot', enc('gen2'))
    await backend.writeFile('slot', enc('corrupt'))
    await backend.writeFile('slot.bak1', enc('also-corrupt'))

    const outcome = await recoverSlot(backend, 'slot')
    expect(outcome.result?.source).toBe('backup2')
    expect(dec(outcome.result!.bytes)).toBe('gen0')
    expect(outcome.failures).toEqual([
      { path: 'slot', reason: 'envelope-invalid' },
      { path: 'slot.bak1', reason: 'envelope-invalid' },
    ])
  })

  it('returns null with three failures when every generation is unusable', async () => {
    const backend = createInMemoryBackend()
    const outcome = await recoverSlot(backend, 'slot')

    expect(outcome.result).toBeNull()
    expect(outcome.failures).toEqual([
      { path: 'slot', reason: 'missing' },
      { path: 'slot.bak1', reason: 'missing' },
      { path: 'slot.bak2', reason: 'missing' },
    ])
  })

  it('honors a caller-supplied isValid, falling back past a physically-valid generation', async () => {
    const backend = createInMemoryBackend()
    await commitSlot(backend, 'slot', enc('bad-business-data'))
    await commitSlot(backend, 'slot', enc('good-business-data'))

    const outcome = await recoverSlot(backend, 'slot', {
      isValid: (bytes) => dec(bytes) === 'good-business-data',
    })

    expect(outcome.result?.source).toBe('backup1')
    expect(dec(outcome.result!.bytes)).toBe('good-business-data')
    expect(outcome.failures).toEqual([{ path: 'slot', reason: 'validator-rejected' }])
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @overworld-engine/core test -- recoverSlot`
Expected: FAIL — `Cannot find module '../saveFiles/recoverSlot'`

- [ ] **Step 3: Implement `recoverSlot.ts`**

```ts
// packages/core/src/saveFiles/recoverSlot.ts
import { unwrapEnvelope } from './envelope'
import { backupPath } from './paths'
import type { AtomicFileBackend } from './types'

export interface RecoverResult {
  bytes: Uint8Array
  /** `'current'`, or `` `backup${n}` `` for the nth rotated backup. */
  source: string
}

export interface RecoverFailure {
  path: string
  reason: 'missing' | 'envelope-invalid' | 'validator-rejected'
}

export interface RecoverOutcome {
  result: RecoverResult | null
  failures: RecoverFailure[]
}

export interface RecoverSlotOptions {
  /** Must match the `backupCount` the slot was written with. @default 2 */
  backupCount?: number
  /** Optional business-level validity check, applied after our own envelope check passes. */
  isValid?: (bytes: Uint8Array) => boolean
}

/**
 * Walk `current → backup1 → backup2 → ...` (newest to oldest), returning the
 * first generation that passes both the physical envelope check and the
 * optional caller-supplied `isValid`. Every rejected candidate is recorded
 * in `failures`, in order, so callers can surface "recovered from backup 2"
 * style messaging.
 */
export async function recoverSlot(
  backend: AtomicFileBackend,
  path: string,
  options?: RecoverSlotOptions
): Promise<RecoverOutcome> {
  const backupCount = options?.backupCount ?? 2
  const failures: RecoverFailure[] = []

  const candidates: { path: string; source: string }[] = [{ path, source: 'current' }]
  for (let n = 1; n <= backupCount; n++) {
    candidates.push({ path: backupPath(path, n), source: `backup${n}` })
  }

  for (const candidate of candidates) {
    const raw = await backend.readFile(candidate.path)
    if (raw === null) {
      failures.push({ path: candidate.path, reason: 'missing' })
      continue
    }
    const payload = await unwrapEnvelope(raw)
    if (payload === null) {
      failures.push({ path: candidate.path, reason: 'envelope-invalid' })
      continue
    }
    if (options?.isValid && !options.isValid(payload)) {
      failures.push({ path: candidate.path, reason: 'validator-rejected' })
      continue
    }
    return { result: { bytes: payload, source: candidate.source }, failures }
  }

  return { result: null, failures }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @overworld-engine/core test -- recoverSlot`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/saveFiles/recoverSlot.ts packages/core/src/__tests__/recoverSlot.test.ts
git commit -m "feat(core): add recoverSlot newest-to-oldest recovery walk"
```

---

### Task 4: Fault-injection crash-safety proof

**Files:**
- Modify: `packages/core/src/__tests__/testBackend.ts` (add `withFaultAt`)
- Modify: `packages/core/src/__tests__/commitSlot.test.ts` (add crash-safety sweep test)

**Interfaces:**
- Consumes: `AtomicFileBackend` (Task 2), `commitSlot` (Task 2), `recoverSlot` (Task 3), `createInMemoryBackend` (Task 2).
- Produces: `withFaultAt(base: AtomicFileBackend, failAtCallIndex: number | null): { backend: AtomicFileBackend; callCount(): number }`.

This is the equivalent of the requirement doc's "1000x kill -9" acceptance test: instead of literally killing a process 1000 times, it deterministically fails every single point a real kill could land on and asserts recovery still succeeds — see design doc §9 for why this is an equivalent, CI-friendly proof.

- [ ] **Step 1: Write the failing test**

Append to `packages/core/src/__tests__/testBackend.ts`:

```ts
/**
 * Wrap a backend so the Nth method call across the whole backend (1-indexed,
 * counting every method in call order) throws instead of running —
 * simulating the process being killed at that exact point. Every other call
 * runs normally. Pass `null` to never fail (useful for learning how many
 * calls a scenario makes via `callCount()`).
 */
export function withFaultAt(
  base: AtomicFileBackend,
  failAtCallIndex: number | null
): { backend: AtomicFileBackend; callCount: () => number } {
  let count = 0
  const wrap = <A extends unknown[], R>(fn: (...args: A) => Promise<R>) => {
    return async (...args: A): Promise<R> => {
      count += 1
      if (failAtCallIndex !== null && count === failAtCallIndex) {
        throw new Error(`[test] injected fault at call #${count}`)
      }
      return fn(...args)
    }
  }
  const backend: AtomicFileBackend = {
    writeFile: wrap(base.writeFile.bind(base)),
    syncFile: wrap(base.syncFile.bind(base)),
    renameFile: wrap(base.renameFile.bind(base)),
    readFile: wrap(base.readFile.bind(base)),
    deleteFile: wrap(base.deleteFile.bind(base)),
    exists: wrap(base.exists.bind(base)),
  }
  return { backend, callCount: () => count }
}
```

Append to `packages/core/src/__tests__/commitSlot.test.ts` (add the import and the new `it`):

```ts
import { createInMemoryBackend, withFaultAt } from './testBackend'
import { recoverSlot } from '../saveFiles/recoverSlot'

// ... inside describe('commitSlot', () => { ... }), add:

  it('always leaves a recoverable generation no matter which single backend call is interrupted', async () => {
    // Learn how many backend calls one commitSlot makes once two prior
    // generations already exist — the branch that exercises every rotation step.
    const probe = createInMemoryBackend()
    await commitSlot(probe, 'slot', enc('gen0'))
    await commitSlot(probe, 'slot', enc('gen1'))
    const probeFault = withFaultAt(probe, null)
    await commitSlot(probeFault.backend, 'slot', enc('gen2'))
    const totalCalls = probeFault.callCount()
    expect(totalCalls).toBeGreaterThan(0)

    for (let failAt = 1; failAt <= totalCalls; failAt++) {
      const attempt = createInMemoryBackend()
      await commitSlot(attempt, 'slot', enc('gen0'))
      await commitSlot(attempt, 'slot', enc('gen1'))

      const faulty = withFaultAt(attempt, failAt)
      await commitSlot(faulty.backend, 'slot', enc('gen2')).catch(() => {})

      const outcome = await recoverSlot(attempt, 'slot')
      expect(outcome.result).not.toBeNull()
      expect(['gen1', 'gen2']).toContain(dec(outcome.result!.bytes))
    }
  })
```

Also add a top-of-file `dec` byte-decoding helper for this test if not already present (the existing `dec` in this file decodes a *path*, not raw bytes — add a second helper):

```ts
const decBytes = (bytes: Uint8Array) => new TextDecoder().decode(bytes)
```

...and use `decBytes(outcome.result!.bytes)` in the new test instead of `dec(...)` to avoid clashing with the existing per-path `dec` helper.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @overworld-engine/core test -- commitSlot`
Expected: FAIL — `withFaultAt is not a function` (not yet exported from `testBackend.ts`)

- [ ] **Step 3: Confirm the implementation from Step 1 is in place**

`withFaultAt` was written directly into `testBackend.ts` above (this task's production code IS the test helper — there is no separate non-test implementation file, since fault injection is inherently test-only infrastructure).

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @overworld-engine/core test -- commitSlot`
Expected: PASS (5 tests in `commitSlot.test.ts`, including the new sweep)

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/__tests__/testBackend.ts packages/core/src/__tests__/commitSlot.test.ts
git commit -m "test(core): add fault-injection crash-safety sweep for commitSlot"
```

---

### Task 5: Wire `core` public exports

**Files:**
- Create: `packages/core/src/saveFiles/index.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: everything from Tasks 1-3 (`types.ts`, `envelope.ts`, `commitSlot.ts`, `recoverSlot.ts`).
- Produces: `@overworld-engine/core` now exports `commitSlot`, `recoverSlot`, `wrapEnvelope`, `unwrapEnvelope`, `bytesEqual` and types `AtomicFileBackend`, `CommitSlotOptions`, `RecoverResult`, `RecoverFailure`, `RecoverOutcome`, `RecoverSlotOptions`.

- [ ] **Step 1: Create the submodule barrel**

```ts
// packages/core/src/saveFiles/index.ts
export type { AtomicFileBackend } from './types'
export { commitSlot } from './commitSlot'
export type { CommitSlotOptions } from './commitSlot'
export { recoverSlot } from './recoverSlot'
export type { RecoverResult, RecoverFailure, RecoverOutcome, RecoverSlotOptions } from './recoverSlot'
export { wrapEnvelope, unwrapEnvelope, bytesEqual } from './envelope'
```

- [ ] **Step 2: Re-export from the package root**

Add to the end of `packages/core/src/index.ts`:

```ts
export {
  commitSlot,
  recoverSlot,
  wrapEnvelope,
  unwrapEnvelope,
  bytesEqual,
} from './saveFiles'
export type {
  AtomicFileBackend,
  CommitSlotOptions,
  RecoverResult,
  RecoverFailure,
  RecoverOutcome,
  RecoverSlotOptions,
} from './saveFiles'
```

- [ ] **Step 3: Typecheck and run the full `core` test suite**

Run: `pnpm --filter @overworld-engine/core typecheck && pnpm --filter @overworld-engine/core test`
Expected: both PASS, 0 errors, all existing + new tests green.

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/saveFiles/index.ts packages/core/src/index.ts
git commit -m "feat(core): export saveFiles primitive from package root"
```

---

### Task 6: Scaffold `packages/adapters-savefile` (Rust plugin)

**Files:**
- Create: `packages/adapters-savefile/package.json`
- Create: `packages/adapters-savefile/tsconfig.json`
- Create: `packages/adapters-savefile/tsup.config.ts`
- Create: `packages/adapters-savefile/README.md`
- Create: `packages/adapters-savefile/src-tauri/Cargo.toml`
- Create: `packages/adapters-savefile/src-tauri/build.rs`
- Create: `packages/adapters-savefile/src-tauri/.gitignore`
- Create: `packages/adapters-savefile/src-tauri/README.md`
- Create: `packages/adapters-savefile/src-tauri/src/lib.rs`
- Create: `packages/adapters-savefile/src-tauri/permissions/default.toml`

**Interfaces:**
- Produces (Rust, consumed by Task 7's TS bridge): six Tauri commands under `plugin:overworld-savefile|<name>` — `savefile_write(path: String, bytes_base64: String) -> Result<(), String>`, `savefile_sync(path: String) -> Result<(), String>`, `savefile_rename(from: String, to: String) -> Result<(), String>`, `savefile_read(path: String) -> Result<Option<String>, String>`, `savefile_delete(path: String) -> Result<(), String>`, `savefile_exists(path: String) -> Result<bool, String>`. Rust `pub fn init<R: Runtime>() -> TauriPlugin<R>`.

No workspace registration step is needed — `pnpm-workspace.yaml` already globs `packages/*`.

- [ ] **Step 1: `package.json`**

```json
{
  "name": "@overworld-engine/adapters-savefile",
  "version": "0.1.0",
  "description": "Tauri adapter for Overworld: a hardened atomic-file-with-backups primitive (temp write, fsync, rotating backups, atomic rename) for desktop game saves",
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
    "savegame",
    "tauri"
  ],
  "homepage": "https://github.com/luzhenqian/overworld#readme",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/luzhenqian/overworld.git",
    "directory": "packages/adapters-savefile"
  }
}
```

- [ ] **Step 2: `tsconfig.json` and `tsup.config.ts`**

```json
// packages/adapters-savefile/tsconfig.json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src"]
}
```

```ts
// packages/adapters-savefile/tsup.config.ts
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
})
```

- [ ] **Step 3: Rust crate — `Cargo.toml`, `build.rs`, `.gitignore`**

```toml
# packages/adapters-savefile/src-tauri/Cargo.toml
[package]
name = "overworld-savefile"
links = "overworld-savefile"
version = "0.1.0"
description = "Tauri 2 plugin providing a hardened atomic-file-with-backups primitive (temp write, fsync, atomic rename) for Overworld game saves"
authors = ["Overworld"]
edition = "2021"
license = "MIT"
repository = "https://github.com/luzhenqian/overworld"
readme = "README.md"
keywords = ["tauri-plugin", "savegame", "atomic-write", "gamedev"]
categories = ["game-development", "filesystem"]

[lib]
name = "overworld_savefile"
crate-type = ["staticlib", "cdylib", "rlib"]

[build-dependencies]
tauri-plugin = { version = "2", features = ["build"] }

[dependencies]
tauri = { version = "2", features = [] }
base64 = "0.22"
```

```rust
// packages/adapters-savefile/src-tauri/build.rs
const COMMANDS: &[&str] = &[
    "savefile_write",
    "savefile_sync",
    "savefile_rename",
    "savefile_read",
    "savefile_delete",
    "savefile_exists",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).build();
}
```

```
# packages/adapters-savefile/src-tauri/.gitignore
/target
```

- [ ] **Step 4: Rust crate — `src/lib.rs`**

```rust
// packages/adapters-savefile/src-tauri/src/lib.rs
use std::fs;
use std::path::{Component, Path, PathBuf};

use base64::{engine::general_purpose::STANDARD, Engine as _};
use tauri::plugin::{Builder, TauriPlugin};
use tauri::{AppHandle, Manager, Runtime};

/// Resolve a caller-supplied relative path against the app's `AppData`
/// directory, rejecting `..` components so this plugin can only ever touch
/// files inside that directory.
fn resolve_path<R: Runtime>(app: &AppHandle<R>, path: &str) -> Result<PathBuf, String> {
    if Path::new(path).components().any(|c| c == Component::ParentDir) {
        return Err(format!("path must not contain '..': {path}"));
    }
    let base = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(base.join(path))
}

/// Each command below is one `std::fs` call. Splitting write/sync/rename
/// into separate commands (rather than one "do everything" command) is
/// intentional: `core`'s `commitSlot` orchestrates the exact call order
/// from the TypeScript side, and its crash-safety tests fault-inject at
/// each individual call boundary — see
/// `docs/superpowers/specs/2026-07-24-save-hardening-design.md` §5.
///
/// Calling `sync_all()` on a *freshly opened* handle still flushes data an
/// earlier `write()` call handed to the OS — fsync operates on the file's
/// dirty pages, not on the handle that dirtied them — so `savefile_write`
/// and `savefile_sync` being two separate opens is correct, not just
/// convenient.
#[tauri::command]
async fn savefile_write<R: Runtime>(
    app: AppHandle<R>,
    path: String,
    bytes_base64: String,
) -> Result<(), String> {
    let full = resolve_path(&app, &path)?;
    if let Some(parent) = full.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let bytes = STANDARD.decode(&bytes_base64).map_err(|e| e.to_string())?;
    fs::write(&full, bytes).map_err(|e| e.to_string())
}

#[tauri::command]
async fn savefile_sync<R: Runtime>(app: AppHandle<R>, path: String) -> Result<(), String> {
    let full = resolve_path(&app, &path)?;
    let file = fs::File::open(&full).map_err(|e| e.to_string())?;
    file.sync_all().map_err(|e| e.to_string())
}

#[tauri::command]
async fn savefile_rename<R: Runtime>(
    app: AppHandle<R>,
    from: String,
    to: String,
) -> Result<(), String> {
    let full_from = resolve_path(&app, &from)?;
    let full_to = resolve_path(&app, &to)?;
    fs::rename(&full_from, &full_to).map_err(|e| e.to_string())?;
    sync_parent_dir(&full_to);
    Ok(())
}

/// POSIX needs the containing directory fsynced too, or the rename's
/// directory-entry update can survive a process kill but not a real power
/// loss. Best-effort: a failure here isn't reported, since the rename
/// itself (the operation that matters for `current` never being a partial
/// file) already succeeded.
#[cfg(unix)]
fn sync_parent_dir(path: &Path) {
    if let Some(parent) = path.parent() {
        if let Ok(dir) = fs::File::open(parent) {
            let _ = dir.sync_all();
        }
    }
}

/// NTFS durability for metadata/directory-entry updates is handled by its
/// own journal; there is no directory-fsync equivalent to call here.
#[cfg(not(unix))]
fn sync_parent_dir(_path: &Path) {}

#[tauri::command]
async fn savefile_read<R: Runtime>(app: AppHandle<R>, path: String) -> Result<Option<String>, String> {
    let full = resolve_path(&app, &path)?;
    match fs::read(&full) {
        Ok(bytes) => Ok(Some(STANDARD.encode(bytes))),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
async fn savefile_delete<R: Runtime>(app: AppHandle<R>, path: String) -> Result<(), String> {
    let full = resolve_path(&app, &path)?;
    match fs::remove_file(&full) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
async fn savefile_exists<R: Runtime>(app: AppHandle<R>, path: String) -> Result<bool, String> {
    let full = resolve_path(&app, &path)?;
    Ok(full.exists())
}

/// Register the `overworld-savefile` Tauri plugin: six generic file
/// primitives (write/sync/rename/read/delete/exists) under
/// `plugin:overworld-savefile|<command>`. No setup state — every command is
/// a stateless `std::fs` call resolved against `AppData`.
///
/// The runtime namespace passed to `Builder::new` MUST match this crate's
/// Cargo package name (`overworld-savefile`) — Tauri derives the ACL
/// capability identifier from the package name, and a mismatch here
/// silently denies every command at runtime (see the fix in
/// `adapters-steam`, commit `5570047`).
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("overworld-savefile")
        .invoke_handler(tauri::generate_handler![
            savefile_write,
            savefile_sync,
            savefile_rename,
            savefile_read,
            savefile_delete,
            savefile_exists,
        ])
        .build()
}
```

- [ ] **Step 5: Permissions manifest**

```toml
# packages/adapters-savefile/src-tauri/permissions/default.toml
"$schema" = "schemas/schema.json"

[default]
description = "Allows all savefile primitive commands: write, sync, rename, read, delete, exists."
permissions = [
  "allow-savefile-write",
  "allow-savefile-sync",
  "allow-savefile-rename",
  "allow-savefile-read",
  "allow-savefile-delete",
  "allow-savefile-exists",
]
```

- [ ] **Step 6: READMEs**

```markdown
<!-- packages/adapters-savefile/README.md -->
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
```

```markdown
<!-- packages/adapters-savefile/src-tauri/README.md -->
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
```

- [ ] **Step 7: Compile the Rust crate and generate the permissions schema**

Run: `cd packages/adapters-savefile/src-tauri && cargo check`
Expected: compiles cleanly; `tauri-plugin`'s build script (invoked via `build.rs`) generates `permissions/schemas/schema.json` and `permissions/autogenerated/reference.md` from `COMMANDS` in `build.rs`, and `Cargo.lock` is created — mirrors what already exists under `packages/adapters-steam/src-tauri/permissions/`.

If `cargo`/the Rust toolchain isn't available in this environment, flag it rather than skipping silently — this step cannot be faked, the generated files are load-bearing for Tauri's permission system.

- [ ] **Step 8: Commit**

```bash
git add packages/adapters-savefile
git commit -m "feat(adapters-savefile): scaffold Rust Tauri plugin for atomic save-file primitives"
```

---

### Task 7: TS bridge — `createTauriSaveFileBackend`

**Files:**
- Create: `packages/adapters-savefile/src/tauriBackend.ts`
- Create: `packages/adapters-savefile/src/index.ts`
- Test: `packages/adapters-savefile/src/__tests__/tauriBackend.test.ts`

**Interfaces:**
- Consumes: `AtomicFileBackend` type from `@overworld-engine/core` (Task 5); the six Rust commands from Task 6.
- Produces: `createTauriSaveFileBackend(): AtomicFileBackend`.

- [ ] **Step 1: Write the failing tests**

```ts
// packages/adapters-savefile/src/__tests__/tauriBackend.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const invokeMock = vi.fn()
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}))

const { createTauriSaveFileBackend } = await import('../tauriBackend')

beforeEach(() => {
  invokeMock.mockReset()
})

describe('createTauriSaveFileBackend', () => {
  it('writeFile base64-encodes bytes and invokes savefile_write', async () => {
    invokeMock.mockResolvedValueOnce(undefined)
    const backend = createTauriSaveFileBackend()

    await backend.writeFile('slot', new Uint8Array([1, 2, 3]))

    expect(invokeMock).toHaveBeenCalledWith('plugin:overworld-savefile|savefile_write', {
      path: 'slot',
      bytesBase64: 'AQID',
    })
  })

  it('syncFile invokes savefile_sync', async () => {
    invokeMock.mockResolvedValueOnce(undefined)
    await createTauriSaveFileBackend().syncFile('slot')
    expect(invokeMock).toHaveBeenCalledWith('plugin:overworld-savefile|savefile_sync', { path: 'slot' })
  })

  it('renameFile invokes savefile_rename', async () => {
    invokeMock.mockResolvedValueOnce(undefined)
    await createTauriSaveFileBackend().renameFile('a', 'b')
    expect(invokeMock).toHaveBeenCalledWith('plugin:overworld-savefile|savefile_rename', {
      from: 'a',
      to: 'b',
    })
  })

  it('readFile base64-decodes to bytes, or returns null when missing', async () => {
    invokeMock.mockResolvedValueOnce('AQID')
    expect(await createTauriSaveFileBackend().readFile('slot')).toEqual(new Uint8Array([1, 2, 3]))

    invokeMock.mockResolvedValueOnce(null)
    expect(await createTauriSaveFileBackend().readFile('missing')).toBeNull()
  })

  it('deleteFile invokes savefile_delete', async () => {
    invokeMock.mockResolvedValueOnce(undefined)
    await createTauriSaveFileBackend().deleteFile('slot')
    expect(invokeMock).toHaveBeenCalledWith('plugin:overworld-savefile|savefile_delete', { path: 'slot' })
  })

  it('exists invokes savefile_exists and returns its result', async () => {
    invokeMock.mockResolvedValueOnce(true)
    expect(await createTauriSaveFileBackend().exists('slot')).toBe(true)
    expect(invokeMock).toHaveBeenCalledWith('plugin:overworld-savefile|savefile_exists', { path: 'slot' })
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @overworld-engine/adapters-savefile test`
Expected: FAIL — `Cannot find module '../tauriBackend'`

- [ ] **Step 3: Implement `tauriBackend.ts` and `index.ts`**

```ts
// packages/adapters-savefile/src/tauriBackend.ts
import { invoke } from '@tauri-apps/api/core'
import type { AtomicFileBackend } from '@overworld-engine/core'

const PLUGIN = 'plugin:overworld-savefile'

function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  return invoke<T>(`${PLUGIN}|${command}`, args)
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 8192
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/**
 * `AtomicFileBackend` backed by the `overworld-savefile` Tauri plugin.
 * Every method is a single `invoke` round-trip to a Rust command that does
 * exactly one `std::fs` operation — see `src-tauri/src/lib.rs`. Paths are
 * relative to the app's `AppData` directory.
 */
export function createTauriSaveFileBackend(): AtomicFileBackend {
  return {
    async writeFile(path, bytes) {
      await call<void>('savefile_write', { path, bytesBase64: bytesToBase64(bytes) })
    },
    async syncFile(path) {
      await call<void>('savefile_sync', { path })
    },
    async renameFile(from, to) {
      await call<void>('savefile_rename', { from, to })
    },
    async readFile(path) {
      const result = await call<string | null>('savefile_read', { path })
      return result === null ? null : base64ToBytes(result)
    },
    async deleteFile(path) {
      await call<void>('savefile_delete', { path })
    },
    async exists(path) {
      return call<boolean>('savefile_exists', { path })
    },
  }
}
```

```ts
// packages/adapters-savefile/src/index.ts
export { createTauriSaveFileBackend } from './tauriBackend'
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @overworld-engine/adapters-savefile test`
Expected: PASS (6 tests)

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @overworld-engine/adapters-savefile typecheck`
Expected: PASS, 0 errors

- [ ] **Step 6: Commit**

```bash
git add packages/adapters-savefile/src
git commit -m "feat(adapters-savefile): add createTauriSaveFileBackend TS bridge"
```

---

### Task 8: Web backend — `createWebSaveFileBackend`

**Files:**
- Create: `packages/platform/src/webSaveFileBackend.ts`
- Modify: `packages/platform/src/index.ts`
- Test: `packages/platform/src/__tests__/webSaveFileBackend.test.ts`

**Interfaces:**
- Consumes: `AtomicFileBackend` type from `@overworld-engine/core` (Task 5).
- Produces: `createWebSaveFileBackend(options?: { prefix?: string }): AtomicFileBackend`, exported from `@overworld-engine/platform`.

- [ ] **Step 1: Write the failing tests**

```ts
// packages/platform/src/__tests__/webSaveFileBackend.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createWebSaveFileBackend } from '../webSaveFileBackend'

function stubLocalStorage(): Map<string, string> {
  const backing = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => backing.get(k) ?? null,
    setItem: (k: string, v: string) => void backing.set(k, v),
    removeItem: (k: string) => void backing.delete(k),
  })
  return backing
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('createWebSaveFileBackend', () => {
  it('writes and reads bytes round-trip, under the given prefix', async () => {
    const backing = stubLocalStorage()
    const backend = createWebSaveFileBackend({ prefix: 'test:' })

    await backend.writeFile('slot', new Uint8Array([1, 2, 3]))
    expect(backing.has('test:slot')).toBe(true)
    expect(await backend.readFile('slot')).toEqual(new Uint8Array([1, 2, 3]))
  })

  it('readFile returns null for a missing path', async () => {
    stubLocalStorage()
    expect(await createWebSaveFileBackend().readFile('missing')).toBeNull()
  })

  it('exists reflects presence', async () => {
    stubLocalStorage()
    const backend = createWebSaveFileBackend()
    expect(await backend.exists('slot')).toBe(false)
    await backend.writeFile('slot', new Uint8Array([1]))
    expect(await backend.exists('slot')).toBe(true)
  })

  it('deleteFile removes the entry; is a no-op when missing', async () => {
    stubLocalStorage()
    const backend = createWebSaveFileBackend()
    await backend.writeFile('slot', new Uint8Array([1]))
    await backend.deleteFile('slot')
    expect(await backend.exists('slot')).toBe(false)
    await expect(backend.deleteFile('slot')).resolves.toBeUndefined()
  })

  it('renameFile moves the value and removes the source', async () => {
    stubLocalStorage()
    const backend = createWebSaveFileBackend()
    await backend.writeFile('a', new Uint8Array([9, 9]))

    await backend.renameFile('a', 'b')

    expect(await backend.exists('a')).toBe(false)
    expect(await backend.readFile('b')).toEqual(new Uint8Array([9, 9]))
  })

  it('renameFile throws when the source does not exist', async () => {
    stubLocalStorage()
    await expect(createWebSaveFileBackend().renameFile('missing', 'b')).rejects.toThrow(
      'does not exist'
    )
  })

  it('syncFile is a no-op that resolves', async () => {
    stubLocalStorage()
    await expect(createWebSaveFileBackend().syncFile('slot')).resolves.toBeUndefined()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @overworld-engine/platform test -- webSaveFileBackend`
Expected: FAIL — `Cannot find module '../webSaveFileBackend'`

- [ ] **Step 3: Implement `webSaveFileBackend.ts`**

```ts
// packages/platform/src/webSaveFileBackend.ts
import type { AtomicFileBackend } from '@overworld-engine/core'

export interface WebSaveFileBackendOptions {
  /** `localStorage` key prefix. @default 'overworld:savefile:' */
  prefix?: string
}

/**
 * `AtomicFileBackend` over `localStorage`. `syncFile` is a no-op: browsers
 * give JS no fsync-equivalent, and `localStorage.setItem` already commits
 * synchronously on the calling thread, so there is no separate "flush" step
 * to trigger. `renameFile` copies the value to `to` then removes `from`;
 * because JS is single-threaded, no other code can observe a state where
 * neither key holds the value, and the worst crash-mid-rename outcome is a
 * harmless leftover duplicate under the old key.
 */
export function createWebSaveFileBackend(options?: WebSaveFileBackendOptions): AtomicFileBackend {
  const prefix = options?.prefix ?? 'overworld:savefile:'
  const key = (path: string): string => `${prefix}${path}`

  return {
    async writeFile(path, bytes) {
      localStorage.setItem(key(path), bytesToBase64(bytes))
    },
    async syncFile() {
      // No-op — see module doc.
    },
    async renameFile(from, to) {
      const value = localStorage.getItem(key(from))
      if (value === null) {
        throw new Error(`[overworld] webSaveFileBackend: renameFile "${from}" does not exist`)
      }
      localStorage.setItem(key(to), value)
      localStorage.removeItem(key(from))
    },
    async readFile(path) {
      const value = localStorage.getItem(key(path))
      return value === null ? null : base64ToBytes(value)
    },
    async deleteFile(path) {
      localStorage.removeItem(key(path))
    },
    async exists(path) {
      return localStorage.getItem(key(path)) !== null
    },
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 8192
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}
```

- [ ] **Step 4: Export it from the package root**

Add to `packages/platform/src/index.ts`, after the existing "Bridges" export block:

```ts
// Save-file primitive backend (web)
export { createWebSaveFileBackend } from './webSaveFileBackend'
export type { WebSaveFileBackendOptions } from './webSaveFileBackend'
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter @overworld-engine/platform test -- webSaveFileBackend`
Expected: PASS (7 tests)

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter @overworld-engine/platform typecheck`
Expected: PASS, 0 errors

- [ ] **Step 7: Commit**

```bash
git add packages/platform/src/webSaveFileBackend.ts packages/platform/src/index.ts \
  packages/platform/src/__tests__/webSaveFileBackend.test.ts
git commit -m "feat(platform): add createWebSaveFileBackend localStorage backend"
```

---

### Task 9: Scoped verification across all three touched packages

**Files:** none (verification only — no new files)

**Interfaces:** none — this task only runs the touched packages' own scripts.

Per this repo's convention (never full-workspace build/test, only changed packages + dependents): `core` is a dependency of both `adapters-savefile` and `platform`, so all three must be verified; nothing outside them changed.

- [ ] **Step 1: Run tests for all three touched packages**

Run: `pnpm --filter @overworld-engine/core --filter @overworld-engine/adapters-savefile --filter @overworld-engine/platform test`
Expected: PASS across all three (core: existing suite + envelope/commitSlot/recoverSlot; adapters-savefile: tauriBackend; platform: existing suite + webSaveFileBackend)

- [ ] **Step 2: Run typecheck for all three touched packages**

Run: `pnpm --filter @overworld-engine/core --filter @overworld-engine/adapters-savefile --filter @overworld-engine/platform typecheck`
Expected: PASS, 0 errors

- [ ] **Step 3: Run dependency-cruiser to confirm the zero-cross-package-import rule holds**

Run: `pnpm depcruise` (or the repo's configured dependency-cruiser script — check `package.json` root scripts for the exact name if this differs)
Expected: PASS — `adapters-savefile` and `platform` each import only `@overworld-engine/core`, never each other.

- [ ] **Step 4: Cross-check against the design doc**

Re-read `docs/superpowers/specs/2026-07-24-save-hardening-design.md` §§2-9 against what was built: confirm package structure (§2) matches, `AtomicFileBackend` interface (§3) matches exactly, envelope format (§4) matches, write/recovery protocols (§§5-6) match, both backends exist (§§7-8), and the fault-injection test strategy (§9) is in place. Note any drift in the final task summary.

- [ ] **Step 5: Final commit (if anything was left uncommitted)**

```bash
git status
```

If clean (everything was committed per-task in Tasks 1-8), nothing to do here.
