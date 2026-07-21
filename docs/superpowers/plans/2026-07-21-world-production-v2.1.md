# World-Production v2.1 — Close Audit Gaps — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the 8 remaining world-production feedback gaps (2 MISSING + 6 PARTIAL) found by re-auditing v2.0.0, each in its owning package, additively and backward-compatibly.

**Architecture:** Every gap ships a pure, headless helper (vitest truth-table tested) plus a thin R3F wiring layer. No new cross-package import edges — cross-package collaboration stays on structural typing / the core event bus. Depend only on `@overworld-engine/core`.

**Tech Stack:** TypeScript, React 18, three.js 0.170, @react-three/fiber + drei, zustand 5, vitest 4, pnpm workspaces, Changesets.

## Global Constraints

- **Zero cross-package imports.** A system package may import only `@overworld-engine/core`. Cross-package = structural typing or the event bus. Verify with `pnpm -r typecheck` and a dependency-graph glance.
- **Backward-compatible only.** Every new field/param is optional; no existing caller's behavior changes. `NPCAnimationMap.idle` is required *only when* `animationMap` is supplied.
- **Pure-logic tests only.** Vitest truth-tables for helpers. **No** `@testing-library/*`, **no** `renderHook`. Follow the existing style in `packages/scene/src/__tests__/lod.test.ts`.
- **Versioning.** `@overworld-engine/*` is a Changesets `fixed` group — one coordinated **minor** bump (2.0.0 → 2.1.0). One changeset at the end (Task 10).
- **Spec:** `docs/specs/2026-07-21-world-production-v2.1-design.md` is the source of truth.
- **Per task:** run that package's tests with `pnpm --filter @overworld-engine/<pkg> test`; commit at the end of each task.

---

## File Structure

New files:
- `packages/scene/src/animationClips.ts` — pure clip resolution + NPC anim-state derivation (Tasks 2, 4).

Modified files (by task):
- T1 `packages/scene/src/quality.ts` (+ `__tests__/quality.test.ts`)
- T2 `packages/scene/src/animationClips.ts`, `Player.tsx`, `useModelLoader.ts` (+ tests)
- T3 `packages/scene/src/types.ts`, `BaseNPC.tsx` (+ tests)
- T4 `packages/scene/src/animationClips.ts`, `AgentNPC.tsx`, `BaseNPC.tsx` (+ tests)
- T5 `packages/scene/src/lod.ts`, `quality.ts`, `LodSwitch.tsx`, `BaseBuilding.tsx`, `BaseNPC.tsx` (+ tests)
- T6 `packages/scene/src/decorationInstancing.ts`, `Decorations.tsx` (+ tests)
- T7 `packages/environment/src/worldEnvironment.ts`, `WorldEnvironmentScene.tsx` (+ tests)
- T8 `packages/loading/src/manifest.ts`, `zoneStreaming.ts`, `sceneLoadStore.ts`, `sceneLoad.tsx` (+ tests)
- T9 `packages/minimap/src/radar.ts` (+ tests)
- T10 changeset + docs + full verify

All new exports must be added to the owning package's `src/index.ts` barrel in the same task.

---

### Task 1: GPU-aware quality detection (#10, MISSING)

**Files:**
- Modify: `packages/scene/src/quality.ts`
- Modify: `packages/scene/src/index.ts` (export new helpers)
- Test: `packages/scene/src/__tests__/quality.test.ts`

**Interfaces:**
- Produces:
  - `isSoftwareRenderer(renderer: string): boolean`
  - `readWebglRenderer(gl: WebGLRenderingContext | WebGL2RenderingContext): string | undefined`
  - `detectQualityPreset(input?: { renderer?: string; gl?: WebGLRenderingContext | WebGL2RenderingContext }): QualityPresetName` (widened signature; no-arg call unchanged)

- [ ] **Step 1: Write the failing test** — append to `packages/scene/src/__tests__/quality.test.ts` (create the file with this import header if it doesn't already exist):

```ts
import { describe, expect, it } from 'vitest'
import { detectQualityPreset, isSoftwareRenderer } from '../quality'

describe('isSoftwareRenderer', () => {
  it('flags known software rasterizers (case-insensitive)', () => {
    for (const r of [
      'Google SwiftShader',
      'Mesa/X.org llvmpipe (LLVM 15.0.7, 256 bits)',
      'softpipe',
      'Software Rasterizer',
      'Microsoft Basic Render Driver',
    ]) {
      expect(isSoftwareRenderer(r)).toBe(true)
    }
  })
  it('does not flag real GPUs', () => {
    for (const r of [
      'ANGLE (Apple, Apple M1 Pro, OpenGL 4.1)',
      'NVIDIA GeForce RTX 4090/PCIe/SSE2',
      'Intel(R) Iris(R) Xe Graphics',
    ]) {
      expect(isSoftwareRenderer(r)).toBe(false)
    }
  })
})

describe('detectQualityPreset with renderer', () => {
  it('forces low for a software renderer regardless of other signals', () => {
    expect(detectQualityPreset({ renderer: 'Google SwiftShader' })).toBe('low')
  })
  it('ignores a real GPU string and falls back to the heuristic', () => {
    // No navigator in this test env → heuristic returns 'high'.
    expect(detectQualityPreset({ renderer: 'NVIDIA GeForce RTX 4090' })).toBe('high')
  })
  it('no-arg call is unchanged (high in the SSR/test default)', () => {
    expect(detectQualityPreset()).toBe('high')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @overworld-engine/scene test -- quality`
Expected: FAIL — `isSoftwareRenderer` is not exported / `detectQualityPreset` rejects an argument.

- [ ] **Step 3: Implement** — in `packages/scene/src/quality.ts`, add the two helpers above `detectQualityPreset` and widen its signature:

```ts
/** Renderer substrings (lowercased) that indicate CPU/software WebGL — always low tier. */
const SOFTWARE_RENDERER_PATTERNS = [
  'swiftshader',
  'llvmpipe',
  'softpipe',
  'software rasterizer',
  'basic render', // "Microsoft Basic Render Driver"
]

/** True when `renderer` names a software rasterizer (the exact case that needs `low`). */
export function isSoftwareRenderer(renderer: string): boolean {
  const r = renderer.toLowerCase()
  return SOFTWARE_RENDERER_PATTERNS.some((p) => r.includes(p))
}

/**
 * Read the unmasked renderer string via the `WEBGL_debug_renderer_info`
 * extension. Returns `undefined` when the extension is unavailable or the
 * lookup throws (fully guarded — some browsers gate this behind privacy flags).
 */
export function readWebglRenderer(
  gl: WebGLRenderingContext | WebGL2RenderingContext,
): string | undefined {
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info')
    if (!ext) return undefined
    const value = gl.getParameter(
      (ext as { UNMASKED_RENDERER_WEBGL: number }).UNMASKED_RENDERER_WEBGL,
    )
    return typeof value === 'string' ? value : undefined
  } catch {
    return undefined
  }
}
```

Then change the signature and prepend the software-renderer short-circuit:

```ts
export function detectQualityPreset(input?: {
  renderer?: string
  gl?: WebGLRenderingContext | WebGL2RenderingContext
}): QualityPresetName {
  // GPU-aware override: software WebGL is always low, whatever the CPU says.
  const renderer = input?.renderer ?? (input?.gl ? readWebglRenderer(input.gl) : undefined)
  if (renderer && isSoftwareRenderer(renderer)) return 'low'

  if (typeof navigator === 'undefined') return 'high'
  // ...existing body unchanged...
}
```

- [ ] **Step 4: Export** — in `packages/scene/src/index.ts`, add `isSoftwareRenderer` and `readWebglRenderer` alongside the existing `detectQualityPreset` export.

- [ ] **Step 5: Run tests**

Run: `pnpm --filter @overworld-engine/scene test -- quality`
Expected: PASS (all quality tests).

- [ ] **Step 6: Commit**

```bash
git add packages/scene/src/quality.ts packages/scene/src/index.ts packages/scene/src/__tests__/quality.test.ts
git commit -m "feat(scene): GPU-aware quality detection (software renderer -> low)"
```

---

### Task 2: Shared clip resolver + `useModelClips` (#11 foundation)

**Files:**
- Create: `packages/scene/src/animationClips.ts`
- Modify: `packages/scene/src/Player.tsx` (reuse `resolveClip`)
- Modify: `packages/scene/src/useModelLoader.ts` (add `useModelClips`)
- Modify: `packages/scene/src/index.ts`
- Test: `packages/scene/src/__tests__/animationClips.test.ts`

**Interfaces:**
- Produces:
  - `resolveClip(names: string[], requested: string | undefined, fallbackIndex: number): string | undefined`
  - `useModelClips(opts: UseModelLoaderOptions): { model: THREE.Group | null; animations: THREE.AnimationClip[] }`
- Consumes (T1): nothing.

Note: Player currently has a private `resolveAction(actions, names, requested, fallbackIndex)` returning an `AnimationAction`. We extract only the *name-resolution* half as the pure, testable `resolveClip`; Player keeps looking up the action from the resolved name.

- [ ] **Step 1: Write the failing test** — `packages/scene/src/__tests__/animationClips.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { resolveClip } from '../animationClips'

const names = ['Run', 'Idle', 'Walk']

describe('resolveClip', () => {
  it('returns the requested name when present', () => {
    expect(resolveClip(names, 'Walk', 1)).toBe('Walk')
  })
  it('falls back to the index convention when requested is missing/undefined', () => {
    expect(resolveClip(names, undefined, 1)).toBe('Idle')
    expect(resolveClip(names, 'Nope', 0)).toBe('Run')
  })
  it('returns undefined when the fallback index is out of range', () => {
    expect(resolveClip(names, undefined, 9)).toBeUndefined()
    expect(resolveClip([], undefined, 0)).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @overworld-engine/scene test -- animationClips`
Expected: FAIL — module `../animationClips` not found.

- [ ] **Step 3: Implement `resolveClip`** — create `packages/scene/src/animationClips.ts`:

```ts
/**
 * Pure clip-name resolution shared by Player and NPCs: prefer an explicitly
 * requested clip name when it exists in the model's `names`; otherwise fall
 * back to the source game's index convention. Returns `undefined` when
 * neither resolves (caller renders without that clip).
 */
export function resolveClip(
  names: string[],
  requested: string | undefined,
  fallbackIndex: number,
): string | undefined {
  if (requested && names.includes(requested)) return requested
  return names[fallbackIndex]
}
```

- [ ] **Step 4: Reuse in Player** — in `packages/scene/src/Player.tsx`, import `resolveClip` and replace the *name* resolution inside the private `resolveAction` helper (keep its action lookup). Concretely, `resolveAction` becomes:

```ts
import { resolveClip } from './animationClips'

// existing helper, now delegating name resolution to the shared pure fn:
function resolveAction(
  actions: Record<string, THREE.AnimationAction | null>,
  names: string[],
  requested: string | undefined,
  fallbackIndex: number,
): THREE.AnimationAction | null {
  const name = resolveClip(names, requested, fallbackIndex)
  return name ? (actions[name] ?? null) : null
}
```

(If `resolveAction`'s current body already matches this shape, only swap its name-picking lines for the `resolveClip` call — behavior must stay identical.)

- [ ] **Step 5: Add `useModelClips`** — in `packages/scene/src/useModelLoader.ts`, add below `useModelLoader` (reuses the same clone+shadow logic but also surfaces `animations`):

```ts
/**
 * Like {@link useModelLoader}, but also returns the model's animation clips
 * (which `useModelLoader` discards). For animated entities that run their own
 * `useAnimations` mixer (see `BaseNPC`). Same Suspense semantics.
 */
export function useModelClips({
  modelPath,
  enableCastShadow = true,
  enableReceiveShadow = true,
  modifyMaterial,
}: UseModelLoaderOptions): { model: THREE.Group | null; animations: THREE.AnimationClip[] } {
  let gltf: { scene: THREE.Group; animations: THREE.AnimationClip[] } | null = null
  try {
    gltf = useGLTF(modelPath) as unknown as {
      scene: THREE.Group
      animations: THREE.AnimationClip[]
    }
  } catch (error) {
    if (typeof (error as PromiseLike<unknown> | null)?.then === 'function') throw error
    console.error(`[overworld] failed to load model: ${modelPath}`, error)
  }

  const model = useMemo(() => {
    if (!gltf?.scene) return null
    const cloned = gltf.scene.clone()
    cloned.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        child.castShadow = enableCastShadow
        child.receiveShadow = enableReceiveShadow
        if (modifyMaterial) modifyMaterial(child as THREE.Mesh)
      }
    })
    return cloned
  }, [gltf, enableCastShadow, enableReceiveShadow, modifyMaterial])

  return { model, animations: gltf?.animations ?? [] }
}
```

- [ ] **Step 6: Export** — add `resolveClip` and `useModelClips` to `packages/scene/src/index.ts`.

- [ ] **Step 7: Run tests + typecheck**

Run: `pnpm --filter @overworld-engine/scene test -- animationClips && pnpm --filter @overworld-engine/scene typecheck`
Expected: PASS; Player still typechecks.

- [ ] **Step 8: Commit**

```bash
git add packages/scene/src/animationClips.ts packages/scene/src/Player.tsx packages/scene/src/useModelLoader.ts packages/scene/src/index.ts packages/scene/src/__tests__/animationClips.test.ts
git commit -m "feat(scene): shared resolveClip + useModelClips (surfaces glTF animations)"
```

---

### Task 3: NPC animation contract in `BaseNPC` (#11, MISSING)

**Files:**
- Modify: `packages/scene/src/types.ts` (add `NPCAnimationMap`, `NPCConfig.animationMap`)
- Modify: `packages/scene/src/BaseNPC.tsx` (animated model path)
- Modify: `packages/scene/src/index.ts`
- Test: `packages/scene/src/__tests__/npcAnimation.test.ts`

**Interfaces:**
- Consumes (T2): `useModelClips`, `resolveClip`.
- Produces:
  - `interface NPCAnimationMap { idle: string; walk?: string; run?: string }`
  - `NPCConfig.animationMap?: NPCAnimationMap`
  - `BaseNPCProps` gains `animationMap?`, `onModelReady?`, `animStateRef?`
  - `pickNpcClipName(names: string[], animationMap: NPCAnimationMap | undefined, state: 'idle'|'walk'|'run'): string | undefined` (pure, in `animationClips.ts`)

- [ ] **Step 1: Write the failing test** — `packages/scene/src/__tests__/npcAnimation.test.ts` (pure clip-picking; the crossfade wiring is verified structurally, not via a renderer):

```ts
import { describe, expect, it } from 'vitest'
import { pickNpcClipName } from '../animationClips'

const names = ['idle_breath', 'walk_cycle', 'run_cycle']

describe('pickNpcClipName', () => {
  it('maps state -> requested clip via the animationMap', () => {
    const map = { idle: 'idle_breath', walk: 'walk_cycle', run: 'run_cycle' }
    expect(pickNpcClipName(names, map, 'walk')).toBe('walk_cycle')
    expect(pickNpcClipName(names, map, 'run')).toBe('run_cycle')
  })
  it('falls back to idle when walk/run are unmapped', () => {
    const map = { idle: 'idle_breath' }
    expect(pickNpcClipName(names, map, 'walk')).toBe('idle_breath')
    expect(pickNpcClipName(names, map, 'run')).toBe('idle_breath')
  })
  it('uses index-0 idle when no map given', () => {
    expect(pickNpcClipName(names, undefined, 'idle')).toBe('idle_breath')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @overworld-engine/scene test -- npcAnimation`
Expected: FAIL — `pickNpcClipName` not exported.

- [ ] **Step 3: Add `pickNpcClipName`** — append to `packages/scene/src/animationClips.ts`:

```ts
export interface NPCAnimationMap {
  idle: string
  walk?: string
  run?: string
}

/**
 * Resolve the clip name an NPC should play for a movement state. Requested
 * clips fall back to `idle` (mapped or index-0) so a single authored idle is
 * always enough. Mirrors the Player idle/walk/run contract.
 */
export function pickNpcClipName(
  names: string[],
  animationMap: NPCAnimationMap | undefined,
  state: 'idle' | 'walk' | 'run',
): string | undefined {
  const idle = resolveClip(names, animationMap?.idle, 0)
  if (state === 'idle') return idle
  const requested = state === 'walk' ? animationMap?.walk : animationMap?.run
  return resolveClip(names, requested, -1) ?? idle
}
```

(`resolveClip(names, requested, -1)` yields `undefined` for the out-of-range index, so an unmapped walk/run cleanly falls through to `idle`.)

- [ ] **Step 4: Add the type to `types.ts`** — in `packages/scene/src/types.ts`, import and extend `NPCConfig`:

```ts
import type { NPCAnimationMap } from './animationClips'

export interface NPCConfig {
  // ...existing fields...
  /** Optional animation clips for an animated NPC GLB. `idle` plays by default. */
  animationMap?: NPCAnimationMap
}
```

- [ ] **Step 5: Add props + animated model to `BaseNPC.tsx`.** Extend `BaseNPCProps`:

```ts
import { pickNpcClipName, type NPCAnimationMap } from './animationClips'
import { useModelClips } from './useModelLoader'
import { useAnimations } from '@react-three/drei'
import { useEffect } from 'react'

export interface BaseNPCProps {
  // ...existing fields...
  /** Animation clips for an animated GLB. Enables the animated model path; `idle` plays by default. */
  animationMap?: NPCAnimationMap
  /** Extension hook for authored state machines: called once the model + mixer are ready. */
  onModelReady?: (ctx: {
    scene: THREE.Group
    actions: Record<string, THREE.AnimationAction | null>
    mixer: THREE.AnimationMixer
    names: string[]
  }) => void
  /** Per-frame animation state (moving NPCs, see AgentNPC). Defaults to 'idle' when omitted. */
  animStateRef?: { current: 'idle' | 'walk' | 'run' }
}
```

Add an `AnimatedNPCModel` component next to `NPCModel`:

```ts
function AnimatedNPCModel({
  modelPath,
  scale,
  modifyMaterial,
  animationMap,
  animStateRef,
  onModelReady,
  fallback,
}: {
  modelPath: string
  scale: number
  modifyMaterial?: (child: THREE.Mesh) => void
  animationMap: NPCAnimationMap | undefined
  animStateRef?: { current: 'idle' | 'walk' | 'run' }
  onModelReady?: BaseNPCProps['onModelReady']
  fallback: React.ReactNode
}) {
  const { model, animations } = useModelClips({ modelPath, modifyMaterial })
  const { actions, names, mixer } = useAnimations(animations, model ?? undefined)
  const currentAction = useRef<THREE.AnimationAction | null>(null)
  const currentState = useRef<'idle' | 'walk' | 'run'>('idle')

  // Fire the ready hook once names resolve.
  useEffect(() => {
    if (model && names.length > 0) onModelReady?.({ scene: model, actions, mixer, names })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, names.length])

  // Start idle immediately, then crossfade whenever animStateRef changes.
  const applyState = (state: 'idle' | 'walk' | 'run') => {
    if (names.length === 0) return
    const name = pickNpcClipName(names, animationMap, state)
    const next = name ? (actions[name] ?? null) : null
    if (!next || next === currentAction.current) return
    next.setLoop(THREE.LoopRepeat, Infinity)
    next.reset().fadeIn(0.2).play()
    currentAction.current?.fadeOut(0.2)
    currentAction.current = next
  }
  useEffect(() => {
    applyState('idle')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actions, names])
  useFrame(() => {
    const want = animStateRef?.current ?? 'idle'
    if (want !== currentState.current) {
      currentState.current = want
      applyState(want)
    }
  })

  if (!model) return <>{fallback}</>
  return <primitive object={model} scale={scale} />
}
```

Then, in the `renderModel` path, choose the animated component when `animationMap` is set. Change `renderModel`:

```ts
const animated = Boolean(animationMap)
const renderModel = (path: string) => (
  <ModelErrorBoundary key={path} modelPath={path} fallback={fallback}>
    <Suspense fallback={fallback}>
      {animated ? (
        <AnimatedNPCModel
          modelPath={path}
          scale={scale}
          modifyMaterial={modifyMaterial}
          animationMap={animationMap}
          animStateRef={animStateRef}
          onModelReady={onModelReady}
          fallback={fallback}
        />
      ) : (
        <NPCModel modelPath={path} scale={scale} modifyMaterial={modifyMaterial} fallback={fallback} />
      )}
    </Suspense>
  </ModelErrorBoundary>
)
```

Destructure the three new props (`animationMap`, `onModelReady`, `animStateRef`) in the `BaseNPC({ ... })` signature.

- [ ] **Step 6: Export** — add `NPCAnimationMap` to `packages/scene/src/index.ts` (re-export from `animationClips`).

- [ ] **Step 7: Run tests + typecheck**

Run: `pnpm --filter @overworld-engine/scene test -- npcAnimation && pnpm --filter @overworld-engine/scene typecheck`
Expected: PASS. Existing NPCs (no `animationMap`) still take the unchanged `NPCModel` path.

- [ ] **Step 8: Commit**

```bash
git add packages/scene/src/animationClips.ts packages/scene/src/types.ts packages/scene/src/BaseNPC.tsx packages/scene/src/index.ts packages/scene/src/__tests__/npcAnimation.test.ts
git commit -m "feat(scene): animated NPC contract — animationMap.idle, default idle playback, onModelReady"
```

---

### Task 4: Moving-NPC animation-state switching (#5, PARTIAL — chains off #11)

**Files:**
- Modify: `packages/scene/src/animationClips.ts` (add `deriveNpcAnimState`)
- Modify: `packages/scene/src/AgentNPC.tsx` (write `animStateRef`)
- Modify: `packages/scene/src/index.ts`
- Test: `packages/scene/src/__tests__/animationClips.test.ts` (extend)

**Interfaces:**
- Consumes (T3): `BaseNPC.animStateRef`, `AgentLike`.
- Produces: `deriveNpcAnimState(status: { isMoving: boolean; running?: boolean }): 'idle' | 'walk' | 'run'`; `AgentNPCProps.animStateRef?`.

- [ ] **Step 1: Write the failing test** — extend `animationClips.test.ts`:

```ts
import { deriveNpcAnimState } from '../animationClips'

describe('deriveNpcAnimState', () => {
  it('idle when not moving', () => {
    expect(deriveNpcAnimState({ isMoving: false })).toBe('idle')
  })
  it('walk when moving', () => {
    expect(deriveNpcAnimState({ isMoving: true })).toBe('walk')
  })
  it('run when moving and running', () => {
    expect(deriveNpcAnimState({ isMoving: true, running: true })).toBe('run')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @overworld-engine/scene test -- animationClips`
Expected: FAIL — `deriveNpcAnimState` not exported.

- [ ] **Step 3: Implement** — append to `packages/scene/src/animationClips.ts`:

```ts
/** Derive an NPC animation state from a locomotion status (e.g. ai AgentStatus). */
export function deriveNpcAnimState(status: {
  isMoving: boolean
  running?: boolean
}): 'idle' | 'walk' | 'run' {
  if (!status.isMoving) return 'idle'
  return status.running ? 'run' : 'walk'
}
```

- [ ] **Step 4: Write `animStateRef` from AgentNPC** — in `packages/scene/src/AgentNPC.tsx`:
  1. Widen `AgentLike` to optionally expose motion (structural, still no `ai` import):

```ts
export interface AgentLike {
  position: readonly [number, number]
  readonly heading: number
  /** Optional locomotion status — when present, drives animStateRef. */
  readonly isMoving?: boolean
  readonly running?: boolean
  update(deltaMs: number): unknown
}
```

  2. Add the prop and write it in the existing `useFrame`:

```ts
import { deriveNpcAnimState } from './animationClips'

// in AgentNPCProps:
  /** Optional shared ref written each frame with the derived anim state; wire into BaseNPC.animStateRef. */
  animStateRef?: { current: 'idle' | 'walk' | 'run' }

// inside useFrame, after moving the group:
  if (animStateRef) {
    animStateRef.current = deriveNpcAnimState({
      isMoving: agent.isMoving ?? true,
      running: agent.running,
    })
  }
```

  Destructure `animStateRef` in the `AgentNPC({ ... })` signature.

- [ ] **Step 5: Export** — add `deriveNpcAnimState` to `packages/scene/src/index.ts`.

- [ ] **Step 6: Run tests + typecheck**

Run: `pnpm --filter @overworld-engine/scene test -- animationClips && pnpm --filter @overworld-engine/scene typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/scene/src/animationClips.ts packages/scene/src/AgentNPC.tsx packages/scene/src/index.ts packages/scene/src/__tests__/animationClips.test.ts
git commit -m "feat(scene): moving-NPC idle<->walk<->run via deriveNpcAnimState + animStateRef"
```

---

### Task 5: LOD disposal + device-tier cap + preload priority (#4, PARTIAL)

**Files:**
- Modify: `packages/scene/src/lod.ts` (add `levelsToDispose`, `orderPreload`)
- Modify: `packages/scene/src/quality.ts` (add `qualityToLodCap`)
- Modify: `packages/scene/src/LodSwitch.tsx` (disposal + priority preload + accept cap)
- Modify: `packages/scene/src/BaseBuilding.tsx`, `BaseNPC.tsx` (pass `deviceCap` from quality)
- Modify: `packages/scene/src/index.ts`
- Test: `packages/scene/src/__tests__/lod.test.ts` (extend), `packages/scene/src/__tests__/quality.test.ts` (extend)

**Interfaces:**
- Consumes (T1): `QualityPresetName`, `useQualityStore`.
- Produces:
  - `levelsToDispose(prevIndex: number, nextIndex: number, levels: LodLevel[]): number[]`
  - `orderPreload(levels: LodLevel[], currentIndex: number): number[]`
  - `qualityToLodCap(preset: QualityPresetName): number`
  - `Lod` disposes its own clone on unmount; `<Lod>` gets `dispose?: boolean` (default true).

- [ ] **Step 1: Write the failing tests** — extend `lod.test.ts`:

```ts
import { levelsToDispose, orderPreload } from '../lod'

describe('levelsToDispose', () => {
  it('returns the level indices no longer shown after a switch', () => {
    expect(levelsToDispose(0, 2, levels)).toEqual([0, 1]) // left 0 and 1, now on 2
  })
  it('returns [] when the index is unchanged', () => {
    expect(levelsToDispose(1, 1, levels)).toEqual([])
  })
  it('handles switching to a nearer level', () => {
    expect(levelsToDispose(2, 0, levels)).toEqual([1, 2])
  })
})

describe('orderPreload', () => {
  it('orders remaining levels nearest-first around the current index', () => {
    expect(orderPreload(levels, 1)).toEqual([0, 2]) // neighbours by distance from index 1
  })
  it('excludes the current index', () => {
    expect(orderPreload(levels, 0)).toEqual([1, 2])
  })
})
```

And extend `quality.test.ts`:

```ts
import { qualityToLodCap } from '../quality'

describe('qualityToLodCap', () => {
  it('caps more aggressively on lower tiers', () => {
    expect(qualityToLodCap('high')).toBe(0)   // no cap, allow highest detail
    expect(qualityToLodCap('medium')).toBe(1)
    expect(qualityToLodCap('low')).toBe(2)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @overworld-engine/scene test -- lod quality`
Expected: FAIL — new functions not exported.

- [ ] **Step 3: Implement pure helpers** — append to `packages/scene/src/lod.ts`:

```ts
/** Level indices left behind when switching prev→next (to dispose their clones). */
export function levelsToDispose(prevIndex: number, nextIndex: number, levels: LodLevel[]): number[] {
  if (prevIndex === nextIndex) return []
  const lo = Math.min(prevIndex, nextIndex)
  const hi = Math.max(prevIndex, nextIndex)
  const out: number[] = []
  for (let i = lo; i <= hi; i++) {
    if (i !== nextIndex && i >= 0 && i < levels.length) out.push(i)
  }
  return out
}

/** Remaining level indices ordered nearest-first around `currentIndex` (excludes it). */
export function orderPreload(levels: LodLevel[], currentIndex: number): number[] {
  return levels
    .map((_, i) => i)
    .filter((i) => i !== currentIndex)
    .sort((a, b) => Math.abs(a - currentIndex) - Math.abs(b - currentIndex) || a - b)
}
```

Append to `packages/scene/src/quality.ts`:

```ts
/** Map a quality tier to the most-detailed LOD index it may render (0 = allow highest). */
export function qualityToLodCap(preset: QualityPresetName): number {
  switch (preset) {
    case 'low':
      return 2
    case 'medium':
      return 1
    default:
      return 0
  }
}
```

- [ ] **Step 4: Wire disposal + priority preload into `LodSwitch.tsx`.** Replace the file body with (adds `dispose` prop, per-clone disposal on unmount, and priority preload):

```ts
import { useEffect, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Vec3 } from '@overworld-engine/core'
import { useGLTF } from '@react-three/drei'
import { playerPositionRef } from './playerStore'
import { selectLodLevel, orderPreload, type LodLevel } from './lod'

export interface LodProps {
  position: Vec3
  levels: LodLevel[]
  hysteresis?: number
  deviceCap?: number
  /** Dispose GPU resources of clones this component created, on unmount. Default true. */
  dispose?: boolean
  render: (modelPath: string) => React.ReactNode
}

export function Lod({ position, levels, hysteresis, deviceCap, dispose = true, render }: LodProps) {
  const [index, setIndex] = useState(0)
  const indexRef = useRef(0)
  const groupRef = useRef<import('three').Group>(null)

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
      // Priority preload: nearest-first around the new index (bounded to the next 2).
      for (const i of orderPreload(levels, next).slice(0, 2)) {
        useGLTF.preload(levels[i]!.modelPath)
      }
    }
  })

  // Dispose only the geometries/materials of clones THIS <Lod> mounted — never
  // useGLTF.clear() on the shared cache (another entity may still use the source).
  useEffect(() => {
    if (!dispose) return
    const group = groupRef.current
    return () => {
      group?.traverse((child) => {
        const mesh = child as import('three').Mesh
        if (!mesh.isMesh) return
        mesh.geometry?.dispose?.()
        const mat = mesh.material as import('three').Material | import('three').Material[]
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose?.())
        else mat?.dispose?.()
      })
    }
  }, [dispose])

  return <group ref={groupRef}>{render(levels[index]!.modelPath)}</group>
}
```

- [ ] **Step 5: Pass `deviceCap` from quality in `BaseBuilding.tsx` and `BaseNPC.tsx`.** In each, import the quality store + cap and pass it to `<Lod>`:

```ts
import { useQualityStore, qualityToLodCap } from './quality'

// inside the component body:
const lodCap = useQualityStore((s) => qualityToLodCap(s.preset === 'custom' ? 'high' : s.preset))

// at the <Lod> call site, add the prop:
<Lod position={position} levels={levels} deviceCap={lodCap} render={renderModel} />
```

(`'custom'` presets have no tier semantics → treat as `'high'` = no cap.)

- [ ] **Step 6: Export** — add `levelsToDispose`, `orderPreload`, `qualityToLodCap` to `packages/scene/src/index.ts`.

- [ ] **Step 7: Run tests + typecheck**

Run: `pnpm --filter @overworld-engine/scene test -- lod quality && pnpm --filter @overworld-engine/scene typecheck`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/scene/src/lod.ts packages/scene/src/quality.ts packages/scene/src/LodSwitch.tsx packages/scene/src/BaseBuilding.tsx packages/scene/src/BaseNPC.tsx packages/scene/src/index.ts packages/scene/src/__tests__/lod.test.ts packages/scene/src/__tests__/quality.test.ts
git commit -m "feat(scene): LOD clone disposal, quality-tier cap wiring, nearest-first preload"
```

---

### Task 6: Instanced-decoration LOD consumption (#3, PARTIAL)

**Files:**
- Modify: `packages/scene/src/decorationInstancing.ts` (add `setCentroid`, `selectDecorationModel`)
- Modify: `packages/scene/src/Decorations.tsx` (consume per-set LOD)
- Modify: `packages/scene/src/index.ts`
- Test: `packages/scene/src/__tests__/decorationInstancing.test.ts`

**Interfaces:**
- Consumes (T5): `selectLodLevel` (from `lod.ts`).
- Produces:
  - `setCentroid(set: DecorationSet): { x: number; z: number }`
  - `selectDecorationModel(set: DecorationSet, playerPos: { x: number; z: number }, prevIndex?: number): { index: number; modelPath: string }`

- [ ] **Step 1: Write the failing test** — `packages/scene/src/__tests__/decorationInstancing.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { setCentroid, selectDecorationModel, type DecorationSet } from '../decorationInstancing'

const set: DecorationSet = {
  id: 'lamps',
  modelPath: 'lamp_hi.glb',
  instances: [
    { position: [0, 0, 0] },
    { position: [10, 0, 0] },
    { position: [0, 0, 10] },
  ],
  lod: [
    { distance: 30, modelPath: 'lamp_mid.glb' },
    { distance: 80, modelPath: 'lamp_lo.glb' },
  ],
}

describe('setCentroid', () => {
  it('averages instance X/Z positions', () => {
    expect(setCentroid(set)).toEqual({ x: 10 / 3, z: 10 / 3 })
  })
})

describe('selectDecorationModel', () => {
  it('renders the base model when the player is near the centroid', () => {
    expect(selectDecorationModel(set, { x: 3, z: 3 }).modelPath).toBe('lamp_hi.glb')
  })
  it('switches to a farther LOD model with distance', () => {
    expect(selectDecorationModel(set, { x: 500, z: 500 }).modelPath).toBe('lamp_lo.glb')
  })
  it('returns the base model when no lod is configured', () => {
    const plain: DecorationSet = { id: 'x', modelPath: 'x.glb', instances: [{ position: [0, 0, 0] }] }
    expect(selectDecorationModel(plain, { x: 999, z: 999 }).modelPath).toBe('x.glb')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @overworld-engine/scene test -- decorationInstancing`
Expected: FAIL — `setCentroid` / `selectDecorationModel` not exported.

- [ ] **Step 3: Implement** — append to `packages/scene/src/decorationInstancing.ts`:

```ts
import { selectLodLevel, type LodLevel } from './lod'

/** Average X/Z of a set's instances — the point LOD distance is measured from. */
export function setCentroid(set: DecorationSet): { x: number; z: number } {
  if (set.instances.length === 0) return { x: 0, z: 0 }
  let sx = 0
  let sz = 0
  for (const inst of set.instances) {
    sx += inst.position[0]
    sz += inst.position[2]
  }
  return { x: sx / set.instances.length, z: sz / set.instances.length }
}

/**
 * Pick the model a decoration set should render for the player's position.
 * Reuses the LOD hysteresis logic; the base `modelPath` is LOD0. Sets without
 * a `lod` field always render `modelPath` (unchanged behavior).
 */
export function selectDecorationModel(
  set: DecorationSet,
  playerPos: { x: number; z: number },
  prevIndex = 0,
): { index: number; modelPath: string } {
  if (!set.lod || set.lod.length === 0) return { index: 0, modelPath: set.modelPath }
  const levels: LodLevel[] = [{ distance: 0, modelPath: set.modelPath }, ...set.lod]
  const c = setCentroid(set)
  const dist = Math.hypot(playerPos.x - c.x, playerPos.z - c.z)
  const { index, level } = selectLodLevel(dist, levels, { prevIndex })
  return { index, modelPath: level.modelPath }
}
```

- [ ] **Step 4: Consume in `Decorations.tsx`.** Make `DecorationSetMesh` pick the LOD model from the player ref each frame, re-rendering only on index change:

```ts
import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { playerPositionRef } from './playerStore'
import { instanceMatrix, collidersForSets, selectDecorationModel, type DecorationSet } from './decorationInstancing'

function DecorationSetMesh({ set }: { set: DecorationSet }) {
  const [modelPath, setModelPath] = useState(set.modelPath)
  const indexRef = useRef(0)
  useFrame(() => {
    if (!set.lod || set.lod.length === 0) return
    const p = playerPositionRef.current
    const { index, modelPath: next } = selectDecorationModel(set, { x: p[0], z: p[2] }, indexRef.current)
    if (index !== indexRef.current) {
      indexRef.current = index
      setModelPath(next)
    }
  })
  const { scene } = useGLTF(modelPath)
  const matrices = useMemo(() => set.instances.map(instanceMatrix), [set.instances])
  // ...rest of the existing parts/instancedMesh body unchanged, but keyed on modelPath...
}
```

Keep the existing `parts`/`instancedMesh` render; just ensure it derives from the `scene` of the selected `modelPath`. Add `key={modelPath}` to the returned fragment's `instancedMesh` map root if needed so buffers rebuild on switch.

- [ ] **Step 5: Export** — add `setCentroid`, `selectDecorationModel` to `packages/scene/src/index.ts`.

- [ ] **Step 6: Run tests + typecheck**

Run: `pnpm --filter @overworld-engine/scene test -- decorationInstancing && pnpm --filter @overworld-engine/scene typecheck`
Expected: PASS. Sets without `lod` render exactly as before.

- [ ] **Step 7: Commit**

```bash
git add packages/scene/src/decorationInstancing.ts packages/scene/src/Decorations.tsx packages/scene/src/index.ts packages/scene/src/__tests__/decorationInstancing.test.ts
git commit -m "feat(scene): decoration sets consume per-set lod (distance model switch)"
```

---

### Task 7: Environment exposure / moon / transition / color-lerp (#2, PARTIAL)

**Files:**
- Modify: `packages/environment/src/worldEnvironment.ts` (types + `lerpColor` + `resolveLight` interpolation + `resolveExposure`)
- Modify: `packages/environment/src/WorldEnvironmentScene.tsx` (write `gl.toneMappingExposure`)
- Modify: `packages/environment/src/index.ts`
- Test: `packages/environment/src/__tests__/worldEnvironment.test.ts` (extend or create)

**Interfaces:**
- Produces:
  - `WorldEnvironmentPreset.exposure?: number | { day: number; night: number }`
  - `WorldEnvironmentPreset.lighting.moon?: DayNightValue<{ color: string; intensity: number }>`
  - `lerpColor(a: string, b: string, t: number): string`
  - `resolveExposure(preset: WorldEnvironmentPreset, daylight: number): number`
  - `resolveLight` now interpolates colors (no 0.5 hard-switch)

- [ ] **Step 1: Write the failing test** — `packages/environment/src/__tests__/worldEnvironment.test.ts` (add these; keep existing tests):

```ts
import { describe, expect, it } from 'vitest'
import { lerpColor, resolveExposure, resolveLight } from '../worldEnvironment'

describe('lerpColor', () => {
  it('returns endpoints at t=0 and t=1', () => {
    expect(lerpColor('#000000', '#ffffff', 0)).toBe('#000000')
    expect(lerpColor('#000000', '#ffffff', 1)).toBe('#ffffff')
  })
  it('interpolates the midpoint', () => {
    expect(lerpColor('#000000', '#ffffff', 0.5)).toBe('#808080')
  })
})

describe('resolveExposure', () => {
  it('defaults to 1 when no exposure set', () => {
    expect(resolveExposure({ lighting: { ambient: undefined, sun: undefined } } as any, 1)).toBe(1)
  })
  it('interpolates a day/night exposure by daylight', () => {
    const preset = { exposure: { day: 1.2, night: 0.6 } } as any
    expect(resolveExposure(preset, 1)).toBeCloseTo(1.2)
    expect(resolveExposure(preset, 0)).toBeCloseTo(0.6)
    expect(resolveExposure(preset, 0.5)).toBeCloseTo(0.9)
  })
  it('accepts a scalar exposure', () => {
    expect(resolveExposure({ exposure: 1.5 } as any, 0.3)).toBe(1.5)
  })
})

describe('resolveLight color interpolation', () => {
  it('interpolates sun color across daylight instead of hard-switching at 0.5', () => {
    const preset = {
      lighting: {
        sun: { day: { color: '#ffffff', intensity: 1 }, night: { color: '#000000', intensity: 0 } },
      },
    } as any
    // At exactly 0.5 the color must be the blend, not either endpoint.
    expect(resolveLight(preset, 0.5).sun.color).toBe('#808080')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @overworld-engine/environment test -- worldEnvironment`
Expected: FAIL — `lerpColor` / `resolveExposure` not exported; `resolveLight` still hard-switches (0.5 returns `#ffffff`).

- [ ] **Step 3: Implement** — in `packages/environment/src/worldEnvironment.ts`:

Extend the preset type:

```ts
export interface WorldEnvironmentPreset {
  // ...existing sky/fog/ground...
  lighting?: {
    ambient?: DayNightValue<{ color: string; intensity: number }>
    sun?: DayNightValue<{ color: string; intensity: number }> & { position?: Vec3; castShadow?: boolean }
    /** Distinct night light; falls back to the sun's night values when omitted. */
    moon?: DayNightValue<{ color: string; intensity: number }>
  }
  envMapIntensity?: number
  stars?: boolean | { count: number }
  /** Tone-mapping exposure, interpolated by daylight. Scalar or day/night pair. */
  exposure?: number | { day: number; night: number }
  /** Imperative day<->night transition duration (ms). Consumed by the component. */
  transitionDuration?: number
}
```

Add `lerpColor`, `resolveExposure`, and switch `resolveLight` colors to `lerpColor`:

```ts
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.replace(/(.)/g, '$1$1') : h, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
function toHex(n: number): string {
  return Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0')
}

/** Linearly interpolate two #rrggbb colors. t is clamped to [0,1]. */
export function lerpColor(a: string, b: string, t: number): string {
  const tt = Math.max(0, Math.min(1, t))
  const [ar, ag, ab] = hexToRgb(a)
  const [br, bg, bb] = hexToRgb(b)
  return `#${toHex(lerp(ar, br, tt))}${toHex(lerp(ag, bg, tt))}${toHex(lerp(ab, bb, tt))}`
}

/** Resolve tone-mapping exposure for the given daylight factor. Defaults to 1. */
export function resolveExposure(preset: WorldEnvironmentPreset, daylight: number): number {
  const e = preset.exposure
  if (e === undefined) return 1
  if (typeof e === 'number') return e
  return lerp(e.night, e.day, daylight)
}
```

Rewrite the `resolveLight` return so colors interpolate (replace the two `daylight >= 0.5 ? x.day.color : x.night.color` expressions):

```ts
export function resolveLight(preset: WorldEnvironmentPreset, daylight: number) {
  const amb = preset.lighting?.ambient
  const sun = preset.lighting?.sun
  const moon = preset.lighting?.moon
  return {
    ambient: amb
      ? { color: lerpColor(amb.night.color, amb.day.color, daylight), intensity: lerp(amb.night.intensity, amb.day.intensity, daylight) }
      : { color: '#ffffff', intensity: 0.5 },
    sun: sun
      ? {
          // Night side uses the moon light when provided, else the sun's night values.
          color: lerpColor(moon?.night.color ?? sun.night.color, sun.day.color, daylight),
          intensity: lerp(moon?.night.intensity ?? sun.night.intensity, sun.day.intensity, daylight),
          position: sun.position ?? ([10, 40, 10] as Vec3),
          castShadow: sun.castShadow ?? true,
        }
      : { color: '#ffffff', intensity: 1, position: [10, 40, 10] as Vec3, castShadow: true },
  }
}
```

- [ ] **Step 4: Write exposure to the GL context** in `WorldEnvironmentScene.tsx`. Get `gl` from `useThree` and set it in the same `useFrame` that updates lights:

```ts
import { resolveExposure } from './worldEnvironment'
// near existing: const scene = useThree((s) => s.scene)
const gl = useThree((s) => s.gl)

// inside useFrame(() => { ... after resolveLight ... }):
gl.toneMappingExposure = resolveExposure(resolved, d)
```

(Set once at mount too, mirroring the `light0` initialization, so the first frame is correct.)

- [ ] **Step 5: Export** — add `lerpColor`, `resolveExposure` to `packages/environment/src/index.ts`.

- [ ] **Step 6: Run tests + typecheck**

Run: `pnpm --filter @overworld-engine/environment test && pnpm --filter @overworld-engine/environment typecheck`
Expected: PASS — including the existing environment tests (verify none asserted the old 0.5 hard-switch; if one does, update it to expect the interpolated color, since the snap was the bug we're fixing).

- [ ] **Step 7: Commit**

```bash
git add packages/environment/src/worldEnvironment.ts packages/environment/src/WorldEnvironmentScene.tsx packages/environment/src/index.ts packages/environment/src/__tests__/worldEnvironment.test.ts
git commit -m "feat(environment): exposure + moon knobs, interpolated day/night colors"
```

> **Note on `transitionDuration`:** the field is added to the preset type in Step 3 so applications can declare it. Driving an imperative eased day↔night switch is an application-side concern (it toggles the preset); the engine exposes the knob and the interpolating `resolveLight`/`resolveExposure` that make a smooth switch possible. No separate `createPhaseTransition` runtime is needed for the continuous-`timeOfDay` path, which already interpolates every frame. (This narrows §5 of the spec: the color-snap fix + exposure interpolation deliver the smooth transition; the `createPhaseTransition` helper is dropped as YAGNI. Flag to reviewer.)

---

### Task 8: World streaming — cross-zone progress, real retry, priority buckets (#6, PARTIAL)

**Files:**
- Modify: `packages/loading/src/manifest.ts` (`preloadManifest` reports progress + returns a promise)
- Modify: `packages/loading/src/zoneStreaming.ts` (`orderZones` priority buckets)
- Modify: `packages/loading/src/sceneLoadStore.ts` (`aggregateZoneProgress`)
- Modify: `packages/loading/src/sceneLoad.tsx` (`useZoneStreaming` tracks per-zone progress + real `retry`)
- Modify: `packages/loading/src/index.ts`
- Test: `packages/loading/src/__tests__/zoneStreaming.test.ts`, `sceneLoadStore.test.ts` (extend)

**Interfaces:**
- Produces:
  - `orderZones(zones: ZoneManifest[], pos: Vec3): ZoneManifest[]` (priority bucket first, distance within)
  - `aggregateZoneProgress(zones: Array<{ progress: number; weight?: number }>): number`
  - `ZoneStreamingResult` gains `progress: number` and `retry(id: string): void`
  - `preloadManifest(manifest, options?)` where `options.onProgress?: (fraction: number) => void`

- [ ] **Step 1: Write the failing tests** — `packages/loading/src/__tests__/zoneStreaming.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { orderZones, type ZoneManifest } from '../zoneStreaming'

const z = (id: string, priority: number, cx: number): ZoneManifest => ({
  id,
  priority,
  manifest: {},
  bounds: { minX: cx, maxX: cx, minZ: 0, maxZ: 0 },
})

describe('orderZones (priority buckets, distance within)', () => {
  it('orders by priority bucket first, then nearest within a bucket', () => {
    const zones = [z('far-hi', 2, 100), z('near-lo', 1, 1), z('near-hi', 2, 2)]
    expect(orderZones(zones, [0, 0, 0]).map((x) => x.id)).toEqual(['near-hi', 'far-hi', 'near-lo'])
  })
})
```

Add to `packages/loading/src/__tests__/sceneLoadStore.test.ts`:

```ts
import { aggregateZoneProgress } from '../sceneLoadStore'

describe('aggregateZoneProgress', () => {
  it('averages per-zone progress', () => {
    expect(aggregateZoneProgress([{ progress: 1 }, { progress: 0 }])).toBe(0.5)
  })
  it('honors weights', () => {
    expect(aggregateZoneProgress([{ progress: 1, weight: 3 }, { progress: 0, weight: 1 }])).toBe(0.75)
  })
  it('is 1 for an empty list (nothing to load)', () => {
    expect(aggregateZoneProgress([])).toBe(1)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @overworld-engine/loading test`
Expected: FAIL — `orderZones` / `aggregateZoneProgress` not exported.

- [ ] **Step 3: Implement `orderZones`** — append to `packages/loading/src/zoneStreaming.ts` (keep `orderZonesByDistance` for back-compat):

```ts
/** Priority-bucket-first ordering (higher priority first), nearest-first within a bucket. */
export function orderZones(zones: ZoneManifest[], pos: Vec3): ZoneManifest[] {
  return [...zones].sort((a, b) => {
    if (a.priority !== b.priority) return b.priority - a.priority
    const da = a.bounds ? distanceToBounds(pos, a.bounds) : Infinity
    const db = b.bounds ? distanceToBounds(pos, b.bounds) : Infinity
    return da - db
  })
}
```

- [ ] **Step 4: Implement `aggregateZoneProgress`** — append to `packages/loading/src/sceneLoadStore.ts`:

```ts
/** Weighted-average progress across zones (0..1). Empty list = 1 (nothing to load). */
export function aggregateZoneProgress(zones: Array<{ progress: number; weight?: number }>): number {
  if (zones.length === 0) return 1
  let sum = 0
  let wsum = 0
  for (const z of zones) {
    const w = z.weight ?? 1
    sum += Math.max(0, Math.min(1, z.progress)) * w
    wsum += w
  }
  return wsum === 0 ? 1 : sum / wsum
}
```

- [ ] **Step 5: `preloadManifest` reports progress + returns a promise.** In `packages/loading/src/manifest.ts`, extend the options and settle on trackable assets. Add to `PreloadManifestOptions`:

```ts
export interface PreloadManifestOptions {
  categories?: AssetCategory[]
  /** Progress 0..1 as trackable (image/audio) assets settle. Models count as kicked-off. */
  onProgress?: (fraction: number) => void
}
```

Change the signature to return a promise and drive `onProgress` (honest limitation: `useGLTF.preload` exposes no completion event, so models count toward the total but resolve on kickoff; images/audio settle on their load/error events):

```ts
export function preloadManifest(
  manifest: AssetManifest,
  options?: PreloadManifestOptions,
): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve()
  const wants = (c: AssetCategory) => options?.categories === undefined || options.categories.includes(c)
  const fresh = (url: string) => (preloadedUrls.has(url) ? false : (preloadedUrls.add(url), true))

  const models = wants('models') ? (manifest.models ?? []).filter(fresh) : []
  const images = wants('images') ? (manifest.images ?? []).filter(fresh) : []
  const audio = wants('audio') ? (manifest.audio ?? []).filter(fresh) : []
  const total = models.length + images.length + audio.length
  if (total === 0) {
    options?.onProgress?.(1)
    return Promise.resolve()
  }

  let settled = 0
  const bump = () => options?.onProgress?.(settled / total)
  const track = (p: Promise<unknown>) =>
    p.then(() => { settled++; bump() }, () => { settled++; bump() })

  const jobs: Promise<unknown>[] = []
  for (const url of models) {
    useGLTF.preload(url)
    settled++ // models: no completion event; count as kicked-off
  }
  bump()
  for (const url of images) {
    jobs.push(track(new Promise<void>((res, rej) => {
      const img = new Image(); img.onload = () => res(); img.onerror = () => rej(); img.src = url
    })))
  }
  for (const url of audio) {
    jobs.push(track(new Promise<void>((res, rej) => {
      const a = new Audio(); a.preload = 'auto'
      a.oncanplaythrough = () => res(); a.onerror = () => rej(); a.src = url
    })))
  }
  return Promise.all(jobs).then(() => { options?.onProgress?.(1) })
}
```

- [ ] **Step 6: `useZoneStreaming` — per-zone progress + real retry.** In `packages/loading/src/sceneLoad.tsx`, switch to `orderZones`, track per-zone progress, expose aggregate `progress` and a `retry(id)` that re-triggers preload:

```ts
import { orderZones, type ZoneManifest } from './zoneStreaming'
import { aggregateZoneProgress, useSceneLoadStore } from './sceneLoadStore'

export interface ZoneStreamingResult {
  pending: string[]
  loaded: string[]
  failed: string[]
  progress: number
  retry: (id: string) => void
}

export function useZoneStreaming(
  zones: ZoneManifest[],
  playerPosRef: { current: Vec3 },
): ZoneStreamingResult {
  const [loaded, setLoaded] = useState<string[]>([])
  const [progressById, setProgressById] = useState<Record<string, number>>({})
  const startedRef = useRef<Set<string>>(new Set())

  const start = (z: ZoneManifest) => {
    if (startedRef.current.has(z.id)) return
    startedRef.current.add(z.id)
    preloadManifest(z.manifest, {
      onProgress: (f) => setProgressById((m) => ({ ...m, [z.id]: f })),
    })
      .then(() => setLoaded((l) => (l.includes(z.id) ? l : [...l, z.id])))
      .catch((err) =>
        useSceneLoadStore.getState().failZone(z.id, String((err as Error)?.message ?? err)),
      )
  }

  useEffect(() => {
    orderZones(zones, playerPosRef.current).forEach(start)
  }, [zones, playerPosRef])

  const retry = (id: string) => {
    startedRef.current.delete(id)
    setLoaded((l) => l.filter((x) => x !== id))
    setProgressById((m) => ({ ...m, [id]: 0 }))
    useSceneLoadStore.getState().retryZone(id)
    const z = zones.find((x) => x.id === id)
    if (z) start(z)
  }

  const pending = zones.map((z) => z.id).filter((id) => !loaded.includes(id))
  const failed = useSceneLoadStore((s) => s.errors).map((e) => e.zone).filter(Boolean) as string[]
  const progress = aggregateZoneProgress(zones.map((z) => ({ progress: progressById[z.id] ?? 0 })))
  return { pending, loaded, failed, progress, retry }
}
```

- [ ] **Step 7: Export** — add `orderZones`, `aggregateZoneProgress` to `packages/loading/src/index.ts`.

- [ ] **Step 8: Run tests + typecheck**

Run: `pnpm --filter @overworld-engine/loading test && pnpm --filter @overworld-engine/loading typecheck`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/loading/src/manifest.ts packages/loading/src/zoneStreaming.ts packages/loading/src/sceneLoadStore.ts packages/loading/src/sceneLoad.tsx packages/loading/src/index.ts packages/loading/src/__tests__/zoneStreaming.test.ts packages/loading/src/__tests__/sceneLoadStore.test.ts
git commit -m "feat(loading): cross-zone progress aggregation, priority buckets, real zone retry"
```

---

### Task 9: Radar heading inference + config-typed entities (#9, PARTIAL)

**Files:**
- Modify: `packages/minimap/src/radar.ts` (`inferHeading`, `createHeadingTracker`, `RadarEntity.kind?`)
- Modify: `packages/minimap/src/index.ts`
- Test: `packages/minimap/src/__tests__/radar.test.ts` (extend or create)

**Interfaces:**
- Produces:
  - `inferHeading(prev, next, lastHeading, deadZone?): number`
  - `createHeadingTracker(deadZone?): { update(pos): number; heading(): number }`
  - `RadarEntity` gains optional `kind?: EntityKind` so `BuildingConfig`/`NPCConfig` structurally satisfy it.

- [ ] **Step 1: Write the failing test** — `packages/minimap/src/__tests__/radar.test.ts` (add these):

```ts
import { describe, expect, it } from 'vitest'
import { inferHeading, createHeadingTracker, selectRadarMarkers } from '../radar'

describe('inferHeading', () => {
  it('points along +x movement (atan2(dx,dz) convention)', () => {
    // moving +x with no z → heading = atan2(1,0) = PI/2
    expect(inferHeading({ x: 0, z: 0 }, { x: 1, z: 0 }, 0)).toBeCloseTo(Math.PI / 2)
  })
  it('points along +z movement', () => {
    expect(inferHeading({ x: 0, z: 0 }, { x: 0, z: 1 }, 0)).toBeCloseTo(0)
  })
  it('retains the last heading when movement is within the dead zone', () => {
    expect(inferHeading({ x: 0, z: 0 }, { x: 0.0001, z: 0 }, 1.23, 0.01)).toBe(1.23)
  })
})

describe('createHeadingTracker', () => {
  it('holds heading while stationary, updates when it moves', () => {
    const t = createHeadingTracker()
    t.update({ x: 0, z: 0 })
    expect(t.update({ x: 0, z: 5 })).toBeCloseTo(0)
    expect(t.heading()).toBeCloseTo(0)
  })
})

describe('selectRadarMarkers accepts config-shaped entities', () => {
  it('takes objects with id/position (and optional kind/name) — BuildingConfig/NPCConfig shape', () => {
    const markers = selectRadarMarkers(
      {
        worldBounds: { minX: -50, maxX: 50, minZ: -50, maxZ: 50 },
        npcs: [{ id: 'guide', position: [0, 0, 5], name: 'Guide', kind: 'npc' } as any],
      },
      [0, 0, 0],
      0,
    )
    expect(markers[0]!.id).toBe('guide')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @overworld-engine/minimap test -- radar`
Expected: FAIL — `inferHeading` / `createHeadingTracker` not exported.

- [ ] **Step 3: Implement** — in `packages/minimap/src/radar.ts`:

Align the entity type so scene configs structurally satisfy it:

```ts
/**
 * Radar input entity. `BuildingConfig`/`NPCConfig` from `@overworld-engine/scene`
 * structurally satisfy this shape (id + position, optional name/kind) — pass
 * them directly; no import, no mapping.
 */
export interface RadarEntity { id: string; position: Vec3; name?: string; kind?: EntityKind }
```

Add heading inference (matches `toRadar`'s `atan2(dx, dz)` convention):

```ts
/**
 * Infer facing heading (radians) from movement between two positions. When the
 * step is smaller than `deadZone`, the previous heading is retained (avoids
 * spin when the player is stationary or nudging).
 */
export function inferHeading(
  prev: { x: number; z: number },
  next: { x: number; z: number },
  lastHeading: number,
  deadZone = 0.01,
): number {
  const dx = next.x - prev.x
  const dz = next.z - prev.z
  if (Math.hypot(dx, dz) < deadZone) return lastHeading
  return Math.atan2(dx, dz)
}

/** Stateful heading tracker: feed successive positions (e.g. from `player:moved`). */
export function createHeadingTracker(deadZone = 0.01): {
  update(pos: { x: number; z: number }): number
  heading(): number
} {
  let last: { x: number; z: number } | null = null
  let heading = 0
  return {
    update(pos) {
      if (last) heading = inferHeading(last, pos, heading, deadZone)
      last = pos
      return heading
    },
    heading: () => heading,
  }
}
```

Set `kind` on markers from the entity's own `kind` when present (fallback to the list kind) inside `selectRadarMarkers`'s `build`:

```ts
      return {
        id: e.id,
        kind: e.kind ?? kind,
        // ...unchanged...
      }
```

- [ ] **Step 4: Export** — add `inferHeading`, `createHeadingTracker` to `packages/minimap/src/index.ts`.

- [ ] **Step 5: Run tests + typecheck**

Run: `pnpm --filter @overworld-engine/minimap test -- radar && pnpm --filter @overworld-engine/minimap typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/minimap/src/radar.ts packages/minimap/src/index.ts packages/minimap/src/__tests__/radar.test.ts
git commit -m "feat(minimap): radar heading inference + config-shaped RadarEntity"
```

---

### Task 10: Changeset, docs, and full verify

**Files:**
- Create: `.changeset/world-production-v2-1.md`
- Modify: `docs/architecture.md` (coverage note)
- Modify: `docs/specs/2026-07-21-world-production-v2.1-design.md` (mark delivered, if desired)

- [ ] **Step 1: Full workspace verify**

Run: `pnpm -r typecheck && pnpm -r test`
Expected: PASS across all packages. Investigate and fix any failures before continuing.

- [ ] **Step 2: Confirm no new cross-package import edges** — none of `scene`/`environment`/`loading`/`minimap` should import another system package. Check:

Run: `grep -rE "@overworld-engine/(scene|environment|loading|minimap|input|audio|ai)" packages/{scene,environment,loading,minimap}/src | grep -v "@overworld-engine/core"`
Expected: no output (only `@overworld-engine/core` imports exist).

- [ ] **Step 3: Write the changeset** — `.changeset/world-production-v2-1.md`:

```markdown
---
"@overworld-engine/scene": minor
"@overworld-engine/environment": minor
"@overworld-engine/loading": minor
"@overworld-engine/minimap": minor
---

World-production v2.1 — close audited feedback gaps:

- scene: GPU-aware quality detection (software renderer → low), animated NPC
  contract (animationMap.idle, default idle playback, onModelReady), moving-NPC
  idle↔walk↔run, LOD clone disposal + quality-tier cap + nearest-first preload,
  decoration per-set LOD switching.
- environment: exposure + moon knobs, interpolated day/night colors (no 0.5 snap).
- loading: cross-zone progress aggregation, priority buckets, real zone retry.
- minimap: radar heading inference + config-shaped RadarEntity.
```

(The `fixed` group means every `@overworld-engine/*` package version bumps together to 2.1.0 regardless of which are listed; listing the four touched packages documents intent.)

- [ ] **Step 4: Update `docs/architecture.md`** — add a short note under the world-production section that the 8 v2.1 gaps are closed (one bullet each, mirroring the changeset).

- [ ] **Step 5: Commit**

```bash
git add .changeset/world-production-v2-1.md docs/architecture.md docs/specs/2026-07-21-world-production-v2.1-design.md
git commit -m "chore(changeset)+docs: world-production v2.1 gap closure"
```

---

## Self-Review

**Spec coverage** (each §):
- §4.1 #10 GPU detection → Task 1 ✓
- §4.2 #11 NPC animation contract → Tasks 2 (foundation) + 3 (BaseNPC) ✓
- §4.3 #5 moving-NPC anim state → Task 4 ✓
- §4.4 #4 LOD disposal/cap/preload → Task 5 ✓
- §4.5 #3 decoration LOD → Task 6 ✓
- §5 #2 environment exposure/moon/transition/color-lerp → Task 7 ✓ (with the documented narrowing: `createPhaseTransition` dropped as YAGNI; color-lerp + exposure interpolation deliver the smooth transition, `transitionDuration` field exposed for app-driven toggles — flagged to reviewer)
- §6 #6 loading progress/retry/priority → Task 8 ✓
- §7 #9 radar heading/config typing → Task 9 ✓
- §8 cross-cutting (no import edges, versioning, docs) → Task 10 ✓

**Type consistency:** `animStateRef: { current: 'idle'|'walk'|'run' }` is identical across BaseNPCProps (T3), AgentNPCProps (T4). `resolveClip` (T2) is consumed by `pickNpcClipName` (T3). `qualityToLodCap` (T5) consumes `QualityPresetName` (T1). `orderZones`/`aggregateZoneProgress` names match between definition (T8 steps 3-4) and use (T8 step 6). `RadarEntity.kind?` (T9) aligns with the marker's `kind` field.

**Placeholder scan:** no TBD/TODO; every code step carries complete code. The one deliberate scope narrowing (Task 7 `createPhaseTransition`) is documented with rationale, not left vague.

**Open reviewer flags:**
1. Task 7 drops `createPhaseTransition` (YAGNI) — confirm the color-lerp + exposure interpolation is an acceptable delivery of the "smooth transition" requirement.
2. Task 8 `preloadManifest` model progress is kickoff-counted (no drei completion event) — honest limitation documented; image/audio progress is real.
