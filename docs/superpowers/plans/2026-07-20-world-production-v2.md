# World-Production v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Distribute the world-production team's 10 P0–P2 feedback items across their home packages (`core`, `input`, `environment`, `loading`, `audio`, `minimap`, `scene`) so a dense walkable 3D world can be built without reinventing engine layers in app code.

**Architecture:** New `inputLock` primitive in `core` is the single input-blocking source of truth; sibling packages gain the missing composition layers (`WorldEnvironment`, `sceneLoadState`, ambient zones, radar selectors); `scene` gains the three genuinely-new pieces (instanced `Decorations`, runtime `Lod`, orbit camera) plus ref-driven moving-NPC integration. Cross-package coupling stays at zero — collaboration is only via `gameEvents`/`OverworldEventMap` and structural types.

**Tech Stack:** TypeScript, React 18, three.js 0.170, @react-three/fiber 8, @react-three/drei 9, zustand 5, vitest 4, tsup, pnpm workspaces.

## Global Constraints

- **Zero cross-system-package imports.** System packages may import ONLY `@overworld-engine/core`. Cross-package collaboration is via `gameEvents`/`OverworldEventMap` events and structural (duck-typed) interfaces. Verified by grep in the final task.
- **`core` stays framework-agnostic:** no `react`, `zustand`, `three`, or R3F imports in `core`. `inputLock` is pure TypeScript.
- **Pure logic before bindings:** every feature extracts a pure, GL-free logic module (`*.ts`) with unit tests, then a thin R3F/DOM binding on top.
- **Store shape convention:** module-level singleton stores use zustand `create`, consumed via `useStore.getState()` in tests. Content/save-bearing engines use `createXxx(config)` factories returning `{ store, ...methods }`.
- **Event naming:** kebab-case `domain:action`. New event: `input:lock-changed`.
- **Vec3** = `[number, number, number]` from `@overworld-engine/core`.
- **Test commands** run from a package dir: `pnpm --filter @overworld-engine/<pkg> test`. Typecheck: `pnpm --filter @overworld-engine/<pkg> typecheck`.
- **Semver on release:** `scene` → major (2.0.0); `core`/`input`/`environment`/`loading`/`audio`/`minimap` → minor. One changeset per package (final task).
- **Backward compatibility:** all changes additive except `scene`'s `isInputBlocked` default (falls back to `inputLock.isLocked()` when omitted — no effect until a game acquires a lock).

---

## Phase 1 — `core`: input lock primitive (foundation)

### Task 1: `inputLock` headless singleton + factory

**Files:**
- Create: `packages/core/src/inputLock.ts`
- Create: `packages/core/src/__tests__/inputLock.test.ts`
- Modify: `packages/core/src/events.ts` (add `input:lock-changed` to `OverworldEventMap`)
- Modify: `packages/core/src/index.ts` (export)

**Interfaces:**
- Consumes: `EventBus`, `gameEvents` from `./events`.
- Produces: `inputLock: InputLock`, `createInputLock(bus?: EventBus<any>): InputLock`, `interface InputLock`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/src/__tests__/inputLock.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EventBus } from '../events'
import { createInputLock } from '../inputLock'

describe('inputLock', () => {
  it('starts unlocked', () => {
    const lock = createInputLock(new EventBus())
    expect(lock.isLocked()).toBe(false)
    expect(lock.activeLocks()).toEqual([])
  })

  it('acquire/release toggles locked state', () => {
    const lock = createInputLock(new EventBus())
    lock.acquire('dialogue')
    expect(lock.isLocked()).toBe(true)
    expect(lock.activeLocks()).toEqual(['dialogue'])
    lock.release('dialogue')
    expect(lock.isLocked()).toBe(false)
  })

  it('acquire is idempotent per id', () => {
    const lock = createInputLock(new EventBus())
    lock.acquire('a')
    lock.acquire('a')
    lock.release('a')
    expect(lock.isLocked()).toBe(false)
  })

  it('activeLocks is sorted and deduped', () => {
    const lock = createInputLock(new EventBus())
    lock.acquire('z')
    lock.acquire('a')
    expect(lock.activeLocks()).toEqual(['a', 'z'])
  })

  it('emits input:lock-changed only on state transitions', () => {
    const bus = new EventBus()
    const lock = createInputLock(bus)
    const spy = vi.fn()
    bus.on('input:lock-changed', spy)
    lock.acquire('a') // false -> true
    lock.acquire('b') // still locked, but active list changed
    lock.release('a') // still locked
    lock.release('b') // true -> false
    expect(spy).toHaveBeenCalledWith({ locked: true, active: ['a'] })
    expect(spy).toHaveBeenCalledWith({ locked: false, active: [] })
    expect(spy).toHaveBeenCalledTimes(4) // every active-set change emits
  })

  it('subscribe notifies and unsubscribes', () => {
    const lock = createInputLock(new EventBus())
    const seen: boolean[] = []
    const off = lock.subscribe((locked) => seen.push(locked))
    lock.acquire('a')
    off()
    lock.release('a')
    expect(seen).toEqual([true])
  })

  it('releaseAll clears everything', () => {
    const lock = createInputLock(new EventBus())
    lock.acquire('a')
    lock.acquire('b')
    lock.releaseAll()
    expect(lock.isLocked()).toBe(false)
    expect(lock.activeLocks()).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @overworld-engine/core test -- inputLock`
Expected: FAIL — cannot find `../inputLock`.

- [ ] **Step 3: Add the event to the map**

In `packages/core/src/events.ts`, add to the `OverworldEventMap` interface (near the other core events):

```ts
  'input:lock-changed': { locked: boolean; active: string[] }
```

- [ ] **Step 4: Write the implementation**

```ts
// packages/core/src/inputLock.ts
/**
 * Headless, framework-agnostic input lock: a single source of truth for
 * "gameplay input is suspended" that every input source (keyboard, joystick,
 * interact key, camera drag, future sources) can consult without importing
 * one another. Modals/dialogues acquire a named lock; sources check
 * {@link InputLock.isLocked}.
 *
 * Pure TypeScript — no react/zustand/three. React bindings live in `scene`.
 */
import { gameEvents, type EventBus } from './events'

export interface InputLock {
  /** Acquire a named lock (idempotent per id). */
  acquire(id: string): void
  /** Release a named lock (idempotent). */
  release(id: string): void
  /** True when any lock is held. */
  isLocked(): boolean
  /** Held lock ids, stably sorted. */
  activeLocks(): string[]
  /** Subscribe to lock-state changes; returns an unsubscribe function. */
  subscribe(fn: (locked: boolean, active: string[]) => void): () => void
  /** Release every lock (scene change / test cleanup). */
  releaseAll(): void
}

/** Create an isolated input lock bound to a specific bus (for tests/engines). */
export function createInputLock(bus: EventBus<any> = gameEvents): InputLock {
  const held = new Set<string>()
  const subs = new Set<(locked: boolean, active: string[]) => void>()

  const active = () => [...held].sort()

  const notify = () => {
    const locked = held.size > 0
    const list = active()
    bus.emit('input:lock-changed', { locked, active: list })
    for (const fn of subs) fn(locked, list)
  }

  return {
    acquire(id) {
      if (held.has(id)) return
      held.add(id)
      notify()
    },
    release(id) {
      if (!held.delete(id)) return
      notify()
    },
    isLocked: () => held.size > 0,
    activeLocks: active,
    subscribe(fn) {
      subs.add(fn)
      return () => subs.delete(fn)
    },
    releaseAll() {
      if (held.size === 0) return
      held.clear()
      notify()
    },
  }
}

/** Global input lock, bound to the default `gameEvents` bus. */
export const inputLock: InputLock = createInputLock()
```

- [ ] **Step 5: Export from index**

In `packages/core/src/index.ts` add:

```ts
export { inputLock, createInputLock } from './inputLock'
export type { InputLock } from './inputLock'
```

- [ ] **Step 6: Run tests + typecheck**

Run: `pnpm --filter @overworld-engine/core test -- inputLock && pnpm --filter @overworld-engine/core typecheck`
Expected: PASS (7 tests), typecheck clean.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/inputLock.ts packages/core/src/__tests__/inputLock.test.ts packages/core/src/events.ts packages/core/src/index.ts
git commit -m "feat(core): add headless inputLock primitive + input:lock-changed event"
```

---

## Phase 2 — `input`: bridge keyboard layers to the lock

### Task 2: `useKeyboardLayer` lockInput option + joystick lock awareness

**Files:**
- Modify: `packages/input/src/hooks.ts` (`useKeyboardLayer` new opts form)
- Modify: `packages/input/src/VirtualJoystick.tsx` (`respectInputLock`)
- Test: `packages/input/src/__tests__/keyboardLayerLock.test.ts` (create)

**Interfaces:**
- Consumes: `inputLock` from `@overworld-engine/core` (allowed — core dep).
- Produces: `useKeyboardLayer(id, priority, opts?: string[] | { blockedKeys?: string[]; lockInput?: boolean })`.

> **Test convention (repo-wide):** No package uses `@testing-library/react`,
> `renderHook`, or a jsdom vitest environment. Hooks are tested by extracting
> their pure decision logic into functions and testing those (see how
> `scene/interaction.ts` extracts `interact()` and only that is tested). Thin
> React effects (mount/unmount wiring) are left untested like `Player` and
> `useInteractKey`, verified by typecheck + build. Follow this convention —
> do NOT add test-infra dependencies.

- [ ] **Step 1: Read current `useKeyboardLayer`**

Run: `sed -n '1,80p' packages/input/src/hooks.ts` to see the current signature and effect. It currently takes `(id, priority, blockedKeys?)` and registers/unregisters a keyboard layer via `useKeyboardStore`.

- [ ] **Step 2: Write the failing test (pure helpers)**

```ts
// packages/input/src/__tests__/keyboardLayerLock.test.ts
import { describe, expect, it } from 'vitest'
import { parseLayerOpts } from '../hooks'
import { resolveJoystickOutput } from '../joystickMath'

describe('parseLayerOpts', () => {
  it('reads the legacy array form as blockedKeys with no lock', () => {
    expect(parseLayerOpts(['e', 'q'])).toEqual({ blockedKeys: ['e', 'q'], lockInput: false })
  })
  it('reads the object form with lockInput', () => {
    expect(parseLayerOpts({ blockedKeys: ['e'], lockInput: true })).toEqual({
      blockedKeys: ['e'],
      lockInput: true,
    })
  })
  it('defaults to no blockedKeys, no lock when omitted', () => {
    expect(parseLayerOpts(undefined)).toEqual({ blockedKeys: undefined, lockInput: false })
  })
})

describe('resolveJoystickOutput', () => {
  const raw = { x: 0.8, z: -0.5, running: true }
  it('passes the raw vector through when not locked', () => {
    expect(resolveJoystickOutput(raw, { locked: false, respect: true })).toEqual(raw)
  })
  it('zeroes output when locked and respecting the lock', () => {
    expect(resolveJoystickOutput(raw, { locked: true, respect: true })).toEqual({ x: 0, z: 0, running: false })
  })
  it('ignores the lock when respect is false', () => {
    expect(resolveJoystickOutput(raw, { locked: true, respect: false })).toEqual(raw)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @overworld-engine/input test -- keyboardLayerLock`
Expected: FAIL — `parseLayerOpts` / `resolveJoystickOutput` not exported.

- [ ] **Step 4: Add `parseLayerOpts` + update `useKeyboardLayer`**

In `packages/input/src/hooks.ts`, add the exported pure helper and use it in the hook:

```ts
import { inputLock } from '@overworld-engine/core'

/** Normalize the overloaded `useKeyboardLayer` options into a flat shape. */
export function parseLayerOpts(
  opts?: string[] | { blockedKeys?: string[]; lockInput?: boolean }
): { blockedKeys?: string[]; lockInput: boolean } {
  if (Array.isArray(opts)) return { blockedKeys: opts, lockInput: false }
  return { blockedKeys: opts?.blockedKeys, lockInput: Boolean(opts?.lockInput) }
}

export function useKeyboardLayer(
  id: string,
  priority: number,
  opts?: string[] | { blockedKeys?: string[]; lockInput?: boolean }
): void {
  const { blockedKeys, lockInput } = parseLayerOpts(opts)

  const registerLayer = useKeyboardStore((s) => s.registerLayer)
  const unregisterLayer = useKeyboardStore((s) => s.unregisterLayer)

  useEffect(() => {
    registerLayer({ id, priority, blockedKeys })
    if (lockInput) inputLock.acquire(id)
    return () => {
      unregisterLayer(id)
      if (lockInput) inputLock.release(id)
    }
    // blockedKeys compared by identity; callers pass a stable array or literal.
  }, [id, priority, blockedKeys, lockInput, registerLayer, unregisterLayer])
}
```

> Preserve existing imports (`useEffect`, `useKeyboardStore`) at the top — only add the `inputLock` import, the `parseLayerOpts` helper, and swap the function body.

- [ ] **Step 5: Add joystick lock gate (pure helper + wiring)**

In `packages/input/src/joystickMath.ts`, add the exported pure helper:

```ts
/** Zero the joystick output while the shared input lock is held (unless opted out). */
export function resolveJoystickOutput(
  raw: { x: number; z: number; running: boolean },
  opts: { locked: boolean; respect: boolean }
): { x: number; z: number; running: boolean } {
  if (opts.respect && opts.locked) return { x: 0, z: 0, running: false }
  return raw
}
```

In `packages/input/src/VirtualJoystick.tsx`, add `respectInputLock?: boolean` (default `true`) to `VirtualJoystickProps`, import `inputLock` from `@overworld-engine/core` and `resolveJoystickOutput` from `./joystickMath`, and in the pointer-move handler, gate the value written to `target.current`:

```ts
// where the handler currently writes target.current = { x, z, running }:
const gated = resolveJoystickOutput(
  { x, z, running },
  { locked: inputLock.isLocked(), respect: respectInputLock }
)
target.current.x = gated.x
target.current.z = gated.z
target.current.running = gated.running
// when gated to zero, also recenter the visible thumb offset
```

- [ ] **Step 6: Run tests + typecheck**

Run: `pnpm --filter @overworld-engine/input test && pnpm --filter @overworld-engine/input typecheck`
Expected: PASS (new + existing tests).

- [ ] **Step 7: Commit**

```bash
git add packages/input/src/hooks.ts packages/input/src/joystickMath.ts packages/input/src/VirtualJoystick.tsx packages/input/src/__tests__/keyboardLayerLock.test.ts
git commit -m "feat(input): useKeyboardLayer lockInput option + joystick respects inputLock"
```

---

## Phase 3 — `environment`: WorldEnvironment presets

### Task 3: Pure preset resolution logic

**Files:**
- Create: `packages/environment/src/worldEnvironment.ts`
- Create: `packages/environment/src/__tests__/worldEnvironment.test.ts`

**Interfaces:**
- Consumes: `getDaylightFactor` from `./phase`, `Vec3` from core, `DayNightValue` from `./DayNightLighting`.
- Produces: `WorldEnvironmentPreset`, `WORLD_ENV_PRESETS`, `resolvePreset(p)`, `resolveFog(preset, daylight)`, `resolveLight(preset, daylight)`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/environment/src/__tests__/worldEnvironment.test.ts
import { describe, expect, it } from 'vitest'
import {
  WORLD_ENV_PRESETS,
  resolvePreset,
  resolveLight,
} from '../worldEnvironment'

describe('WorldEnvironment presets', () => {
  it('ships the four named presets', () => {
    expect(Object.keys(WORLD_ENV_PRESETS).sort()).toEqual([
      'clear-noon',
      'foggy-dusk',
      'night',
      'overcast',
    ])
  })

  it('resolvePreset accepts a name', () => {
    expect(resolvePreset('night')).toBe(WORLD_ENV_PRESETS.night)
  })

  it('resolvePreset accepts a custom object unchanged', () => {
    const custom = { fog: { color: '#000', near: 1, far: 2 } }
    expect(resolvePreset(custom)).toBe(custom)
  })

  it('resolveLight lerps ambient intensity between night and day by daylight factor', () => {
    const preset = {
      lighting: {
        ambient: { day: { color: '#fff', intensity: 1 }, night: { color: '#001', intensity: 0.1 } },
      },
    }
    const atDay = resolveLight(preset, 1)
    const atNight = resolveLight(preset, 0)
    expect(atDay.ambient.intensity).toBeCloseTo(1)
    expect(atNight.ambient.intensity).toBeCloseTo(0.1)
    expect(resolveLight(preset, 0.5).ambient.intensity).toBeCloseTo(0.55)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @overworld-engine/environment test -- worldEnvironment`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// packages/environment/src/worldEnvironment.ts
import type { Vec3 } from '@overworld-engine/core'
import type { DayNightValue } from './DayNightLighting'

export interface WorldEnvironmentPreset {
  sky?:
    | { top: string; bottom: string; sunColor?: string; sunPosition?: Vec3 }
    | { hdri: string }
  fog?: { color: string; near: number; far: number } | { color: string; density: number }
  ground?: { color: string; roughness?: number; metalness?: number; size?: number } | false
  lighting?: {
    ambient?: DayNightValue<{ color: string; intensity: number }>
    sun?: DayNightValue<{ color: string; intensity: number }> & {
      position?: Vec3
      castShadow?: boolean
    }
  }
  envMapIntensity?: number
  stars?: boolean | { count: number }
}

export const WORLD_ENV_PRESETS = {
  'clear-noon': {
    sky: { top: '#4a90d9', bottom: '#cfe8ff', sunColor: '#fff7e0', sunPosition: [40, 60, 20] },
    fog: { color: '#cfe8ff', near: 60, far: 240 },
    ground: { color: '#5a6b7a', roughness: 1, size: 400 },
    lighting: {
      ambient: { day: { color: '#bcd4ff', intensity: 0.6 }, night: { color: '#20304a', intensity: 0.15 } },
      sun: { day: { color: '#fff7e0', intensity: 1.4 }, night: { color: '#4a5a80', intensity: 0.2 }, position: [40, 60, 20], castShadow: true },
    },
    stars: false,
  },
  overcast: {
    sky: { top: '#9aa7b3', bottom: '#c7cfd6' },
    fog: { color: '#c7cfd6', near: 40, far: 180 },
    ground: { color: '#565f66', roughness: 1, size: 400 },
    lighting: {
      ambient: { day: { color: '#c7cfd6', intensity: 0.7 }, night: { color: '#2a2f36', intensity: 0.2 } },
      sun: { day: { color: '#dfe6ec', intensity: 0.7 }, night: { color: '#3a4048', intensity: 0.15 }, castShadow: false },
    },
    stars: false,
  },
  'foggy-dusk': {
    sky: { top: '#3a2f4a', bottom: '#e0806a', sunColor: '#ff9060', sunPosition: [-30, 10, -40] },
    fog: { color: '#c98a72', near: 20, far: 120 },
    ground: { color: '#4a3f4a', roughness: 1, size: 400 },
    lighting: {
      ambient: { day: { color: '#e0a080', intensity: 0.5 }, night: { color: '#2a2038', intensity: 0.2 } },
      sun: { day: { color: '#ff9060', intensity: 0.9 }, night: { color: '#403050', intensity: 0.25 }, position: [-30, 10, -40], castShadow: true },
    },
    stars: { count: 400 },
  },
  night: {
    sky: { top: '#070b18', bottom: '#12203a' },
    fog: { color: '#0a1224', near: 30, far: 160 },
    ground: { color: '#1a2230', roughness: 1, size: 400 },
    lighting: {
      ambient: { day: { color: '#3a4a6a', intensity: 0.3 }, night: { color: '#101828', intensity: 0.25 } },
      sun: { day: { color: '#6a7aa0', intensity: 0.4 }, night: { color: '#3a4a70', intensity: 0.3 }, position: [10, 40, -10], castShadow: true },
    },
    stars: { count: 1200 },
  },
} satisfies Record<string, WorldEnvironmentPreset>

export type WorldEnvironmentPresetName = keyof typeof WORLD_ENV_PRESETS

export function resolvePreset(
  p: WorldEnvironmentPresetName | WorldEnvironmentPreset
): WorldEnvironmentPreset {
  return typeof p === 'string' ? WORLD_ENV_PRESETS[p] : p
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

/** Resolve ambient/sun light values for the given daylight factor (0=night, 1=day). */
export function resolveLight(preset: WorldEnvironmentPreset, daylight: number) {
  const amb = preset.lighting?.ambient
  const sun = preset.lighting?.sun
  return {
    ambient: amb
      ? { color: daylight >= 0.5 ? amb.day.color : amb.night.color, intensity: lerp(amb.night.intensity, amb.day.intensity, daylight) }
      : { color: '#ffffff', intensity: 0.5 },
    sun: sun
      ? {
          color: daylight >= 0.5 ? sun.day.color : sun.night.color,
          intensity: lerp(sun.night.intensity, sun.day.intensity, daylight),
          position: sun.position ?? ([10, 40, 10] as Vec3),
          castShadow: sun.castShadow ?? true,
        }
      : { color: '#ffffff', intensity: 1, position: [10, 40, 10] as Vec3, castShadow: true },
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @overworld-engine/environment test -- worldEnvironment`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/environment/src/worldEnvironment.ts packages/environment/src/__tests__/worldEnvironment.test.ts
git commit -m "feat(environment): WorldEnvironment preset resolution logic"
```

### Task 4: `WorldEnvironment` R3F component + export

**Files:**
- Create: `packages/environment/src/WorldEnvironment.tsx`
- Modify: `packages/environment/src/index.ts` (exports)

**Interfaces:**
- Consumes: `resolvePreset`, `resolveLight`, `WORLD_ENV_PRESETS`, `WorldEnvironmentPreset` from `./worldEnvironment`; `getDaylightFactor` from `./phase`; optional `Environment` from `./createEnvironment`.
- Produces: `WorldEnvironment(props: WorldEnvironmentProps)`, `WorldEnvironmentProps`.

- [ ] **Step 1: Write the component**

```tsx
// packages/environment/src/WorldEnvironment.tsx
import { useMemo } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { useRef } from 'react'
import type { Environment } from './createEnvironment'
import { getDaylightFactor } from './phase'
import {
  resolvePreset,
  resolveLight,
  type WorldEnvironmentPreset,
  type WorldEnvironmentPresetName,
} from './worldEnvironment'

export interface WorldEnvironmentProps {
  preset?: WorldEnvironmentPresetName | WorldEnvironmentPreset
  /** Optional day/night engine: light/fog follow its time-of-day when present. */
  engine?: Environment
  /** Quality hint (structural; game passes useQualityStore.getState().settings). */
  quality?: { shadows: boolean; shadowMapSize: number; particleMultiplier: number }
  children?: React.ReactNode
}

function Stars({ count, multiplier }: { count: number; multiplier: number }) {
  const geom = useMemo(() => {
    const n = Math.max(0, Math.floor(count * multiplier))
    const positions = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      // deterministic-ish scatter on a dome; index-based to avoid Math.random in tests
      const a = (i * 2.399963) % (Math.PI * 2)
      const r = 200 + ((i * 53) % 60)
      positions[i * 3] = Math.cos(a) * r
      positions[i * 3 + 1] = 40 + ((i * 17) % 120)
      positions[i * 3 + 2] = Math.sin(a) * r
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    return g
  }, [count, multiplier])
  return (
    <points geometry={geom}>
      <pointsMaterial color="#ffffff" size={0.8} sizeAttenuation />
    </points>
  )
}

/**
 * Quality-aware environment layer: sky, fog, ground, lighting, stars from a
 * named or custom preset. Custom R3F children still render on top. When an
 * `engine` is supplied, light/fog interpolate with its time of day.
 */
export function WorldEnvironment({ preset = 'clear-noon', engine, quality, children }: WorldEnvironmentProps) {
  const resolved = resolvePreset(preset)
  const scene = useThree((s) => s.scene)
  const ambientRef = useRef<THREE.AmbientLight>(null)
  const sunRef = useRef<THREE.DirectionalLight>(null)
  const fogRef = useRef<THREE.Fog | THREE.FogExp2 | null>(null)

  // Static fog install (updated per-frame when engine present)
  const fog = useMemo(() => {
    if (!resolved.fog) return null
    const f =
      'density' in resolved.fog
        ? new THREE.FogExp2(resolved.fog.color, resolved.fog.density)
        : new THREE.Fog(resolved.fog.color, resolved.fog.near, resolved.fog.far)
    return f
  }, [resolved.fog])

  fogRef.current = fog
  scene.fog = fog

  const daylight0 = engine ? getDaylightFactor(engine.store.getState().timeOfDay) : 1
  const light0 = resolveLight(resolved, daylight0)

  useFrame(() => {
    if (!engine) return
    const d = getDaylightFactor(engine.store.getState().timeOfDay)
    const l = resolveLight(resolved, d)
    if (ambientRef.current) ambientRef.current.intensity = l.ambient.intensity
    if (sunRef.current) sunRef.current.intensity = l.sun.intensity
  })

  const shadows = quality?.shadows ?? true
  const shadowMapSize = quality?.shadowMapSize ?? 2048
  const multiplier = quality?.particleMultiplier ?? 1
  const starCount = resolved.stars === true ? 800 : resolved.stars ? resolved.stars.count : 0

  return (
    <>
      <ambientLight ref={ambientRef} color={light0.ambient.color} intensity={light0.ambient.intensity} />
      <directionalLight
        ref={sunRef}
        color={light0.sun.color}
        intensity={light0.sun.intensity}
        position={light0.sun.position}
        castShadow={shadows && light0.sun.castShadow}
        shadow-mapSize={[shadowMapSize, shadowMapSize]}
      />
      {resolved.ground !== false && resolved.ground && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
          <planeGeometry args={[resolved.ground.size ?? 400, resolved.ground.size ?? 400]} />
          <meshStandardMaterial
            color={resolved.ground.color}
            roughness={resolved.ground.roughness ?? 1}
            metalness={resolved.ground.metalness ?? 0}
          />
        </mesh>
      )}
      {resolved.sky && 'top' in resolved.sky && (
        <mesh scale={[-1, 1, 1]}>
          <sphereGeometry args={[500, 16, 16]} />
          <meshBasicMaterial side={THREE.BackSide} color={resolved.sky.bottom} />
        </mesh>
      )}
      {starCount > 0 && <Stars count={starCount} multiplier={multiplier} />}
      {children}
    </>
  )
}
```

> Note: HDRI sky (`{ hdri }`) uses drei `<Environment files={...} />`; add that branch only if the game needs it — the gradient sky above covers the preset set. Keep the component focused; do not add the HDRI branch speculatively (YAGNI).

- [ ] **Step 2: Add exports**

In `packages/environment/src/index.ts`:

```ts
export { WorldEnvironment } from './WorldEnvironment'
export type { WorldEnvironmentProps } from './WorldEnvironment'
export {
  WORLD_ENV_PRESETS,
  resolvePreset,
  resolveLight,
} from './worldEnvironment'
export type { WorldEnvironmentPreset, WorldEnvironmentPresetName } from './worldEnvironment'
```

- [ ] **Step 3: Typecheck + build**

Run: `pnpm --filter @overworld-engine/environment typecheck && pnpm --filter @overworld-engine/environment build`
Expected: clean (component is GL-bound; no jsdom render test — pure logic is covered by Task 3).

- [ ] **Step 4: Commit**

```bash
git add packages/environment/src/WorldEnvironment.tsx packages/environment/src/index.ts
git commit -m "feat(environment): WorldEnvironment R3F component with quality-aware presets"
```

---

## Phase 4 — `loading`: scene load state + zone streaming

### Task 5: `sceneLoadStore` + phase aggregation logic

**Files:**
- Create: `packages/loading/src/sceneLoadStore.ts`
- Create: `packages/loading/src/__tests__/sceneLoadStore.test.ts`

**Interfaces:**
- Produces: `SCENE_PHASES`, `ScenePhase`, `SceneLoadState`, `useSceneLoadStore`, `aggregateSceneProgress(phases)`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/loading/src/__tests__/sceneLoadStore.test.ts
import { beforeEach, describe, expect, it } from 'vitest'
import { useSceneLoadStore, aggregateSceneProgress } from '../sceneLoadStore'

describe('sceneLoadStore', () => {
  beforeEach(() => useSceneLoadStore.getState().reset())

  it('starts idle at 0', () => {
    const s = useSceneLoadStore.getState()
    expect(s.phase).toBe('idle')
    expect(s.progress).toBe(0)
  })

  it('advances phase to the earliest incomplete phase', () => {
    const st = useSceneLoadStore.getState()
    st.completePhase('module')
    expect(useSceneLoadStore.getState().phase).toBe('geometry')
    st.completePhase('geometry')
    st.completePhase('texture')
    st.completePhase('first-frame')
    expect(useSceneLoadStore.getState().phase).toBe('ready')
  })

  it('aggregate progress weights the four loading phases equally, ready gates on all done', () => {
    expect(aggregateSceneProgress({
      idle: { progress: 1, done: true },
      module: { progress: 1, done: true },
      geometry: { progress: 0.5, done: false },
      texture: { progress: 0, done: false },
      'first-frame': { progress: 0, done: false },
      ready: { progress: 0, done: false },
    })).toBeCloseTo((1 + 0.5 + 0 + 0) / 4)
  })

  it('failZone records an error and retryZone clears it', () => {
    const st = useSceneLoadStore.getState()
    st.failZone('north', 'timeout')
    expect(useSceneLoadStore.getState().errors).toEqual([{ zone: 'north', message: 'timeout' }])
    st.retryZone('north')
    expect(useSceneLoadStore.getState().errors).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @overworld-engine/loading test -- sceneLoadStore`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// packages/loading/src/sceneLoadStore.ts
import { create } from 'zustand'

export type ScenePhase = 'idle' | 'module' | 'geometry' | 'texture' | 'first-frame' | 'ready'
export const SCENE_PHASES: ScenePhase[] = ['idle', 'module', 'geometry', 'texture', 'first-frame', 'ready']
/** The four phases that carry real load work and feed aggregate progress. */
const LOADING_PHASES: ScenePhase[] = ['module', 'geometry', 'texture', 'first-frame']

export interface PhaseState { progress: number; done: boolean }
export interface SceneLoadError { zone?: string; message: string }

export interface SceneLoadState {
  phase: ScenePhase
  progress: number
  phases: Record<ScenePhase, PhaseState>
  errors: SceneLoadError[]
  setPhaseProgress: (phase: ScenePhase, p: number) => void
  completePhase: (phase: ScenePhase) => void
  failZone: (zone: string, message: string) => void
  retryZone: (zone: string) => void
  reset: () => void
}

/** Average progress of the four loading phases (idle/ready excluded). */
export function aggregateSceneProgress(phases: Record<ScenePhase, PhaseState>): number {
  const sum = LOADING_PHASES.reduce((acc, p) => acc + (phases[p]?.progress ?? 0), 0)
  return sum / LOADING_PHASES.length
}

function earliestIncomplete(phases: Record<ScenePhase, PhaseState>): ScenePhase {
  const allLoadingDone = LOADING_PHASES.every((p) => phases[p].done)
  if (allLoadingDone) return 'ready'
  return LOADING_PHASES.find((p) => !phases[p].done) ?? 'ready'
}

function freshPhases(): Record<ScenePhase, PhaseState> {
  return SCENE_PHASES.reduce((acc, p) => {
    acc[p] = { progress: p === 'idle' ? 1 : 0, done: p === 'idle' }
    return acc
  }, {} as Record<ScenePhase, PhaseState>)
}

function recompute(phases: Record<ScenePhase, PhaseState>) {
  return { phase: earliestIncomplete(phases), progress: aggregateSceneProgress(phases), phases }
}

export const useSceneLoadStore = create<SceneLoadState>((set) => ({
  phase: 'idle',
  progress: 0,
  phases: freshPhases(),
  errors: [],
  setPhaseProgress: (phase, p) =>
    set((s) => {
      const next = { ...s.phases, [phase]: { progress: Math.max(0, Math.min(1, p)), done: p >= 1 } }
      return recompute(next)
    }),
  completePhase: (phase) =>
    set((s) => recompute({ ...s.phases, [phase]: { progress: 1, done: true } })),
  failZone: (zone, message) => set((s) => ({ errors: [...s.errors, { zone, message }] })),
  retryZone: (zone) => set((s) => ({ errors: s.errors.filter((e) => e.zone !== zone) })),
  reset: () => set({ phase: 'idle', progress: 0, phases: freshPhases(), errors: [] }),
}))
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @overworld-engine/loading test -- sceneLoadStore`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/loading/src/sceneLoadStore.ts packages/loading/src/__tests__/sceneLoadStore.test.ts
git commit -m "feat(loading): scene load-state store with phase aggregation"
```

### Task 6: Zone streaming ordering + dev handle + FirstFramePhase

**Files:**
- Create: `packages/loading/src/zoneStreaming.ts` (pure ordering)
- Create: `packages/loading/src/sceneLoad.tsx` (React: `useZoneStreaming`, `FirstFramePhase`, dev handle)
- Create: `packages/loading/src/__tests__/zoneStreaming.test.ts`
- Modify: `packages/loading/src/index.ts`

**Interfaces:**
- Consumes: `useSceneLoadStore`, `ScenePhase` (Task 5); `AssetManifest`, `preloadManifest` from `./manifest`; `Vec3` from core.
- Produces: `ZoneBounds`, `ZoneManifest`, `orderZonesByDistance(zones, pos)`, `useZoneStreaming(zones, playerPosRef)`, `FirstFramePhase`, `installSceneLoadDebugHandle()`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/loading/src/__tests__/zoneStreaming.test.ts
import { describe, expect, it } from 'vitest'
import { orderZonesByDistance, type ZoneManifest } from '../zoneStreaming'

const zone = (id: string, priority: number, cx: number, cz: number): ZoneManifest => ({
  id,
  priority,
  manifest: {},
  bounds: { minX: cx - 5, maxX: cx + 5, minZ: cz - 5, maxZ: cz + 5 },
})

describe('orderZonesByDistance', () => {
  it('orders by distance to player, nearest first', () => {
    const zones = [zone('far', 1, 100, 0), zone('near', 1, 5, 0)]
    expect(orderZonesByDistance(zones, [0, 0, 0]).map((z) => z.id)).toEqual(['near', 'far'])
  })

  it('breaks ties by higher priority first', () => {
    const zones = [zone('lo', 1, 10, 0), zone('hi', 5, 10, 0)]
    expect(orderZonesByDistance(zones, [0, 0, 0]).map((z) => z.id)).toEqual(['hi', 'lo'])
  })

  it('zones without bounds sort last', () => {
    const noBounds: ZoneManifest = { id: 'nb', priority: 9, manifest: {} }
    const zones = [noBounds, zone('near', 1, 5, 0)]
    expect(orderZonesByDistance(zones, [0, 0, 0]).map((z) => z.id)).toEqual(['near', 'nb'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @overworld-engine/loading test -- zoneStreaming`
Expected: FAIL — module not found.

- [ ] **Step 3: Write pure ordering logic**

```ts
// packages/loading/src/zoneStreaming.ts
import type { Vec3 } from '@overworld-engine/core'
import type { AssetManifest } from './manifest'

/** Structural world rectangle (same shape as minimap's WorldBounds; no cross-import). */
export interface ZoneBounds { minX: number; maxX: number; minZ: number; maxZ: number }
export interface ZoneManifest {
  id: string
  priority: number
  manifest: AssetManifest
  bounds?: ZoneBounds
}

function distanceToBounds(pos: Vec3, b: ZoneBounds): number {
  const cx = (b.minX + b.maxX) / 2
  const cz = (b.minZ + b.maxZ) / 2
  const dx = pos[0] - cx
  const dz = pos[2] - cz
  return Math.sqrt(dx * dx + dz * dz)
}

/** Nearest-first ordering; unbounded zones last; ties broken by higher priority. */
export function orderZonesByDistance(zones: ZoneManifest[], pos: Vec3): ZoneManifest[] {
  return [...zones].sort((a, b) => {
    const da = a.bounds ? distanceToBounds(pos, a.bounds) : Infinity
    const db = b.bounds ? distanceToBounds(pos, b.bounds) : Infinity
    if (da !== db) return da - db
    return b.priority - a.priority
  })
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @overworld-engine/loading test -- zoneStreaming`
Expected: PASS (3 tests).

- [ ] **Step 5: Write React bindings + dev handle**

```tsx
// packages/loading/src/sceneLoad.tsx
import { useEffect, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Vec3 } from '@overworld-engine/core'
import { preloadManifest } from './manifest'
import { useSceneLoadStore } from './sceneLoadStore'
import { orderZonesByDistance, type ZoneManifest } from './zoneStreaming'

export interface ZoneStreamingResult { pending: string[]; loaded: string[]; failed: string[] }

/**
 * Nearby-first zone streaming: preloads each zone's manifest in
 * distance order from the player. Fire-and-forget; failures surface via
 * useSceneLoadStore().failZone. Re-orders whenever the zone set changes.
 */
export function useZoneStreaming(
  zones: ZoneManifest[],
  playerPosRef: { current: Vec3 }
): ZoneStreamingResult {
  const [loaded, setLoaded] = useState<string[]>([])
  const startedRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    const ordered = orderZonesByDistance(zones, playerPosRef.current)
    ordered.forEach((z) => {
      if (startedRef.current.has(z.id)) return
      startedRef.current.add(z.id)
      try {
        preloadManifest(z.manifest)
        setLoaded((l) => [...l, z.id])
      } catch (err) {
        useSceneLoadStore.getState().failZone(z.id, String((err as Error)?.message ?? err))
      }
    })
    // playerPosRef read once per zone-set change; streaming is coarse-grained.
  }, [zones, playerPosRef])

  const pending = zones.map((z) => z.id).filter((id) => !loaded.includes(id))
  const failed = useSceneLoadStore((s) => s.errors).map((e) => e.zone).filter(Boolean) as string[]
  return { pending, loaded, failed }
}

/**
 * Marks the `first-frame` phase done on the first rendered frame after the
 * geometry phase completed. Mount inside the Canvas below your scene content.
 */
export function FirstFramePhase() {
  const doneRef = useRef(false)
  useFrame(() => {
    if (doneRef.current) return
    const s = useSceneLoadStore.getState()
    if (s.phases.geometry.done && !s.phases['first-frame'].done) {
      doneRef.current = true
      s.completePhase('first-frame')
    }
  })
  return null
}

/**
 * Dev-only: mirror the scene-load store onto window.__overworldSceneLoad so
 * end-to-end tests (Playwright) can await `phase === 'ready'` without sampling
 * canvas pixels. No-op in production builds and non-browser environments.
 */
export function installSceneLoadDebugHandle(): () => void {
  if (typeof window === 'undefined') return () => {}
  if (!import.meta.env?.DEV) return () => {}
  const w = window as unknown as { __overworldSceneLoad?: unknown }
  const sync = () => {
    w.__overworldSceneLoad = useSceneLoadStore.getState()
  }
  sync()
  return useSceneLoadStore.subscribe(sync)
}
```

- [ ] **Step 6: Add exports**

In `packages/loading/src/index.ts`:

```ts
export {
  useSceneLoadStore,
  aggregateSceneProgress,
  SCENE_PHASES,
} from './sceneLoadStore'
export type { ScenePhase, SceneLoadState, PhaseState, SceneLoadError } from './sceneLoadStore'
export { orderZonesByDistance } from './zoneStreaming'
export type { ZoneManifest, ZoneBounds } from './zoneStreaming'
export { useZoneStreaming, FirstFramePhase, installSceneLoadDebugHandle } from './sceneLoad'
export type { ZoneStreamingResult } from './sceneLoad'
```

- [ ] **Step 7: Typecheck + full test**

Run: `pnpm --filter @overworld-engine/loading typecheck && pnpm --filter @overworld-engine/loading test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/loading/src/zoneStreaming.ts packages/loading/src/sceneLoad.tsx packages/loading/src/__tests__/zoneStreaming.test.ts packages/loading/src/index.ts
git commit -m "feat(loading): zone streaming, FirstFramePhase, and dev load-state handle"
```

---

## Phase 5 — `audio`: ambient zones + buses

### Task 7: Bus mix + zone weight logic + silent backend

**Files:**
- Create: `packages/audio/src/ambientZones.ts`
- Modify: `packages/audio/src/backend.ts` (add `silentBackend`)
- Create: `packages/audio/src/__tests__/ambientZones.test.ts`

**Interfaces:**
- Consumes: `Vec3` from core; `AudioBackend`, `AudioHandle` from `./backend`.
- Produces: `BusName`, `AmbientZone`, `zoneWeight(zone, listener)`, `mixBuses(buses, bus, master)`, `silentBackend`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/audio/src/__tests__/ambientZones.test.ts
import { describe, expect, it } from 'vitest'
import { zoneWeight, mixBuses } from '../ambientZones'

const zone = { id: 'z', trackId: 't', center: [0, 0, 0] as [number, number, number], innerRadius: 5, outerRadius: 15 }

describe('ambient zone falloff', () => {
  it('is full volume inside inner radius', () => {
    expect(zoneWeight(zone, [3, 0, 0])).toBe(1)
  })
  it('is silent beyond outer radius', () => {
    expect(zoneWeight(zone, [30, 0, 0])).toBe(0)
  })
  it('falls off linearly between inner and outer', () => {
    expect(zoneWeight(zone, [10, 0, 0])).toBeCloseTo(0.5) // halfway across the 5..15 band
  })
  it('respects maxVolume', () => {
    expect(zoneWeight({ ...zone, maxVolume: 0.4 }, [0, 0, 0])).toBeCloseTo(0.4)
  })
})

describe('mixBuses', () => {
  it('multiplies bus by master', () => {
    expect(mixBuses({ master: 0.5, music: 0.8, ambience: 1, sfx: 1 }, 'music', 1)).toBeCloseTo(0.4)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @overworld-engine/audio test -- ambientZones`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the pure logic**

```ts
// packages/audio/src/ambientZones.ts
import type { Vec3 } from '@overworld-engine/core'

export type BusName = 'master' | 'music' | 'ambience' | 'sfx'

export interface AmbientZone {
  id: string
  trackId: string
  center: Vec3
  innerRadius: number
  outerRadius: number
  maxVolume?: number
}

/** Distance falloff weight in [0, maxVolume]: full inside inner, 0 beyond outer, linear between. */
export function zoneWeight(zone: AmbientZone, listener: Vec3): number {
  const dx = listener[0] - zone.center[0]
  const dz = listener[2] - zone.center[2]
  const d = Math.sqrt(dx * dx + dz * dz)
  const max = zone.maxVolume ?? 1
  if (d <= zone.innerRadius) return max
  if (d >= zone.outerRadius) return 0
  const t = (d - zone.innerRadius) / (zone.outerRadius - zone.innerRadius)
  return max * (1 - t)
}

/** Effective gain for a track on a bus: busVolume * masterVolume. */
export function mixBuses(
  buses: Record<BusName, number>,
  bus: Exclude<BusName, 'master'>,
  masterOverride?: number
): number {
  const master = masterOverride ?? buses.master
  return buses[bus] * master
}
```

- [ ] **Step 4: Add the silent backend**

In `packages/audio/src/backend.ts`, append (keep existing `htmlAudioBackend`):

```ts
/** No-op backend for headless/muted tests: state is queryable, nothing plays. */
export const silentBackend: AudioBackend = {
  isAvailable: () => true,
  create(_url: string): AudioHandle {
    let volume = 1
    let paused = true
    let loop = false
    return {
      play() { paused = false },
      pause() { paused = true },
      setVolume(v: number) { volume = v },
      getVolume() { return volume },
      setLoop(l: boolean) { loop = l },
      isPaused() { return paused },
      onEnded() { /* never fires */ },
      destroy() { /* no-op */ },
    }
  },
}
```

> Match the exact `AudioHandle` member names in the existing `backend.ts` — read it first (`sed -n '1,60p' packages/audio/src/backend.ts`) and mirror them (the plan uses the members reported by the API map: `play/pause/setVolume/getVolume/setLoop/isPaused/onEnded/destroy`).

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @overworld-engine/audio test -- ambientZones`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/audio/src/ambientZones.ts packages/audio/src/backend.ts packages/audio/src/__tests__/ambientZones.test.ts
git commit -m "feat(audio): ambient-zone falloff, bus mix logic, and silent backend"
```

### Task 8: Wire zones + buses into `createAudioManager`

**Files:**
- Modify: `packages/audio/src/audioManager.ts`
- Modify: `packages/audio/src/index.ts`
- Create: `packages/audio/src/__tests__/audioZones.integration.test.ts`

**Interfaces:**
- Consumes: `zoneWeight`, `mixBuses`, `BusName`, `AmbientZone`, `silentBackend` (Task 7).
- Produces: `AudioManager.setBusVolume/getBusVolume/setAmbientZones/updateListener/playCue`; `AudioManagerConfig.buses`.

- [ ] **Step 1: Write the failing integration test**

```ts
// packages/audio/src/__tests__/audioZones.integration.test.ts
import { describe, expect, it } from 'vitest'
import { createAudioManager } from '../audioManager'
import { silentBackend } from '../backend'

describe('audio zones + buses (silent backend)', () => {
  it('crossfades ambient zone volume by listener distance', () => {
    const mgr = createAudioManager({
      tracks: { forest: 'forest.mp3' },
      backend: silentBackend,
      autoSubscribeSceneChanges: false,
    })
    mgr.setAmbientZones([
      { id: 'forest', trackId: 'forest', center: [0, 0, 0], innerRadius: 5, outerRadius: 15 },
    ])
    mgr.updateListener([0, 0, 0])
    expect(mgr.getState().ambientWeights?.forest).toBeCloseTo(1)
    mgr.updateListener([10, 0, 0])
    expect(mgr.getState().ambientWeights?.forest).toBeCloseTo(0.5)
    mgr.dispose()
  })

  it('bus volume cascades through master', () => {
    const mgr = createAudioManager({
      tracks: {},
      backend: silentBackend,
      buses: { master: 0.5, music: 0.8, ambience: 1, sfx: 1 },
      autoSubscribeSceneChanges: false,
    })
    expect(mgr.getBusVolume('music')).toBe(0.8)
    mgr.setBusVolume('master', 0.25)
    expect(mgr.getBusVolume('master')).toBe(0.25)
    mgr.dispose()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @overworld-engine/audio test -- audioZones`
Expected: FAIL — methods/state fields missing.

- [ ] **Step 3: Read the manager, then extend it**

Run `sed -n '1,200p' packages/audio/src/audioManager.ts` to see the store shape and `createAudioManager` return. Then:
1. Add `buses?: Partial<Record<BusName, number>>` to `AudioManagerConfig`; default to `{ master: 1, music: config.volume ?? 0.7, ambience: 1, sfx: config.sfxVolume ?? 0.7 }`.
2. Add to the zustand state: `buses: Record<BusName, number>` and `ambientWeights: Record<string, number>`.
3. Add methods to the returned `AudioManager`:

```ts
setBusVolume(bus, v) {
  store.setState((s) => ({ buses: { ...s.buses, [bus]: Math.max(0, Math.min(1, v)) } }))
},
getBusVolume(bus) {
  return store.getState().buses[bus]
},
setAmbientZones(zones) {
  ambientZonesRef = zones           // module-closure ref
  // create/lazy-init a backend handle per zone.trackId on first play
},
updateListener(pos) {
  const weights: Record<string, number> = {}
  for (const z of ambientZonesRef) {
    const w = zoneWeight(z, pos)
    weights[z.id] = w
    const gain = w * mixBuses(store.getState().buses, 'ambience')
    zoneHandles.get(z.id)?.setVolume(store.getState().muted ? 0 : gain)
    if (w > 0) zoneHandles.get(z.id)?.play()
    else zoneHandles.get(z.id)?.pause()
  }
  store.setState({ ambientWeights: weights })
},
playCue(sfxId, opts) {
  const listener = opts?.listener
  const at = opts?.at
  let atten = 1
  if (listener && at) {
    const d = Math.hypot(listener[0] - at[0], listener[2] - at[2])
    atten = Math.max(0, 1 - d / 30)   // simple 30-unit falloff
  }
  const handle = backend.create(config.tracks[sfxId] ?? sfxId)
  handle.setVolume(store.getState().muted ? 0 : atten * mixBuses(store.getState().buses, 'sfx'))
  handle.play()
  handle.onEnded(() => handle.destroy())
},
```

> Adapt the exact field access (`store.setState`, `store.getState`) to the manager's real store handle. Import `zoneWeight`, `mixBuses`, `type BusName`, `type AmbientZone` from `./ambientZones`. Keep a module-closure `let ambientZonesRef: AmbientZone[] = []` and `const zoneHandles = new Map<string, AudioHandle>()`; dispose them in the manager's `dispose()`.

- [ ] **Step 4: Add exports**

In `packages/audio/src/index.ts`:

```ts
export { silentBackend } from './backend'
export { zoneWeight, mixBuses } from './ambientZones'
export type { BusName, AmbientZone } from './ambientZones'
```

- [ ] **Step 5: Run tests + typecheck**

Run: `pnpm --filter @overworld-engine/audio test && pnpm --filter @overworld-engine/audio typecheck`
Expected: PASS (existing + new).

- [ ] **Step 6: Commit**

```bash
git add packages/audio/src/audioManager.ts packages/audio/src/index.ts packages/audio/src/__tests__/audioZones.integration.test.ts
git commit -m "feat(audio): ambient zones, named buses, and distance-attenuated cues"
```

---

## Phase 6 — `minimap`: radar primitives

### Task 9: Headless radar selectors

**Files:**
- Create: `packages/minimap/src/radar.ts`
- Create: `packages/minimap/src/__tests__/radar.test.ts`
- Modify: `packages/minimap/src/index.ts`

**Interfaces:**
- Consumes: `Vec3`, `EntityKind` from core; `WorldBounds` from `./projection`.
- Produces: `RadarConfig`, `RadarMarker`, `selectRadarMarkers(config, pos, heading)`, `computeOffscreenIndicator(worldPos, pos, heading, range)`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/minimap/src/__tests__/radar.test.ts
import { describe, expect, it } from 'vitest'
import { selectRadarMarkers, computeOffscreenIndicator, type RadarConfig } from '../radar'

const config: RadarConfig = {
  worldBounds: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 },
  buildings: [{ id: 'hq', position: [10, 0, 0] }],
  npcs: [{ id: 'guide', position: [0, 0, 200] }],
  range: 50,
}

describe('selectRadarMarkers', () => {
  it('maps entities to radar space centred on the player', () => {
    const markers = selectRadarMarkers(config, [0, 0, 0], 0)
    const hq = markers.find((m) => m.id === 'hq')!
    expect(hq.kind).toBe('building')
    expect(hq.offScreen).toBe(false)
    expect(Math.abs(hq.x)).toBeLessThanOrEqual(1)
  })

  it('flags entities beyond range as offScreen with an angle', () => {
    const markers = selectRadarMarkers(config, [0, 0, 0], 0)
    const guide = markers.find((m) => m.id === 'guide')!
    expect(guide.offScreen).toBe(true)
    expect(typeof guide.angle).toBe('number')
  })
})

describe('computeOffscreenIndicator', () => {
  it('marks in-range targets as not on the edge', () => {
    const r = computeOffscreenIndicator([10, 0, 0], [0, 0, 0], 0, 50)
    expect(r.edge).toBe(false)
  })
  it('marks out-of-range targets on the edge', () => {
    const r = computeOffscreenIndicator([0, 0, 200], [0, 0, 0], 0, 50)
    expect(r.edge).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @overworld-engine/minimap test -- radar`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// packages/minimap/src/radar.ts
import type { Vec3, EntityKind } from '@overworld-engine/core'
import type { WorldBounds } from './projection'

export interface RadarEntity { id: string; position: Vec3; name?: string }
export interface RadarConfig {
  worldBounds: WorldBounds
  buildings?: RadarEntity[]
  npcs?: RadarEntity[]
  colors?: Partial<Record<EntityKind, string>>
  /** Radar radius in world units; entities beyond are clamped to the edge. */
  range?: number
}
export interface RadarMarker {
  id: string
  kind: EntityKind
  x: number
  y: number
  offScreen: boolean
  angle?: number
  color?: string
}

const DEFAULT_RANGE = 40

function toRadar(
  world: Vec3,
  player: Vec3,
  heading: number,
  range: number
): { x: number; y: number; offScreen: boolean; angle: number } {
  // Player-centred vector, rotated so player heading points "up" (-y).
  const dx = world[0] - player[0]
  const dz = world[2] - player[2]
  const cos = Math.cos(-heading)
  const sin = Math.sin(-heading)
  const rx = dx * cos - dz * sin
  const rz = dx * sin + dz * cos
  const dist = Math.sqrt(rx * rx + rz * rz)
  const angle = Math.atan2(rx, rz)
  const offScreen = dist > range
  const clamped = offScreen ? range : dist
  const scale = clamped / range
  return { x: Math.sin(angle) * scale, y: Math.cos(angle) * scale, offScreen, angle }
}

export function selectRadarMarkers(
  config: RadarConfig,
  playerPos: Vec3,
  playerHeading: number
): RadarMarker[] {
  const range = config.range ?? DEFAULT_RANGE
  const build = (list: RadarEntity[] | undefined, kind: EntityKind): RadarMarker[] =>
    (list ?? []).map((e) => {
      const r = toRadar(e.position, playerPos, playerHeading, range)
      return {
        id: e.id,
        kind,
        x: r.x,
        y: r.y,
        offScreen: r.offScreen,
        angle: r.offScreen ? r.angle : undefined,
        color: config.colors?.[kind],
      }
    })
  return [...build(config.buildings, 'building'), ...build(config.npcs, 'npc')]
}

export function computeOffscreenIndicator(
  markerWorld: Vec3,
  playerPos: Vec3,
  playerHeading: number,
  range: number
): { angle: number; edge: boolean } {
  const r = toRadar(markerWorld, playerPos, playerHeading, range)
  return { angle: r.angle, edge: r.offScreen }
}
```

- [ ] **Step 4: Add exports**

In `packages/minimap/src/index.ts`:

```ts
export { selectRadarMarkers, computeOffscreenIndicator } from './radar'
export type { RadarConfig, RadarMarker, RadarEntity } from './radar'
```

- [ ] **Step 5: Run tests + typecheck**

Run: `pnpm --filter @overworld-engine/minimap test -- radar && pnpm --filter @overworld-engine/minimap typecheck`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/minimap/src/radar.ts packages/minimap/src/__tests__/radar.test.ts packages/minimap/src/index.ts
git commit -m "feat(minimap): headless radar selectors with off-screen indicators"
```

---

## Phase 7 — `scene`: consume lock, decorations, LOD, moving NPCs, orbit camera

### Task 10: `scene` consumes `inputLock` by default

**Files:**
- Modify: `packages/scene/src/Player.tsx` (default `isInputBlocked`)
- Modify: `packages/scene/src/interaction.ts` (default in `useInteractKey`)
- Create: `packages/scene/src/useInputLocked.ts`
- Modify: `packages/scene/src/index.ts`
- Create: `packages/scene/src/__tests__/inputLockConsumption.test.ts`

**Interfaces:**
- Consumes: `inputLock` from `@overworld-engine/core`.
- Produces: `useInputLocked(): boolean`; behavior change — omitted `isInputBlocked` falls back to `inputLock.isLocked()`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/scene/src/__tests__/inputLockConsumption.test.ts
import { afterEach, describe, expect, it } from 'vitest'
import { inputLock } from '@overworld-engine/core'
import { resolveInputBlocked } from '../inputBlocked'

afterEach(() => inputLock.releaseAll())

describe('resolveInputBlocked', () => {
  it('uses the explicit callback when provided', () => {
    const fn = resolveInputBlocked(() => true)
    expect(fn()).toBe(true)
  })
  it('falls back to inputLock when no callback given', () => {
    const fn = resolveInputBlocked(undefined)
    expect(fn()).toBe(false)
    inputLock.acquire('dialogue')
    expect(fn()).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @overworld-engine/scene test -- inputLockConsumption`
Expected: FAIL — `../inputBlocked` not found.

- [ ] **Step 3: Write the shared resolver**

```ts
// packages/scene/src/inputBlocked.ts
import { inputLock } from '@overworld-engine/core'

/**
 * Resolve the effective input-blocked predicate: the caller's explicit
 * callback if given, otherwise the shared inputLock. This is why a single
 * `inputLock.acquire('dialogue')` blocks movement, the interact key, and the
 * orbit camera at once without per-source wiring.
 */
export function resolveInputBlocked(explicit: (() => boolean) | undefined): () => boolean {
  return explicit ?? (() => inputLock.isLocked())
}
```

- [ ] **Step 4: Use it in Player and interaction**

In `packages/scene/src/Player.tsx`, replace the `isInputBlockedRef` assignment source. Currently:
```ts
const isInputBlockedRef = useRef(isInputBlocked)
isInputBlockedRef.current = isInputBlocked
```
Change to:
```ts
import { resolveInputBlocked } from './inputBlocked'
// ...
const isInputBlockedRef = useRef(resolveInputBlocked(isInputBlocked))
isInputBlockedRef.current = resolveInputBlocked(isInputBlocked)
```

In `packages/scene/src/interaction.ts`, inside `useInteractKey`, change the guard `if (optionsRef.current.isInputBlocked?.()) return` to use the resolver:
```ts
import { resolveInputBlocked } from './inputBlocked'
// inside handleKeyDown:
if (resolveInputBlocked(optionsRef.current.isInputBlocked)()) return
```

- [ ] **Step 5: Add the React hook**

```ts
// packages/scene/src/useInputLocked.ts
import { useEffect, useState } from 'react'
import { inputLock } from '@overworld-engine/core'

/** Reactive input-lock state for HUD (e.g. dim controls while a modal is open). */
export function useInputLocked(): boolean {
  const [locked, setLocked] = useState(inputLock.isLocked())
  useEffect(() => inputLock.subscribe((l) => setLocked(l)), [])
  return locked
}
```

- [ ] **Step 6: Export**

In `packages/scene/src/index.ts`:
```ts
export { useInputLocked } from './useInputLocked'
export { resolveInputBlocked } from './inputBlocked'
```

- [ ] **Step 7: Run tests + typecheck**

Run: `pnpm --filter @overworld-engine/scene test -- inputLockConsumption && pnpm --filter @overworld-engine/scene typecheck`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/scene/src/inputBlocked.ts packages/scene/src/useInputLocked.ts packages/scene/src/Player.tsx packages/scene/src/interaction.ts packages/scene/src/index.ts packages/scene/src/__tests__/inputLockConsumption.test.ts
git commit -m "feat(scene): default input blocking to shared inputLock; add useInputLocked"
```

### Task 11: LOD selection logic

**Files:**
- Create: `packages/scene/src/lod.ts`
- Create: `packages/scene/src/__tests__/lod.test.ts`

**Interfaces:**
- Produces: `LodLevel`, `selectLodLevel(distance, levels, opts)`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/scene/src/__tests__/lod.test.ts
import { describe, expect, it } from 'vitest'
import { selectLodLevel } from '../lod'

const levels = [
  { distance: 0, modelPath: 'hi.glb' },
  { distance: 20, modelPath: 'mid.glb' },
  { distance: 50, modelPath: 'lo.glb' },
]

describe('selectLodLevel', () => {
  it('picks the nearest level below the first threshold', () => {
    expect(selectLodLevel(5, levels, { prevIndex: 0 }).index).toBe(0)
  })
  it('switches to a farther level past its threshold + hysteresis', () => {
    expect(selectLodLevel(23, levels, { prevIndex: 0, hysteresis: 2 }).index).toBe(1)
  })
  it('stays on the current level within the hysteresis band', () => {
    // was at index 1 (mid), distance dips just under 20 but within the 2-unit band
    expect(selectLodLevel(19, levels, { prevIndex: 1, hysteresis: 2 }).index).toBe(1)
  })
  it('caps to deviceCap index for low-tier devices', () => {
    expect(selectLodLevel(5, levels, { prevIndex: 0, deviceCap: 1 }).index).toBe(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @overworld-engine/scene test -- lod`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// packages/scene/src/lod.ts
export interface LodLevel {
  distance: number
  modelPath: string
}
export interface SelectLodOptions {
  prevIndex: number
  /** Hysteresis band width (world units) to prevent boundary flicker. Default 2. */
  hysteresis?: number
  /** Highest-detail level index allowed on this device (0 = highest). */
  deviceCap?: number
}

/**
 * Pick a LOD level for a distance, with hysteresis to stop flicker at
 * boundaries and an optional device cap that forbids the most detailed levels.
 * `levels` are near→far with `distance` being the threshold to switch to the
 * NEXT (farther) level.
 */
export function selectLodLevel(
  distance: number,
  levels: LodLevel[],
  opts: SelectLodOptions
): { index: number; level: LodLevel } {
  const { prevIndex, hysteresis = 2, deviceCap = 0 } = opts
  // Base pick: farthest level whose threshold we've crossed.
  let idx = 0
  for (let i = 1; i < levels.length; i++) {
    if (distance >= levels[i].distance) idx = i
  }
  // Hysteresis: only switch away from prevIndex if we're clearly past the band.
  if (idx > prevIndex) {
    // switching to a farther level requires distance >= threshold + band
    if (distance < levels[idx].distance + hysteresis) idx = prevIndex
  } else if (idx < prevIndex) {
    // switching to a nearer level requires distance < threshold - band
    if (distance >= levels[prevIndex].distance - hysteresis) idx = prevIndex
  }
  // Device cap: never render a level more detailed than the cap.
  if (idx < deviceCap) idx = deviceCap
  const clamped = Math.min(Math.max(idx, 0), levels.length - 1)
  return { index: clamped, level: levels[clamped] }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @overworld-engine/scene test -- lod`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/scene/src/lod.ts packages/scene/src/__tests__/lod.test.ts
git commit -m "feat(scene): LOD selection logic with hysteresis and device cap"
```

### Task 12: `<Lod>` component + config field + BaseBuilding/BaseNPC wiring

**Files:**
- Create: `packages/scene/src/Lod.tsx`
- Modify: `packages/scene/src/types.ts` (`lods` on `BuildingConfig`/`NPCConfig`)
- Modify: `packages/scene/src/BaseBuilding.tsx`, `packages/scene/src/BaseNPC.tsx`
- Modify: `packages/scene/src/SceneShell.tsx` (`preloadSceneModels` LOD paths)
- Modify: `packages/scene/src/index.ts`

**Interfaces:**
- Consumes: `selectLodLevel`, `LodLevel` (Task 11); `playerPositionRef` from `./playerStore`.
- Produces: `Lod(props: LodProps)`, `LodProps`; `BuildingConfig.lods`, `NPCConfig.lods`.

- [ ] **Step 1: Add the config field**

In `packages/scene/src/types.ts`, add to both `NPCConfig` and `BuildingConfig`:
```ts
  /** Optional distance LODs (near→far); the base `modelPath` is LOD0. */
  lods?: import('./lod').LodLevel[]
```

- [ ] **Step 2: Write the `<Lod>` component**

```tsx
// packages/scene/src/Lod.tsx
import { useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Vec3 } from '@overworld-engine/core'
import { useGLTF } from '@react-three/drei'
import { playerPositionRef } from './playerStore'
import { selectLodLevel, type LodLevel } from './lod'

export interface LodProps {
  position: Vec3
  /** Levels near→far, including the base as the first entry. */
  levels: LodLevel[]
  hysteresis?: number
  deviceCap?: number
  render: (modelPath: string) => React.ReactNode
}

/**
 * Distance-based LOD switch driven by playerPositionRef. Re-renders only when
 * the selected level index changes (not every frame). Preloads the adjacent
 * farther level so switches don't hitch.
 */
export function Lod({ position, levels, hysteresis, deviceCap, render }: LodProps) {
  const [index, setIndex] = useState(0)
  const indexRef = useRef(0)

  useFrame(() => {
    const p = playerPositionRef.current
    const dx = p[0] - position[0]
    const dz = p[2] - position[2]
    const dist = Math.sqrt(dx * dx + dz * dz)
    const { index: next } = selectLodLevel(dist, levels, {
      prevIndex: indexRef.current,
      hysteresis,
      deviceCap,
    })
    if (next !== indexRef.current) {
      indexRef.current = next
      setIndex(next)
      // Preload the adjacent farther level to avoid a hitch on the next switch.
      const ahead = levels[next + 1]
      if (ahead) useGLTF.preload(ahead.modelPath)
    }
  })

  return <>{render(levels[index].modelPath)}</>
}
```

- [ ] **Step 3: Wire into BaseBuilding / BaseNPC**

Read `packages/scene/src/BaseBuilding.tsx`. Find where it renders the model from `modelPath`. Wrap that render in `<Lod>` when `lods` is present. Add a `lods?: LodLevel[]` prop to `BaseBuildingProps`, pass `config.lods` from `SceneShell`, and:

```tsx
// inside BaseBuilding render, where the model currently renders via modelPath:
const levels = lods && lods.length > 0 ? [{ distance: 0, modelPath }, ...lods] : null
return levels ? (
  <Lod position={position} levels={levels} render={(path) => renderModel(path)} />
) : (
  renderModel(modelPath)
)
```
where `renderModel(path)` is the existing model-render JSX extracted into a small local function taking the path. Do the same in `BaseNPC.tsx`. In `SceneShell.tsx`, pass `lods={config.lods}` to both `<BaseNPC>` and `<BaseBuilding>`.

- [ ] **Step 4: Extend `preloadSceneModels`**

In `SceneShell.tsx`, update `preloadSceneModels` to also preload LOD paths:
```ts
config.npcs.forEach((n) => {
  useGLTF.preload(n.modelPath)
  n.lods?.forEach((l) => useGLTF.preload(l.modelPath))
})
config.buildings?.forEach((b) => {
  useGLTF.preload(b.modelPath)
  b.lods?.forEach((l) => useGLTF.preload(l.modelPath))
})
```

- [ ] **Step 5: Export**

In `packages/scene/src/index.ts`:
```ts
export { Lod } from './Lod'
export type { LodProps } from './Lod'
export { selectLodLevel } from './lod'
export type { LodLevel } from './lod'
```

- [ ] **Step 6: Typecheck + build**

Run: `pnpm --filter @overworld-engine/scene typecheck && pnpm --filter @overworld-engine/scene build`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add packages/scene/src/Lod.tsx packages/scene/src/types.ts packages/scene/src/BaseBuilding.tsx packages/scene/src/BaseNPC.tsx packages/scene/src/SceneShell.tsx packages/scene/src/index.ts
git commit -m "feat(scene): runtime LOD component + lods config field + preload"
```

### Task 13: Instanced decoration matrix/collision logic

**Files:**
- Create: `packages/scene/src/decorationInstancing.ts`
- Create: `packages/scene/src/__tests__/decorationInstancing.test.ts`

**Interfaces:**
- Consumes: `DecorationInstance` from `./types`; `Collider` from `./collisionStore`; `THREE`.
- Produces: `DecorationSet`, `instanceMatrix(inst)`, `decorationColliders(set)`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/scene/src/__tests__/decorationInstancing.test.ts
import { describe, expect, it } from 'vitest'
import { instanceMatrix, decorationColliders, type DecorationSet } from '../decorationInstancing'

describe('decoration instancing', () => {
  it('builds a matrix with position, rotation, and scale', () => {
    const m = instanceMatrix({ position: [3, 0, 4], rotation: [0, 1, 0], scale: 2 })
    const p = m.elements
    expect(p[12]).toBeCloseTo(3) // translation x
    expect(p[14]).toBeCloseTo(4) // translation z
  })

  it('derives colliders from instances when collision is set', () => {
    const set: DecorationSet = {
      id: 'lamp',
      modelPath: 'lamp.glb',
      instances: [{ position: [1, 0, 2] }, { position: [3, 0, 4] }],
      collision: { radius: 0.5 },
    }
    const colliders = decorationColliders(set)
    expect(colliders).toHaveLength(2)
    expect(colliders[0].id).toBe('decoration-lamp-0')
    expect(colliders[0].radius).toBe(0.5)
    expect(colliders[0].type).toBe('decoration')
  })

  it('derives no colliders without a collision spec', () => {
    const set: DecorationSet = { id: 'grass', modelPath: 'g.glb', instances: [{ position: [0, 0, 0] }] }
    expect(decorationColliders(set)).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @overworld-engine/scene test -- decorationInstancing`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// packages/scene/src/decorationInstancing.ts
import * as THREE from 'three'
import type { DecorationInstance } from './types'
import type { Collider } from './collisionStore'

export interface DecorationSet {
  id: string
  modelPath: string
  instances: DecorationInstance[]
  collision?: { radius: number }
  lod?: import('./lod').LodLevel[]
}

const _euler = new THREE.Euler()
const _quat = new THREE.Quaternion()
const _pos = new THREE.Vector3()
const _scale = new THREE.Vector3()

/** Compose a transform matrix from one decoration instance. */
export function instanceMatrix(inst: DecorationInstance): THREE.Matrix4 {
  _pos.set(inst.position[0], inst.position[1], inst.position[2])
  const r = inst.rotation ?? [0, 0, 0]
  _euler.set(r[0], r[1], r[2])
  _quat.setFromEuler(_euler)
  const s = inst.scale ?? 1
  _scale.set(s, s, s)
  return new THREE.Matrix4().compose(_pos, _quat, _scale)
}

/** Single source of truth: colliders derived from the same instance list. */
export function decorationColliders(set: DecorationSet): Collider[] {
  if (!set.collision) return []
  return set.instances.map((inst, i) => ({
    id: `decoration-${set.id}-${i}`,
    position: new THREE.Vector3(inst.position[0], 0, inst.position[2]),
    radius: set.collision!.radius,
    type: 'decoration' as const,
  }))
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @overworld-engine/scene test -- decorationInstancing`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/scene/src/decorationInstancing.ts packages/scene/src/__tests__/decorationInstancing.test.ts
git commit -m "feat(scene): decoration instancing matrix + collision derivation"
```

### Task 14: `<Decorations>` renderer

**Files:**
- Create: `packages/scene/src/Decorations.tsx`
- Create: `packages/scene/src/__tests__/decorationsCollision.test.tsx`
- Modify: `packages/scene/src/index.ts`

**Interfaces:**
- Consumes: `DecorationSet`, `instanceMatrix`, `decorationColliders` (Task 13); `useCollisionStore`; `useGLTF`.
- Produces: `Decorations(props: DecorationsProps)`, `DecorationsProps`.

> **Test convention:** pure-logic only (no `renderHook`/testing-library). The
> new logic here is the multi-set collider derivation — test it as a pure
> function `collidersForSets`. The `useDecorationCollision` effect and the
> instanced-mesh renderer are thin R3F bindings, left untested like other
> scene components, verified by typecheck + build.

- [ ] **Step 1: Write the failing pure test**

```ts
// packages/scene/src/__tests__/decorationsCollision.test.ts
import { describe, expect, it } from 'vitest'
import { collidersForSets } from '../decorationInstancing'
import type { DecorationSet } from '../decorationInstancing'

const sets: DecorationSet[] = [
  { id: 'lamp', modelPath: 'lamp.glb', instances: [{ position: [1, 0, 2] }, { position: [3, 0, 4] }], collision: { radius: 0.5 } },
  { id: 'grass', modelPath: 'g.glb', instances: [{ position: [0, 0, 0] }] }, // no collision
]

describe('collidersForSets', () => {
  it('flattens colliders across all sets that declare collision', () => {
    const colliders = collidersForSets(sets)
    expect(colliders.map((c) => c.id)).toEqual(['decoration-lamp-0', 'decoration-lamp-1'])
    expect(colliders.every((c) => c.type === 'decoration')).toBe(true)
  })

  it('returns an empty list when no set declares collision', () => {
    expect(collidersForSets([{ id: 'g', modelPath: 'g.glb', instances: [{ position: [0, 0, 0] }] }])).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @overworld-engine/scene test -- decorationsCollision`
Expected: FAIL — `collidersForSets` not exported.

- [ ] **Step 3: Add `collidersForSets`, then write the renderer + collision hook**

First append to `packages/scene/src/decorationInstancing.ts` (Task 13's file — `DecorationSet`, `Collider`, and `decorationColliders` are already defined/imported there):

```ts
/** All colliders across a list of decoration sets — the collision single source of truth. */
export function collidersForSets(sets: DecorationSet[]): Collider[] {
  return sets.flatMap(decorationColliders)
}
```

Then write the renderer + collision hook:

```tsx
// packages/scene/src/Decorations.tsx
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { useGLTF } from '@react-three/drei'
import { useCollisionStore } from './collisionStore'
import { instanceMatrix, collidersForSets, type DecorationSet } from './decorationInstancing'

export interface DecorationsProps {
  sets: DecorationSet[]
  /** Derive + register colliders from the same instances. Default true. */
  registerCollision?: boolean
}

/** Registers colliders derived from decoration sets; separated for testability. */
export function useDecorationCollision(sets: DecorationSet[], enabled: boolean): void {
  const register = useCollisionStore((s) => s.registerCollider)
  const unregister = useCollisionStore((s) => s.unregisterCollider)
  useEffect(() => {
    if (!enabled) return
    const colliders = collidersForSets(sets)
    colliders.forEach(register)
    return () => colliders.forEach((c) => unregister(c.id))
  }, [sets, enabled, register, unregister])
}

/** Instanced meshes for one decoration set (one InstancedMesh per source mesh). */
function DecorationSetMesh({ set }: { set: DecorationSet }) {
  const { scene } = useGLTF(set.modelPath)
  const matrices = useMemo(() => set.instances.map(instanceMatrix), [set.instances])

  // Collect (geometry, material) pairs from the source model.
  const parts = useMemo(() => {
    const out: { geometry: THREE.BufferGeometry; material: THREE.Material }[] = []
    scene.traverse((child) => {
      const mesh = child as THREE.Mesh
      if (mesh.isMesh) out.push({ geometry: mesh.geometry, material: mesh.material as THREE.Material })
    })
    return out
  }, [scene])

  return (
    <>
      {parts.map((part, pi) => (
        <instancedMesh
          key={pi}
          args={[part.geometry, part.material, matrices.length]}
          castShadow
          receiveShadow
          ref={(im) => {
            if (!im) return
            matrices.forEach((m, i) => im.setMatrixAt(i, m))
            im.instanceMatrix.needsUpdate = true
          }}
        />
      ))}
    </>
  )
}

/**
 * Render dense repeated set dressing (lamps, trees, benches, pylons) as
 * instanced meshes, with collision derived from the SAME instance list — no
 * duplicate transform data to keep in sync.
 */
export function Decorations({ sets, registerCollision = true }: DecorationsProps) {
  useDecorationCollision(sets, registerCollision)
  return (
    <>
      {sets.map((set) => (
        <DecorationSetMesh key={set.id} set={set} />
      ))}
    </>
  )
}
```

- [ ] **Step 4: Export**

In `packages/scene/src/index.ts`:
```ts
export { Decorations, useDecorationCollision } from './Decorations'
export type { DecorationsProps } from './Decorations'
export { instanceMatrix, decorationColliders, collidersForSets } from './decorationInstancing'
export type { DecorationSet } from './decorationInstancing'
```

- [ ] **Step 5: Run tests + typecheck**

Run: `pnpm --filter @overworld-engine/scene test -- decorationsCollision && pnpm --filter @overworld-engine/scene typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/scene/src/Decorations.tsx packages/scene/src/decorationInstancing.ts packages/scene/src/__tests__/decorationsCollision.test.ts packages/scene/src/index.ts
git commit -m "feat(scene): instanced Decorations renderer with derived collision"
```

### Task 15: Moving-NPC integration — collider position + ref-driven proximity

**Files:**
- Modify: `packages/scene/src/collisionStore.ts` (`setColliderPosition`)
- Modify: `packages/scene/src/useProximityDetection.ts` (read live refs)
- Modify: `packages/scene/src/SceneShell.tsx` (`npcPositionRefs` prop)
- Create: `packages/scene/src/AgentNPC.tsx`
- Modify: `packages/scene/src/index.ts`
- Create: `packages/scene/src/__tests__/setColliderPosition.test.ts`

**Interfaces:**
- Consumes: `useCollisionStore`; `playerPositionRef`; proximity internals.
- Produces: `collisionStore.setColliderPosition(id, pos)`; `SceneShellProps.npcPositionRefs`; `AgentNPC(props)`, `AgentLike`, `AgentNPCProps`.

- [ ] **Step 1: Write the failing collider-move test**

```ts
// packages/scene/src/__tests__/setColliderPosition.test.ts
import { beforeEach, describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { useCollisionStore } from '../collisionStore'

describe('setColliderPosition', () => {
  beforeEach(() => useCollisionStore.getState().clearColliders())
  it('moves an existing collider without re-creating it', () => {
    const s = useCollisionStore.getState()
    s.registerCollider({ id: 'npc1', position: new THREE.Vector3(0, 0, 0), radius: 1, type: 'npc' })
    s.setColliderPosition('npc1', [5, 0, 7])
    const c = useCollisionStore.getState().colliders.get('npc1')!
    expect(c.position.x).toBe(5)
    expect(c.position.z).toBe(7)
  })
  it('is a no-op for unknown ids', () => {
    useCollisionStore.getState().setColliderPosition('ghost', [1, 0, 1])
    expect(useCollisionStore.getState().colliders.size).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @overworld-engine/scene test -- setColliderPosition`
Expected: FAIL — `setColliderPosition` missing.

- [ ] **Step 3: Add `setColliderPosition`**

In `packages/scene/src/collisionStore.ts`, add to the interface and store:
```ts
  /** Move an existing collider in place (no-op if unknown). For moving NPCs. */
  setColliderPosition: (id: string, position: Vec3) => void
```
```ts
  setColliderPosition: (id, position) => {
    set((state) => {
      const existing = state.colliders.get(id)
      if (!existing) return state
      const next = new Map(state.colliders)
      next.set(id, { ...existing, position: new THREE.Vector3(position[0], 0, position[2]) })
      return { colliders: next }
    })
  },
```
Import `Vec3`: `import type { EntityKind, Vec3 } from '@overworld-engine/core'` (extend the existing import).

- [ ] **Step 4: Live-ref proximity in SceneShell**

Read `packages/scene/src/useProximityDetection.ts` and `SceneShell.tsx`. Add `npcPositionRefs?: Record<string, { current: Vec3 }>` to `SceneShellProps`. In the `proximityNpcs` memo, when a ref exists for an npc id, the proximity hook must read the ref each frame. Simplest approach that fits the existing per-frame proximity loop: pass `npcPositionRefs` into `useProximityDetection`, and inside its `useFrame`, resolve each npc position as `refs[id]?.current ?? staticPositions[id]`. Update `SelectionRing` similarly (it already takes a `positions` map — pass a getter or update refs). Keep static behavior identical when `npcPositionRefs` is undefined.

- [ ] **Step 5: Write `<AgentNPC>`**

```tsx
// packages/scene/src/AgentNPC.tsx
import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import type { Vec3 } from '@overworld-engine/core'
import { useCollisionStore } from './collisionStore'

/** Structural view of an `ai` agent (createAgent result). No import of `ai`. */
export interface AgentLike {
  position: readonly [number, number]
  readonly heading: number
  update(deltaMs: number): unknown
}

export interface AgentNPCProps {
  npcId: string
  agent: AgentLike
  /** Shared position ref — wire the SAME ref into SceneShell.npcPositionRefs[npcId]. */
  positionRef: { current: Vec3 }
  y?: number
  rotationOffset?: number
  /** false = render-only (agent updated elsewhere). Default true. */
  driven?: boolean
  children?: React.ReactNode
}

/**
 * Drive a headless `ai` agent from the frame loop, publish its live position
 * into a shared ref (consumed by SceneShell proximity/selection/collision),
 * and move the NPC visual + collider. Compose with ai's createAgent/patrol.
 */
export function AgentNPC({
  npcId,
  agent,
  positionRef,
  y = 0,
  rotationOffset = 0,
  driven = true,
  children,
}: AgentNPCProps) {
  const groupRef = useRef<Group>(null)
  const setColliderPosition = useCollisionStore((s) => s.setColliderPosition)

  useFrame((_, delta) => {
    if (driven) agent.update(delta * 1000)
    const [x, z] = agent.position
    positionRef.current[0] = x
    positionRef.current[1] = y
    positionRef.current[2] = z
    setColliderPosition(npcId, [x, y, z])
    const g = groupRef.current
    if (g) {
      g.position.set(x, y, z)
      const target = agent.heading + rotationOffset
      const diff = target - g.rotation.y
      const normalized = Math.atan2(Math.sin(diff), Math.cos(diff))
      g.rotation.y += normalized * 0.15
    }
  })

  return <group ref={groupRef}>{children}</group>
}
```

- [ ] **Step 6: Export**

In `packages/scene/src/index.ts`:
```ts
export { AgentNPC } from './AgentNPC'
export type { AgentNPCProps, AgentLike } from './AgentNPC'
```

- [ ] **Step 7: Run tests + typecheck + build**

Run: `pnpm --filter @overworld-engine/scene test && pnpm --filter @overworld-engine/scene typecheck && pnpm --filter @overworld-engine/scene build`
Expected: PASS (existing proximity tests still green).

- [ ] **Step 8: Commit**

```bash
git add packages/scene/src/collisionStore.ts packages/scene/src/useProximityDetection.ts packages/scene/src/SceneShell.tsx packages/scene/src/AgentNPC.tsx packages/scene/src/index.ts packages/scene/src/__tests__/setColliderPosition.test.ts
git commit -m "feat(scene): moving-NPC integration via ref-driven positions + AgentNPC"
```

### Task 16: Orbit camera logic

**Files:**
- Create: `packages/scene/src/orbitCamera.ts`
- Create: `packages/scene/src/__tests__/orbitCamera.test.ts`

**Interfaces:**
- Produces: `OrbitState`, `OrbitLimits`, `applyOrbitDelta(state, delta, limits)`, `orbitToOffset(state)`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/scene/src/__tests__/orbitCamera.test.ts
import { describe, expect, it } from 'vitest'
import { applyOrbitDelta, orbitToOffset } from '../orbitCamera'

const limits = { minDistance: 5, maxDistance: 40, minPitch: 0.1, maxPitch: 1.4 }

describe('orbit camera', () => {
  it('clamps distance within limits', () => {
    const s = { distance: 20, yaw: 0, pitch: 0.5 }
    expect(applyOrbitDelta(s, { dYaw: 0, dPitch: 0, dZoom: -100 }, limits).distance).toBe(5)
    expect(applyOrbitDelta(s, { dYaw: 0, dPitch: 0, dZoom: 100 }, limits).distance).toBe(40)
  })
  it('clamps pitch within limits', () => {
    const s = { distance: 20, yaw: 0, pitch: 0.5 }
    expect(applyOrbitDelta(s, { dYaw: 0, dPitch: -5, dZoom: 0 }, limits).pitch).toBeCloseTo(0.1)
    expect(applyOrbitDelta(s, { dYaw: 0, dPitch: 5, dZoom: 0 }, limits).pitch).toBeCloseTo(1.4)
  })
  it('converts orbit state to a camera offset', () => {
    const offset = orbitToOffset({ distance: 10, yaw: 0, pitch: 0 })
    // yaw 0, pitch 0 → directly behind on +Z, at ground height
    expect(offset[2]).toBeCloseTo(10)
    expect(offset[1]).toBeCloseTo(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @overworld-engine/scene test -- orbitCamera`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// packages/scene/src/orbitCamera.ts
import type { Vec3 } from '@overworld-engine/core'

export interface OrbitState { distance: number; yaw: number; pitch: number }
export interface OrbitLimits {
  minDistance: number
  maxDistance: number
  minPitch: number
  maxPitch: number
}
export interface OrbitDelta { dYaw: number; dPitch: number; dZoom: number }

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/** Apply a user input delta to orbit state, clamped to limits. Pure. */
export function applyOrbitDelta(state: OrbitState, delta: OrbitDelta, limits: OrbitLimits): OrbitState {
  return {
    distance: clamp(state.distance + delta.dZoom, limits.minDistance, limits.maxDistance),
    yaw: state.yaw + delta.dYaw,
    pitch: clamp(state.pitch + delta.dPitch, limits.minPitch, limits.maxPitch),
  }
}

/** Convert spherical orbit state to a camera offset from the target. */
export function orbitToOffset(state: OrbitState): Vec3 {
  const { distance, yaw, pitch } = state
  const horizontal = Math.cos(pitch) * distance
  return [
    Math.sin(yaw) * horizontal,
    Math.sin(pitch) * distance,
    Math.cos(yaw) * horizontal,
  ]
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @overworld-engine/scene test -- orbitCamera`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/scene/src/orbitCamera.ts packages/scene/src/__tests__/orbitCamera.test.ts
git commit -m "feat(scene): orbit camera spherical math with limit clamping"
```

### Task 17: Orbit input in `FollowCamera`

**Files:**
- Modify: `packages/scene/src/FollowCamera.tsx`
- Modify: `packages/scene/src/index.ts` (export orbit types)

**Interfaces:**
- Consumes: `applyOrbitDelta`, `orbitToOffset`, `OrbitState`, `OrbitLimits` (Task 16); `resolveInputBlocked` (Task 10).
- Produces: `FollowCameraProps.orbit`.

- [ ] **Step 1: Extend `FollowCameraProps`**

In `packages/scene/src/FollowCamera.tsx`, add:
```ts
export interface FollowCameraOrbitOptions {
  enabled?: boolean
  minDistance?: number
  maxDistance?: number
  minPitch?: number
  maxPitch?: number
  initialDistance?: number
  initialYaw?: number
  initialPitch?: number
  zoomSpeed?: number
  rotateSpeed?: number
  pointer?: boolean
  touch?: boolean
}
// add to FollowCameraProps:
  orbit?: FollowCameraOrbitOptions
```

- [ ] **Step 2: Implement orbit mode**

When `orbit?.enabled` (or `orbit` object present), maintain an `orbitState` ref initialized from `initialDistance/Yaw/Pitch` (defaults `[20, 0, 0.6]`). Attach `pointermove` (drag) + `wheel` (zoom) listeners to `gl.domElement`, and touch handlers for pinch, all guarded by `resolveInputBlocked(undefined)` (so a modal lock disables orbit). On input, call `applyOrbitDelta` with `rotateSpeed`/`zoomSpeed`-scaled deltas and clamp via limits. Each frame, compute the offset with `orbitToOffset(orbitState.current)` and use it in place of the fixed `offset` in the existing lerp. **When `orbit` is undefined, keep the current fixed-offset code path unchanged.**

Add near the top:
```tsx
import { applyOrbitDelta, orbitToOffset, type OrbitState } from './orbitCamera'
import { resolveInputBlocked } from './inputBlocked'
import { useThree } from '@react-three/fiber' // gl for domElement (already importing useThree)
```
Sketch of the effective-offset selection inside `useFrame`:
```tsx
const effectiveOffset = orbit ? orbitToOffset(orbitState.current) : offset
desiredPosition.current.set(
  cameraTarget.current.x + effectiveOffset[0],
  cameraTarget.current.y + effectiveOffset[1],
  cameraTarget.current.z + effectiveOffset[2]
)
```

- [ ] **Step 3: Export orbit types**

In `packages/scene/src/index.ts`:
```ts
export { applyOrbitDelta, orbitToOffset } from './orbitCamera'
export type { OrbitState, OrbitLimits, OrbitDelta } from './orbitCamera'
export type { FollowCameraOrbitOptions } from './FollowCamera'
```

- [ ] **Step 4: Typecheck + build**

Run: `pnpm --filter @overworld-engine/scene typecheck && pnpm --filter @overworld-engine/scene build`
Expected: clean. (Pointer/touch behavior is GL-bound; the math is covered by Task 16.)

- [ ] **Step 5: Commit**

```bash
git add packages/scene/src/FollowCamera.tsx packages/scene/src/index.ts
git commit -m "feat(scene): optional orbit/zoom/drag controls on FollowCamera (fixed offset default)"
```

---

## Phase 8 — Release, docs, dependency-rule verification

### Task 18: Changesets + dependency-rule grep + full build/test

**Files:**
- Create: `.changeset/world-production-v2-*.md` (one per changed package)
- Create/Modify: package `README.md` sections for new exports (scene, environment, loading, audio, minimap, input, core)
- Create: `docs/guides/dense-world.md` (integration guide replacing app-owned glue)

**Interfaces:** none (release/docs task).

- [ ] **Step 1: Verify zero new cross-system-package imports**

Run:
```bash
grep -rEn "from '@overworld-engine/(scene|input|environment|loading|minimap|audio|ai|net|platform|devtools|editor|inspector|content|notifications|analytics|tutorial|quest|inventory|achievements|dialogue|adapters-weapp|relay)'" \
  packages/*/src --include=*.ts --include=*.tsx | grep -v "/core/"
```
Expected: only lines where a package imports its OWN name (none should import a DIFFERENT system package). Any cross-package hit is a rule violation — fix by switching to a structural type or bus event before proceeding.

- [ ] **Step 2: Full workspace build + typecheck + test**

Run: `pnpm build && pnpm typecheck && pnpm test`
Expected: all packages green.

- [ ] **Step 3: Write changesets**

Create one file per package. Example for scene:
```markdown
---
'@overworld-engine/scene': major
---

Add instanced `Decorations` renderer, runtime `Lod` + `lods` config, orbit
camera on `FollowCamera`, ref-driven moving NPCs (`AgentNPC`,
`SceneShell.npcPositionRefs`), and default input blocking via the shared
`inputLock`. `isInputBlocked` now falls back to `inputLock.isLocked()` when
omitted (no effect until a lock is acquired).
```
And minor changesets for `core`, `input`, `environment`, `loading`, `audio`, `minimap` describing their additions (inputLock; keyboard-layer lockInput + joystick; WorldEnvironment; sceneLoadState/zone streaming; ambient zones/buses; radar selectors).

- [ ] **Step 4: Write the dense-world integration guide**

Create `docs/guides/dense-world.md` showing the end-to-end composition that replaces the team's app-owned files: `WorldEnvironment` (env preset) + `Decorations` (instancing) + `lods` (LOD) + `AgentNPC` + `ai.createAgent` (moving NPCs) + `useSceneLoadStore`/`FirstFramePhase`/`useZoneStreaming` (load state) + `createAudioManager` zones + `selectRadarMarkers` (radar) + `inputLock`/`useKeyboardLayer({lockInput})` (unified blocking). Map each former app file (`WorldEnvironment.tsx`, `worldLayout.ts`, `npcs.ts`, `worldAudio.ts`, `Minimap.tsx`, `EventDialogueBridge.tsx`) to the framework API that now covers it.

- [ ] **Step 5: Update package READMEs**

Add a short "New in this release" subsection to each changed package's `README.md` listing the new exports with a one-line usage snippet. Keep to the existing README tone.

- [ ] **Step 6: Commit**

```bash
git add .changeset docs/guides/dense-world.md packages/*/README.md
git commit -m "docs+chore: changesets, dense-world guide, README updates for world-production v2"
```

---

## Self-Review

**Spec coverage:** every §3–§11 feature maps to a task — §3 input lock → Tasks 1,2,10; §4 WorldEnvironment → Tasks 3,4; §5 decorations → Tasks 13,14; §6 LOD → Tasks 11,12; §7 moving NPCs → Task 15; §8 load-state → Tasks 5,6; §9 audio zones → Tasks 7,8; §10 orbit camera → Tasks 16,17; §11 radar → Task 9; §12 release/§13 order → Task 18.

**Type consistency:** `inputLock`/`createInputLock`/`InputLock` consistent across core→input→scene; `resolveInputBlocked` shared by Player/interaction/FollowCamera; `LodLevel` shared by `lod.ts`/`Lod.tsx`/`types.ts`/`decorationInstancing.ts`; `DecorationSet` shared by `decorationInstancing.ts`/`Decorations.tsx`; `ScenePhase`/`SceneLoadState` shared across loading tasks; `ZoneBounds`/`ZoneManifest` local to loading; `BusName`/`AmbientZone`/`zoneWeight`/`mixBuses` shared across audio tasks; `RadarConfig`/`RadarMarker` in minimap; `OrbitState`/`applyOrbitDelta`/`orbitToOffset` shared by orbit tasks.

**Placeholders:** none — every code step contains full source; binding-only steps (Task 8 step 3, Task 15 step 4, Task 17 step 2) reference exact existing files to read first and give the concrete edit, because they modify large existing files whose current internals must be matched verbatim.
