# @overworld-engine/ui Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `@overworld-engine/ui` — headless game UI components (HUD primitives + renderers for the six headless engines) with a neutral base stylesheet and four CSS theme skins — plus an `examples/ui-gallery` demo app.

**Architecture:** One component set renders semantic DOM with stable `ow-*` classes and `data-ow-*` state attributes; themes are pure CSS files scoped under `.ow-root[data-ow-theme="…"]`, hot-swappable at runtime. Engine-bound components receive engines through duck-typed structural interfaces (never importing engine packages). Pure decision logic lives in plain functions (tested); React components are thin wiring (typecheck/build-verified only).

**Tech Stack:** TypeScript, React 18 (peer), zustand 5 (peer), tsup, vitest (node env), plain CSS with custom properties + inline SVG data-URIs.

Spec: `docs/superpowers/specs/2026-07-21-ui-package-design.md`

## Global Constraints

- **Zero cross-system-package imports:** `packages/ui/src` may import ONLY `@overworld-engine/core` among workspace packages (and in v1 it needs not even that; keep the dep for parity but no engine imports EVER). Verified by grep in final task.
- **No new test infra:** NO `@testing-library/*`, NO jsdom vitest environment, NO `renderHook`. Pure functions get vitest node tests; components are verified by `typecheck` + `build` only.
- **TS1149 case rule:** `forceConsistentCasingInFileNames` is on — never create `Foo.tsx` beside `foo.ts`. Component files are PascalCase in `src/components/`; logic files are distinct camelCase names (`zOrder.ts`, `gridSelectors.ts` — never `slot.ts` beside `Slot.tsx`).
- peerDependencies exactly: `"react": "^18.0.0"`, `"zustand": "^5.0.0"`. dependencies exactly: `"@overworld-engine/core": "workspace:*"`.
- Package version starts at `"2.0.0"` (fixed version group `@overworld-engine/*`).
- All CSS selectors are scoped under `.ow-root`. All stateful styling hooks are `data-ow-*` attributes.
- Every commit message uses conventional commits and ends with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Run all commands from repo root `/Users/noah/Work/idea/overworld` unless stated.

---

### Task 1: Package scaffold

**Files:**
- Create: `packages/ui/package.json`
- Create: `packages/ui/tsconfig.json`
- Create: `packages/ui/tsup.config.ts`
- Create: `packages/ui/src/index.ts`
- Create: `packages/ui/src/styles/styles.css` (placeholder comment only, filled in Task 16)
- Create: `packages/ui/src/styles/themes/xianxia.css`, `hextech.css`, `tactical.css`, `pixel.css` (placeholder comments, filled in Tasks 18–21)

**Interfaces:**
- Produces: buildable/publishable package skeleton; `build` copies CSS to `dist/styles.css` + `dist/themes/*`; subpath exports `./styles.css` and `./themes/*`.

- [ ] **Step 1: Write package.json**

```json
{
  "name": "@overworld-engine/ui",
  "version": "2.0.0",
  "description": "Headless game UI: HUD primitives, engine-bound components, four CSS theme skins",
  "keywords": ["overworld", "game", "rpg", "ui", "hud", "headless"],
  "homepage": "https://github.com/luzhenqian/overworld#readme",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    },
    "./styles.css": "./dist/styles.css",
    "./themes/*": "./dist/themes/*"
  },
  "files": ["dist"],
  "sideEffects": ["**/*.css"],
  "scripts": {
    "build": "tsup && cp src/styles/styles.css dist/styles.css && mkdir -p dist/themes && cp src/styles/themes/*.css dist/themes/",
    "typecheck": "tsc --noEmit",
    "test": "vitest run --passWithNoTests",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "@overworld-engine/core": "workspace:*"
  },
  "peerDependencies": {
    "react": "^18.0.0",
    "zustand": "^5.0.0"
  },
  "license": "MIT",
  "publishConfig": {
    "access": "public"
  },
  "repository": {
    "type": "git",
    "url": "https://github.com/luzhenqian/overworld.git",
    "directory": "packages/ui"
  }
}
```

- [ ] **Step 2: Write tsconfig.json and tsup.config.ts**

`packages/ui/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src"]
}
```

`packages/ui/tsup.config.ts`:

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

- [ ] **Step 3: Write placeholder entry + CSS files**

`packages/ui/src/index.ts`:

```ts
export {}
```

`packages/ui/src/styles/styles.css`:

```css
/* @overworld-engine/ui base layer — filled in later task */
```

Each of `packages/ui/src/styles/themes/{xianxia,hextech,tactical,pixel}.css`:

```css
/* theme skin — filled in later task */
```

- [ ] **Step 4: Install + verify**

Run: `pnpm install && pnpm --filter @overworld-engine/ui build && pnpm --filter @overworld-engine/ui typecheck && pnpm --filter @overworld-engine/ui test`
Expected: build produces `packages/ui/dist/index.js`, `dist/styles.css`, `dist/themes/xianxia.css` (+3 more); typecheck clean; vitest passes with no tests.

- [ ] **Step 5: Commit**

```bash
git add packages/ui pnpm-lock.yaml
git commit -m "feat(ui): scaffold @overworld-engine/ui package

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Structural engine interfaces (`engineTypes.ts`)

**Files:**
- Create: `packages/ui/src/engineTypes.ts`
- Modify: `packages/ui/src/index.ts`

**Interfaces:**
- Produces (consumed by every engine-bound component task): `ReadableStore<T>`, `DialogueEngineLike`, `QuestEngineLike`, `QuestDefinitionLike`, `ActiveQuestLike`, `InventoryEngineLike`, `ItemLike`, `TutorialEngineLike`, `AchievementsEngineLike`, `ToastLike`, `ToastStateLike`, `AlertLike`, `AlertStateLike` — exact declarations below.
- Design rule: these are hand-mirrored *supertypes* of the real engines (`DialogueEngine` in `packages/dialogue/src/engine.ts`, `QuestEngine` in `packages/quest/src/engine.ts`, `Inventory` in `packages/inventory/src/createInventory.ts`, `Tutorial` in `packages/tutorial/src/createTutorial.ts`, `Achievements` in `packages/achievements/src/createAchievements.ts`, `useToastStore`/`useAlertStore` in `packages/notifications/src`). Real instances must satisfy them structurally — compile-proven later by `examples/ui-gallery`. Do NOT import from those packages.

- [ ] **Step 1: Write engineTypes.ts** (types only — no test; verified by typecheck)

```ts
/**
 * Structural (duck-typed) views of the Overworld headless engines.
 *
 * The zero-cross-package-import rule forbids importing engine packages here;
 * instead these interfaces mirror the subset of each engine's shape that the
 * UI needs. Real engine instances satisfy them structurally (proven at
 * compile time by examples/ui-gallery, which passes real engines in).
 */

/** Read-only view of a zustand store — matches zustand's ReadonlyStoreApi. */
export interface ReadableStore<T> {
  getState(): T
  getInitialState(): T
  subscribe(listener: (state: T, prevState: T) => void): () => void
}

// ---------------------------------------------------------------- dialogue

export interface DialogueNodeLike {
  id: string
  speaker?: string
  text: string
}

export interface DialogueResponseLike {
  id: string
  text: string
}

export interface DialogueUiState {
  activeDialogue: { dialogueId: string; npcId?: string } | null
  currentNode: DialogueNodeLike | null
  availableResponses: readonly DialogueResponseLike[]
}

/** Mirrors @overworld-engine/dialogue's DialogueEngine. */
export interface DialogueEngineLike {
  store: ReadableStore<DialogueUiState>
  advance(): boolean
  choose(responseId: string): boolean
  end(): void
}

// ------------------------------------------------------------------- quest

export interface ObjectiveLike {
  id: string
  description?: string
  target: number
  hidden?: boolean
}

export interface QuestDefinitionLike {
  id: string
  title?: string
  description?: string
  category?: string
  objectives: readonly ObjectiveLike[]
}

export interface ActiveQuestLike {
  questId: string
  startedAt: number
  objectives: Record<string, { current: number; completed: boolean }>
}

export interface QuestUiState {
  definitions: Record<string, QuestDefinitionLike>
  active: Record<string, ActiveQuestLike>
  completed: readonly string[]
}

/** Mirrors @overworld-engine/quest's QuestEngine (read side). */
export interface QuestEngineLike {
  store: ReadableStore<QuestUiState>
}

// --------------------------------------------------------------- inventory

export interface ItemLike {
  id: string
  name: string
  description?: string
  icon?: string
  category?: string
}

export interface InventoryUiState {
  slots: readonly { itemId: string; quantity: number }[]
}

/** Mirrors @overworld-engine/inventory's Inventory. */
export interface InventoryEngineLike {
  store: ReadableStore<InventoryUiState>
  getDefinition(itemId: string): ItemLike | undefined
  use(itemId: string): { success: boolean }
  remove(itemId: string, quantity?: number): boolean
}

// ---------------------------------------------------------------- tutorial

export interface TutorialStepLike {
  id: string
  content?: string
  target?: string
}

export interface TutorialUiState {
  activeTutorialId: string | null
  stepIndex: number
}

/** Mirrors @overworld-engine/tutorial's Tutorial. */
export interface TutorialEngineLike {
  store: ReadableStore<TutorialUiState>
  currentStep(): TutorialStepLike | null
  next(): void
  skip(): void
}

// ------------------------------------------------------------ achievements

export interface AchievementLike {
  id: string
  title?: string
  description?: string
  icon?: string
}

export interface AchievementsUiState {
  unlocked: Record<string, number>
}

/** Mirrors @overworld-engine/achievements' Achievements. */
export interface AchievementsEngineLike {
  store: ReadableStore<AchievementsUiState>
  getDefinition(id: string): AchievementLike | undefined
}

// ----------------------------------------------------------- notifications

export type ToastVariantLike = 'info' | 'success' | 'warning' | 'error'

export interface ToastLike {
  id: string
  message: unknown
  variant: ToastVariantLike
  icon?: string
}

/** Mirrors the state of @overworld-engine/notifications' useToastStore. */
export interface ToastStateLike {
  toasts: readonly ToastLike[]
  dismiss(id: string): void
}

export interface AlertLike {
  id: string
  kind: 'alert' | 'confirm'
  title?: unknown
  message: unknown
  confirmLabel?: string
  cancelLabel?: string
}

/** Mirrors the state of @overworld-engine/notifications' useAlertStore. */
export interface AlertStateLike {
  current: AlertLike | null
  resolveCurrent(result?: boolean): void
}
```

- [ ] **Step 2: Re-export from index.ts** (replace `export {}`)

```ts
export * from './engineTypes'
```

- [ ] **Step 3: Verify**

Run: `pnpm --filter @overworld-engine/ui typecheck && pnpm --filter @overworld-engine/ui build`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src
git commit -m "feat(ui): structural engine interfaces (duck-typed engine views)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Window z-order logic + `useUiStore` (TDD)

**Files:**
- Create: `packages/ui/src/zOrder.ts`
- Create: `packages/ui/src/uiStore.ts`
- Test: `packages/ui/src/__tests__/zOrder.test.ts`
- Modify: `packages/ui/src/index.ts`

**Interfaces:**
- Produces: `WindowEntry { open: boolean; z: number }`, `WindowsState { windows: Record<string, WindowEntry>; topZ: number }`, pure reducers `openWindowState/closeWindowState/toggleWindowState/focusWindowState(state, id): WindowsState`, `anyWindowOpen(windows): boolean`, `BASE_Z = 10`; singleton hook `useUiStore` with state `{ windows, topZ, openWindow(id), closeWindow(id), toggleWindow(id), focusWindow(id) }`, selector `selectAnyWindowOpen`.
- Consumed by: Task 10 (GameWindow), Tasks 12/13 (windows), gallery.

- [ ] **Step 1: Write the failing tests**

`packages/ui/src/__tests__/zOrder.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import {
  BASE_Z,
  anyWindowOpen,
  closeWindowState,
  focusWindowState,
  openWindowState,
  toggleWindowState,
  type WindowsState,
} from '../zOrder'

const empty: WindowsState = { windows: {}, topZ: BASE_Z }

describe('zOrder reducers', () => {
  test('openWindowState opens with increasing z', () => {
    const a = openWindowState(empty, 'inv')
    const b = openWindowState(a, 'quest')
    expect(a.windows.inv).toEqual({ open: true, z: BASE_Z + 1 })
    expect(b.windows.quest).toEqual({ open: true, z: BASE_Z + 2 })
    expect(b.topZ).toBe(BASE_Z + 2)
  })

  test('openWindowState re-opening an open window refocuses it', () => {
    const s = openWindowState(openWindowState(empty, 'a'), 'b')
    const re = openWindowState(s, 'a')
    expect(re.windows.a.z).toBeGreaterThan(re.windows.b.z)
  })

  test('closeWindowState keeps entry but marks closed', () => {
    const s = closeWindowState(openWindowState(empty, 'a'), 'a')
    expect(s.windows.a.open).toBe(false)
  })

  test('closeWindowState on unknown id is a no-op', () => {
    expect(closeWindowState(empty, 'ghost')).toBe(empty)
  })

  test('toggleWindowState opens then closes', () => {
    const open = toggleWindowState(empty, 'a')
    expect(open.windows.a.open).toBe(true)
    const closed = toggleWindowState(open, 'a')
    expect(closed.windows.a.open).toBe(false)
  })

  test('focusWindowState bumps only open windows', () => {
    const s = openWindowState(openWindowState(empty, 'a'), 'b')
    const f = focusWindowState(s, 'a')
    expect(f.windows.a.z).toBe(f.topZ)
    expect(f.windows.a.z).toBeGreaterThan(f.windows.b.z)
    const closed = closeWindowState(f, 'a')
    expect(focusWindowState(closed, 'a')).toBe(closed)
  })

  test('anyWindowOpen', () => {
    expect(anyWindowOpen(empty.windows)).toBe(false)
    expect(anyWindowOpen(openWindowState(empty, 'a').windows)).toBe(true)
    expect(anyWindowOpen(closeWindowState(openWindowState(empty, 'a'), 'a').windows)).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @overworld-engine/ui test`
Expected: FAIL — cannot resolve `../zOrder`.

- [ ] **Step 3: Implement zOrder.ts**

```ts
/** Base z-index for game windows (HUD overlay sits at CSS z-index 100). */
export const BASE_Z = 10

export interface WindowEntry {
  open: boolean
  z: number
}

export interface WindowsState {
  windows: Record<string, WindowEntry>
  topZ: number
}

/** Open (or refocus) a window, assigning it the next topmost z. */
export function openWindowState(state: WindowsState, id: string): WindowsState {
  const topZ = state.topZ + 1
  return { topZ, windows: { ...state.windows, [id]: { open: true, z: topZ } } }
}

/** Mark a window closed. No-op for unknown ids. */
export function closeWindowState(state: WindowsState, id: string): WindowsState {
  const entry = state.windows[id]
  if (!entry || !entry.open) return state
  return { ...state, windows: { ...state.windows, [id]: { ...entry, open: false } } }
}

/** Open if closed/unknown, close if open. */
export function toggleWindowState(state: WindowsState, id: string): WindowsState {
  return state.windows[id]?.open ? closeWindowState(state, id) : openWindowState(state, id)
}

/** Bring an open window to the front. No-op for closed/unknown ids. */
export function focusWindowState(state: WindowsState, id: string): WindowsState {
  const entry = state.windows[id]
  if (!entry?.open) return state
  const topZ = state.topZ + 1
  return { topZ, windows: { ...state.windows, [id]: { ...entry, z: topZ } } }
}

/** True when at least one window is open (host wires this to input layers). */
export function anyWindowOpen(windows: Record<string, WindowEntry>): boolean {
  return Object.values(windows).some((w) => w.open)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @overworld-engine/ui test`
Expected: PASS (7 tests).

- [ ] **Step 5: Implement uiStore.ts** (thin zustand wiring over tested reducers — no extra tests)

```ts
import { create } from 'zustand'
import {
  BASE_Z,
  anyWindowOpen,
  closeWindowState,
  focusWindowState,
  openWindowState,
  toggleWindowState,
  type WindowEntry,
} from './zOrder'

interface UiStoreState {
  windows: Record<string, WindowEntry>
  topZ: number
  openWindow: (id: string) => void
  closeWindow: (id: string) => void
  toggleWindow: (id: string) => void
  focusWindow: (id: string) => void
}

/**
 * Process-unique UI chrome state (window open/close registry + z-order).
 * Module-level singleton, matching the repo's infra/UI convention.
 */
export const useUiStore = create<UiStoreState>()((set) => ({
  windows: {},
  topZ: BASE_Z,
  openWindow: (id) => set((s) => openWindowState(s, id)),
  closeWindow: (id) => set((s) => closeWindowState(s, id)),
  toggleWindow: (id) => set((s) => toggleWindowState(s, id)),
  focusWindow: (id) => set((s) => focusWindowState(s, id)),
}))

/** Selector: is any game window open? Hosts use this to mute gameplay input. */
export const selectAnyWindowOpen = (s: { windows: Record<string, WindowEntry> }): boolean =>
  anyWindowOpen(s.windows)
```

- [ ] **Step 6: Export from index.ts** (append)

```ts
export * from './zOrder'
export { useUiStore, selectAnyWindowOpen } from './uiStore'
```

- [ ] **Step 7: Verify + commit**

Run: `pnpm --filter @overworld-engine/ui test && pnpm --filter @overworld-engine/ui typecheck`
Expected: PASS / clean.

```bash
git add packages/ui/src
git commit -m "feat(ui): window z-order reducers + useUiStore singleton

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Typewriter logic + `useTypewriter` (TDD)

**Files:**
- Create: `packages/ui/src/typewriterLogic.ts`
- Create: `packages/ui/src/useTypewriter.ts`
- Test: `packages/ui/src/__tests__/typewriterLogic.test.ts`
- Modify: `packages/ui/src/index.ts`

**Interfaces:**
- Produces: pure `advanceReveal(revealed: number, textLength: number, step?: number): { revealed: number; done: boolean }`; hook `useTypewriter(text: string, charsPerSecond?: number): { output: string; done: boolean; skip(): void }`.
- Consumed by: Task 11 (DialogueBox).

- [ ] **Step 1: Write the failing tests**

`packages/ui/src/__tests__/typewriterLogic.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { advanceReveal } from '../typewriterLogic'

describe('advanceReveal', () => {
  test('advances by step and clamps at length', () => {
    expect(advanceReveal(0, 5)).toEqual({ revealed: 1, done: false })
    expect(advanceReveal(4, 5)).toEqual({ revealed: 5, done: true })
    expect(advanceReveal(4, 5, 3)).toEqual({ revealed: 5, done: true })
  })

  test('empty text is immediately done', () => {
    expect(advanceReveal(0, 0)).toEqual({ revealed: 0, done: true })
  })

  test('already-complete stays done', () => {
    expect(advanceReveal(5, 5)).toEqual({ revealed: 5, done: true })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @overworld-engine/ui test`
Expected: FAIL — cannot resolve `../typewriterLogic`.

- [ ] **Step 3: Implement typewriterLogic.ts**

```ts
/** One tick of a typewriter reveal: advance `revealed` by `step`, clamped. */
export function advanceReveal(
  revealed: number,
  textLength: number,
  step = 1,
): { revealed: number; done: boolean } {
  const next = Math.min(revealed + step, textLength)
  return { revealed: next, done: next >= textLength }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @overworld-engine/ui test`
Expected: PASS.

- [ ] **Step 5: Implement useTypewriter.ts** (thin effect wiring — untested by convention)

```ts
import { useEffect, useState } from 'react'
import { advanceReveal } from './typewriterLogic'

/**
 * Reveal `text` one character at a time. Resets when `text` changes.
 * `skip()` reveals everything at once.
 */
export function useTypewriter(
  text: string,
  charsPerSecond = 40,
): { output: string; done: boolean; skip: () => void } {
  const [revealed, setRevealed] = useState(0)

  useEffect(() => {
    setRevealed(0)
    if (!text) return
    const interval = setInterval(
      () => {
        setRevealed((r) => {
          const next = advanceReveal(r, text.length)
          if (next.done) clearInterval(interval)
          return next.revealed
        })
      },
      Math.max(1000 / charsPerSecond, 16),
    )
    return () => clearInterval(interval)
  }, [text, charsPerSecond])

  return {
    output: text.slice(0, revealed),
    done: revealed >= text.length,
    skip: () => setRevealed(text.length),
  }
}
```

- [ ] **Step 6: Export, verify, commit** (append to index.ts)

```ts
export { advanceReveal } from './typewriterLogic'
export { useTypewriter } from './useTypewriter'
```

Run: `pnpm --filter @overworld-engine/ui test && pnpm --filter @overworld-engine/ui typecheck`
Expected: PASS / clean.

```bash
git add packages/ui/src
git commit -m "feat(ui): typewriter reveal logic + useTypewriter hook

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Tooltip positioning logic (TDD)

**Files:**
- Create: `packages/ui/src/tooltipPosition.ts`
- Test: `packages/ui/src/__tests__/tooltipPosition.test.ts`
- Modify: `packages/ui/src/index.ts`

**Interfaces:**
- Produces: `Rect { x, y, width, height }`, `Size { width, height }`, `positionTooltip(anchor: Rect, tip: Size, viewport: Size, offset?: number): { x: number; y: number; placement: 'above' | 'below' }` — prefers centered-above, flips below when it would clip the top, clamps x into the viewport with a 4px margin.
- Consumed by: Task 9 (Tooltip component).

- [ ] **Step 1: Write the failing tests**

`packages/ui/src/__tests__/tooltipPosition.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { positionTooltip } from '../tooltipPosition'

const viewport = { width: 800, height: 600 }

describe('positionTooltip', () => {
  test('prefers centered above the anchor', () => {
    const p = positionTooltip({ x: 400, y: 300, width: 40, height: 40 }, { width: 100, height: 50 }, viewport, 8)
    expect(p).toEqual({ x: 370, y: 242, placement: 'above' })
  })

  test('flips below when clipped at the top', () => {
    const p = positionTooltip({ x: 400, y: 20, width: 40, height: 40 }, { width: 100, height: 50 }, viewport, 8)
    expect(p.placement).toBe('below')
    expect(p.y).toBe(68)
  })

  test('clamps x to the viewport with 4px margin', () => {
    const left = positionTooltip({ x: 0, y: 300, width: 20, height: 20 }, { width: 100, height: 40 }, viewport)
    expect(left.x).toBe(4)
    const right = positionTooltip({ x: 790, y: 300, width: 20, height: 20 }, { width: 100, height: 40 }, viewport)
    expect(right.x).toBe(800 - 100 - 4)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @overworld-engine/ui test`
Expected: FAIL — cannot resolve `../tooltipPosition`.

- [ ] **Step 3: Implement tooltipPosition.ts**

```ts
export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface Size {
  width: number
  height: number
}

/**
 * Position a tooltip relative to an anchor rect (viewport coordinates).
 * Prefers centered-above; flips below when the top would clip; clamps
 * horizontally with a 4px margin.
 */
export function positionTooltip(
  anchor: Rect,
  tip: Size,
  viewport: Size,
  offset = 8,
): { x: number; y: number; placement: 'above' | 'below' } {
  const rawX = anchor.x + anchor.width / 2 - tip.width / 2
  const x = Math.min(Math.max(rawX, 4), viewport.width - tip.width - 4)
  const above = anchor.y - offset - tip.height
  if (above >= 0) return { x, y: above, placement: 'above' }
  return { x, y: anchor.y + anchor.height + offset, placement: 'below' }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @overworld-engine/ui test`
Expected: PASS.

- [ ] **Step 5: Export, verify, commit** (append to index.ts)

```ts
export { positionTooltip } from './tooltipPosition'
export type { Rect, Size } from './tooltipPosition'
```

```bash
pnpm --filter @overworld-engine/ui typecheck
git add packages/ui/src
git commit -m "feat(ui): tooltip positioning logic

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Engine display selectors (TDD)

**Files:**
- Create: `packages/ui/src/questSelectors.ts`
- Create: `packages/ui/src/inventorySelectors.ts`
- Create: `packages/ui/src/achievementDiff.ts`
- Create: `packages/ui/src/highlightBox.ts`
- Test: `packages/ui/src/__tests__/questSelectors.test.ts`
- Test: `packages/ui/src/__tests__/inventorySelectors.test.ts`
- Test: `packages/ui/src/__tests__/achievementDiff.test.ts`
- Test: `packages/ui/src/__tests__/highlightBox.test.ts`
- Modify: `packages/ui/src/index.ts`

**Interfaces:**
- Consumes: `QuestDefinitionLike`, `ActiveQuestLike`, `ItemLike` from Task 2; `Rect` from Task 5.
- Produces:
  - `TrackerObjectiveRow { id, text, current, target, completed }`, `TrackerRow { questId, title, objectives: TrackerObjectiveRow[] }`, `trackerRows(definitions, active, max?): TrackerRow[]`
  - `SlotRow { itemId, quantity, item?: ItemLike }`, `slotRows(slots, lookup): SlotRow[]`
  - `newlyUnlocked(prev: Record<string, number>, next: Record<string, number>): string[]`
  - `highlightBox(target: Rect, padding?): { left, top, width, height }`
- Consumed by: Tasks 12, 13, 15.

- [ ] **Step 1: Write the failing tests**

`packages/ui/src/__tests__/questSelectors.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { trackerRows } from '../questSelectors'
import type { ActiveQuestLike, QuestDefinitionLike } from '../engineTypes'

const defs: Record<string, QuestDefinitionLike> = {
  herbs: {
    id: 'herbs',
    title: 'Gather Herbs',
    objectives: [
      { id: 'pick', description: 'Pick herbs', target: 3 },
      { id: 'secret', target: 1, hidden: true },
    ],
  },
  rats: { id: 'rats', objectives: [{ id: 'kill', target: 5 }] },
}

const active: Record<string, ActiveQuestLike> = {
  rats: { questId: 'rats', startedAt: 200, objectives: { kill: { current: 2, completed: false } } },
  herbs: {
    questId: 'herbs',
    startedAt: 100,
    objectives: { pick: { current: 3, completed: true }, secret: { current: 0, completed: false } },
  },
}

describe('trackerRows', () => {
  test('orders by startedAt, falls back titles/descriptions to ids, hides hidden objectives', () => {
    const rows = trackerRows(defs, active)
    expect(rows.map((r) => r.questId)).toEqual(['herbs', 'rats'])
    expect(rows[0].title).toBe('Gather Herbs')
    expect(rows[0].objectives).toEqual([
      { id: 'pick', text: 'Pick herbs', current: 3, target: 3, completed: true },
    ])
    expect(rows[1].title).toBe('rats')
    expect(rows[1].objectives[0].text).toBe('kill')
  })

  test('caps at max and skips actives without definitions', () => {
    const orphan: Record<string, ActiveQuestLike> = {
      ...active,
      ghost: { questId: 'ghost', startedAt: 50, objectives: {} },
    }
    expect(trackerRows(defs, orphan, 1)).toHaveLength(1)
    expect(trackerRows(defs, orphan, 1)[0].questId).toBe('herbs')
  })

  test('objective progress missing from active state defaults to 0', () => {
    const partial: Record<string, ActiveQuestLike> = {
      herbs: { questId: 'herbs', startedAt: 1, objectives: {} },
    }
    expect(trackerRows(defs, partial)[0].objectives[0]).toEqual({
      id: 'pick',
      text: 'Pick herbs',
      current: 0,
      target: 3,
      completed: false,
    })
  })
})
```

`packages/ui/src/__tests__/inventorySelectors.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { slotRows } from '../inventorySelectors'
import type { ItemLike } from '../engineTypes'

const items: Record<string, ItemLike> = {
  potion: { id: 'potion', name: 'Potion', icon: '🧪' },
}
const lookup = (id: string) => items[id]

describe('slotRows', () => {
  test('joins slots with definitions; unknown items keep undefined item', () => {
    const rows = slotRows(
      [
        { itemId: 'potion', quantity: 3 },
        { itemId: 'mystery', quantity: 1 },
      ],
      lookup,
    )
    expect(rows[0]).toEqual({ itemId: 'potion', quantity: 3, item: items.potion })
    expect(rows[1]).toEqual({ itemId: 'mystery', quantity: 1, item: undefined })
  })

  test('empty inventory produces no rows', () => {
    expect(slotRows([], lookup)).toEqual([])
  })
})
```

`packages/ui/src/__tests__/achievementDiff.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { newlyUnlocked } from '../achievementDiff'

describe('newlyUnlocked', () => {
  test('returns ids present in next but not prev', () => {
    expect(newlyUnlocked({ a: 1 }, { a: 1, b: 2, c: 3 })).toEqual(['b', 'c'])
  })

  test('no changes yields empty array', () => {
    expect(newlyUnlocked({ a: 1 }, { a: 1 })).toEqual([])
    expect(newlyUnlocked({}, {})).toEqual([])
  })
})
```

`packages/ui/src/__tests__/highlightBox.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { highlightBox } from '../highlightBox'

describe('highlightBox', () => {
  test('pads the target rect on all sides', () => {
    expect(highlightBox({ x: 100, y: 50, width: 40, height: 20 }, 6)).toEqual({
      left: 94,
      top: 44,
      width: 52,
      height: 32,
    })
  })

  test('default padding is 6', () => {
    expect(highlightBox({ x: 10, y: 10, width: 10, height: 10 }).width).toBe(22)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @overworld-engine/ui test`
Expected: FAIL — four unresolved modules.

- [ ] **Step 3: Implement the four modules**

`packages/ui/src/questSelectors.ts`:

```ts
import type { ActiveQuestLike, QuestDefinitionLike } from './engineTypes'

export interface TrackerObjectiveRow {
  id: string
  text: string
  current: number
  target: number
  completed: boolean
}

export interface TrackerRow {
  questId: string
  title: string
  objectives: TrackerObjectiveRow[]
}

/**
 * Join active quests with their definitions into display rows, oldest quest
 * first. Hidden objectives are omitted; actives without a definition are
 * skipped; missing progress defaults to 0.
 */
export function trackerRows(
  definitions: Record<string, QuestDefinitionLike>,
  active: Record<string, ActiveQuestLike>,
  max = Infinity,
): TrackerRow[] {
  return Object.values(active)
    .sort((a, b) => a.startedAt - b.startedAt)
    .flatMap((quest) => {
      const def = definitions[quest.questId]
      if (!def) return []
      return [
        {
          questId: quest.questId,
          title: def.title ?? def.id,
          objectives: def.objectives
            .filter((o) => !o.hidden)
            .map((o) => {
              const progress = quest.objectives[o.id]
              return {
                id: o.id,
                text: o.description ?? o.id,
                current: progress?.current ?? 0,
                target: o.target,
                completed: progress?.completed ?? false,
              }
            }),
        },
      ]
    })
    .slice(0, max)
}
```

`packages/ui/src/inventorySelectors.ts`:

```ts
import type { ItemLike } from './engineTypes'

export interface SlotRow {
  itemId: string
  quantity: number
  item?: ItemLike
}

/** Join inventory slots with item definitions for display. */
export function slotRows(
  slots: readonly { itemId: string; quantity: number }[],
  lookup: (itemId: string) => ItemLike | undefined,
): SlotRow[] {
  return slots.map((slot) => ({ itemId: slot.itemId, quantity: slot.quantity, item: lookup(slot.itemId) }))
}
```

`packages/ui/src/achievementDiff.ts`:

```ts
/** Ids unlocked in `next` that were not yet unlocked in `prev`. */
export function newlyUnlocked(
  prev: Record<string, number>,
  next: Record<string, number>,
): string[] {
  return Object.keys(next).filter((id) => !(id in prev))
}
```

`packages/ui/src/highlightBox.ts`:

```ts
import type { Rect } from './tooltipPosition'

/** Expand a measured target rect by `padding` for the tutorial spotlight. */
export function highlightBox(
  target: Rect,
  padding = 6,
): { left: number; top: number; width: number; height: number } {
  return {
    left: target.x - padding,
    top: target.y - padding,
    width: target.width + padding * 2,
    height: target.height + padding * 2,
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @overworld-engine/ui test`
Expected: PASS (all suites).

- [ ] **Step 5: Export, verify, commit** (append to index.ts)

```ts
export { trackerRows } from './questSelectors'
export type { TrackerObjectiveRow, TrackerRow } from './questSelectors'
export { slotRows } from './inventorySelectors'
export type { SlotRow } from './inventorySelectors'
export { newlyUnlocked } from './achievementDiff'
export { highlightBox } from './highlightBox'
```

```bash
pnpm --filter @overworld-engine/ui typecheck
git add packages/ui/src
git commit -m "feat(ui): pure display selectors for quest/inventory/achievements/tutorial

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Core presentational components — Hud, Panel, Button, IconButton, Modal

Components are thin presentational wiring: no unit tests (repo convention); verified by typecheck + build.

**Files:**
- Create: `packages/ui/src/components/Hud.tsx`
- Create: `packages/ui/src/components/Panel.tsx`
- Create: `packages/ui/src/components/Button.tsx`
- Create: `packages/ui/src/components/Modal.tsx`
- Modify: `packages/ui/src/index.ts`

**Interfaces:**
- Produces:
  - `Hud({ theme?, className?, children? })` — renders `.ow-root.ow-hud[data-ow-theme]`; compound `Hud.Anchor({ anchor: HudAnchorPosition, children? })` with `HudAnchorPosition = 'top-left' | 'top' | 'top-right' | 'left' | 'center' | 'right' | 'bottom-left' | 'bottom' | 'bottom-right'`.
  - `Panel({ title?, onClose?, children?, ...divProps })`
  - `Button({ variant?: 'primary' | 'ghost' | 'danger', ...buttonProps })`, `IconButton({ label: string, ...buttonProps })`
  - `Modal({ open, onDismiss?, children? })`
- Consumed by: Tasks 10–15, gallery.

- [ ] **Step 1: Write Hud.tsx**

```tsx
import type { ReactNode } from 'react'

export type HudAnchorPosition =
  | 'top-left'
  | 'top'
  | 'top-right'
  | 'left'
  | 'center'
  | 'right'
  | 'bottom-left'
  | 'bottom'
  | 'bottom-right'

export interface HudProps {
  /** Active theme skin; sets `data-ow-theme` for the CSS theme layer. */
  theme?: string
  className?: string
  children?: ReactNode
}

function HudRoot({ theme, className, children }: HudProps) {
  return (
    <div
      className={className ? `ow-root ow-hud ${className}` : 'ow-root ow-hud'}
      data-ow-theme={theme}
    >
      {children}
    </div>
  )
}

export interface HudAnchorProps {
  anchor: HudAnchorPosition
  children?: ReactNode
}

function HudAnchor({ anchor, children }: HudAnchorProps) {
  return (
    <div className="ow-hud-anchor" data-ow-anchor={anchor}>
      {children}
    </div>
  )
}

/**
 * Fullscreen HUD overlay. The overlay itself is pointer-transparent;
 * children of anchors receive pointer events. Mount inside a
 * `position: relative` container wrapping the game canvas.
 */
export const Hud = Object.assign(HudRoot, { Anchor: HudAnchor })
```

- [ ] **Step 2: Write Panel.tsx**

```tsx
import type { HTMLAttributes, ReactNode } from 'react'

export interface PanelProps extends HTMLAttributes<HTMLElement> {
  title?: ReactNode
  /** Renders a close button in the title bar when provided. */
  onClose?: () => void
}

/** Themed surface: the base chrome for windows, dialogs and HUD cards. */
export function Panel({ title, onClose, children, className, ...rest }: PanelProps) {
  return (
    <section className={className ? `ow-panel ${className}` : 'ow-panel'} {...rest}>
      {(title != null || onClose) && (
        <header className="ow-panel-title">
          <span className="ow-panel-title-text">{title}</span>
          {onClose && (
            <button type="button" className="ow-panel-close" aria-label="Close" onClick={onClose}>
              ×
            </button>
          )}
        </header>
      )}
      <div className="ow-panel-body">{children}</div>
    </section>
  )
}
```

- [ ] **Step 3: Write Button.tsx**

```tsx
import type { ButtonHTMLAttributes } from 'react'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost' | 'danger'
}

export function Button({ variant = 'primary', className, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      className={className ? `ow-button ${className}` : 'ow-button'}
      data-ow-variant={variant}
      {...rest}
    />
  )
}

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Accessible name — required because the content is icon-only. */
  label: string
}

export function IconButton({ label, className, ...rest }: IconButtonProps) {
  return (
    <button
      type="button"
      className={className ? `ow-icon-button ${className}` : 'ow-icon-button'}
      aria-label={label}
      {...rest}
    />
  )
}
```

- [ ] **Step 4: Write Modal.tsx**

```tsx
import type { ReactNode } from 'react'

export interface ModalProps {
  open: boolean
  /** Called on backdrop click. Omit to make the modal non-dismissable. */
  onDismiss?: () => void
  children?: ReactNode
}

/** Centered modal layer. Renders nothing when closed. */
export function Modal({ open, onDismiss, children }: ModalProps) {
  if (!open) return null
  return (
    <div
      className="ow-modal-backdrop"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onDismiss?.()
      }}
    >
      <div className="ow-modal" role="dialog" aria-modal="true">
        {children}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Export, verify, commit** (append to index.ts)

```ts
export { Hud } from './components/Hud'
export type { HudProps, HudAnchorProps, HudAnchorPosition } from './components/Hud'
export { Panel } from './components/Panel'
export type { PanelProps } from './components/Panel'
export { Button, IconButton } from './components/Button'
export type { ButtonProps, IconButtonProps } from './components/Button'
export { Modal } from './components/Modal'
export type { ModalProps } from './components/Modal'
```

Run: `pnpm --filter @overworld-engine/ui typecheck && pnpm --filter @overworld-engine/ui build`
Expected: clean.

```bash
git add packages/ui/src
git commit -m "feat(ui): Hud, Panel, Button, IconButton, Modal primitives

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: Bar, Slot, SlotGrid, Hotbar

**Files:**
- Create: `packages/ui/src/components/Bar.tsx`
- Create: `packages/ui/src/components/SlotGrid.tsx`
- Create: `packages/ui/src/components/Hotbar.tsx`
- Modify: `packages/ui/src/index.ts`

**Interfaces:**
- Produces:
  - `Bar({ value, max, variant?: 'hp' | 'mp' | 'xp' | 'generic', label?, showValue? })` — dual-fill markup (`.ow-bar-ghost` + `.ow-bar-fill`) whose differing CSS transition speeds produce the damage-lag trail.
  - `Slot({ icon?, quantity?, rarity?, keybind?, selected?, ...buttonProps })`, `SlotGrid({ columns?, children? })` (sets `--ow-columns`).
  - `Hotbar({ children? })` — `role="toolbar"` row; consumers place `Slot`s inside.
- Consumed by: Task 13 (InventoryWindow), gallery.

- [ ] **Step 1: Write Bar.tsx**

```tsx
import type { ReactNode } from 'react'

export interface BarProps {
  value: number
  max: number
  variant?: 'hp' | 'mp' | 'xp' | 'generic'
  label?: ReactNode
  /** Show `value/max` text inside the bar. */
  showValue?: boolean
}

/**
 * Resource bar with a CSS-only damage-lag ghost: fill and ghost share the
 * same width, but the ghost's slower transition leaves a decaying trail on
 * decrease.
 */
export function Bar({ value, max, variant = 'generic', label, showValue }: BarProps) {
  const pct = max > 0 ? Math.min(Math.max(value / max, 0), 1) * 100 : 0
  return (
    <div className="ow-bar" data-ow-variant={variant}>
      {label != null && <span className="ow-bar-label">{label}</span>}
      <div
        className="ow-bar-track"
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
      >
        <div className="ow-bar-ghost" style={{ width: `${pct}%` }} />
        <div className="ow-bar-fill" style={{ width: `${pct}%` }} />
        {showValue && (
          <span className="ow-bar-value">
            {value}/{max}
          </span>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Write SlotGrid.tsx**

```tsx
import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react'

export interface SlotGridProps {
  /** Grid column count. @default 5 */
  columns?: number
  children?: ReactNode
}

export function SlotGrid({ columns = 5, children }: SlotGridProps) {
  return (
    <div className="ow-slot-grid" role="grid" style={{ '--ow-columns': columns } as CSSProperties}>
      {children}
    </div>
  )
}

export interface SlotProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: ReactNode
  /** Stack count badge; hidden when omitted or <= 1. */
  quantity?: number
  /** Rarity key exposed as `data-ow-rarity` for theme styling. */
  rarity?: string
  /** Keybinding label badge (hotbar use). */
  keybind?: string
  selected?: boolean
}

export function Slot({ icon, quantity, rarity, keybind, selected, className, ...rest }: SlotProps) {
  return (
    <button
      type="button"
      className={className ? `ow-slot ${className}` : 'ow-slot'}
      data-ow-rarity={rarity}
      data-ow-state={selected ? 'selected' : undefined}
      {...rest}
    >
      <span className="ow-slot-icon" aria-hidden="true">
        {icon}
      </span>
      {quantity != null && quantity > 1 && <span className="ow-slot-qty">{quantity}</span>}
      {keybind && <span className="ow-slot-key">{keybind}</span>}
    </button>
  )
}
```

- [ ] **Step 3: Write Hotbar.tsx**

```tsx
import type { ReactNode } from 'react'

export interface HotbarProps {
  children?: ReactNode
}

/** Horizontal action bar; place `Slot`s (with `keybind`) inside. */
export function Hotbar({ children }: HotbarProps) {
  return (
    <div className="ow-hotbar" role="toolbar">
      {children}
    </div>
  )
}
```

- [ ] **Step 4: Export, verify, commit** (append to index.ts)

```ts
export { Bar } from './components/Bar'
export type { BarProps } from './components/Bar'
export { SlotGrid, Slot } from './components/SlotGrid'
export type { SlotGridProps, SlotProps } from './components/SlotGrid'
export { Hotbar } from './components/Hotbar'
export type { HotbarProps } from './components/Hotbar'
```

Run: `pnpm --filter @overworld-engine/ui typecheck && pnpm --filter @overworld-engine/ui build`
Expected: clean.

```bash
git add packages/ui/src
git commit -m "feat(ui): Bar, Slot, SlotGrid, Hotbar primitives

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9: Tooltip component

**Files:**
- Create: `packages/ui/src/components/Tooltip.tsx`
- Modify: `packages/ui/src/index.ts`

**Interfaces:**
- Consumes: `positionTooltip` (Task 5).
- Produces: `Tooltip({ content, children })` — hover/focus-triggered, fixed-position, measured + clamped via `positionTooltip`.
- Consumed by: Task 13 (InventoryWindow), gallery.

- [ ] **Step 1: Write Tooltip.tsx** (two-pass measure: render hidden, position in layout effect)

```tsx
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { positionTooltip } from '../tooltipPosition'

export interface TooltipProps {
  content: ReactNode
  children?: ReactNode
}

/** Anchored tooltip shown on hover/focus of the wrapped trigger. */
export function Tooltip({ content, children }: TooltipProps) {
  const triggerRef = useRef<HTMLSpanElement>(null)
  const tipRef = useRef<HTMLSpanElement>(null)
  const [visible, setVisible] = useState(false)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)

  useLayoutEffect(() => {
    if (!visible) {
      setPos(null)
      return
    }
    const trigger = triggerRef.current
    const tip = tipRef.current
    if (!trigger || !tip) return
    const a = trigger.getBoundingClientRect()
    const t = tip.getBoundingClientRect()
    const p = positionTooltip(
      { x: a.x, y: a.y, width: a.width, height: a.height },
      { width: t.width, height: t.height },
      { width: window.innerWidth, height: window.innerHeight },
    )
    setPos({ x: p.x, y: p.y })
  }, [visible])

  return (
    <span
      ref={triggerRef}
      className="ow-tooltip-trigger"
      onPointerEnter={() => setVisible(true)}
      onPointerLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      {children}
      {visible && (
        <span
          ref={tipRef}
          role="tooltip"
          className="ow-tooltip"
          data-ow-state={pos ? 'open' : 'measuring'}
          style={
            pos
              ? { position: 'fixed', left: pos.x, top: pos.y }
              : { position: 'fixed', left: 0, top: 0, visibility: 'hidden' }
          }
        >
          {content}
        </span>
      )}
    </span>
  )
}
```

- [ ] **Step 2: Export, verify, commit** (append to index.ts)

```ts
export { Tooltip } from './components/Tooltip'
export type { TooltipProps } from './components/Tooltip'
```

Run: `pnpm --filter @overworld-engine/ui typecheck && pnpm --filter @overworld-engine/ui build`
Expected: clean.

```bash
git add packages/ui/src
git commit -m "feat(ui): Tooltip component

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 10: GameWindow

**Files:**
- Create: `packages/ui/src/components/GameWindow.tsx`
- Modify: `packages/ui/src/index.ts`

**Interfaces:**
- Consumes: `useUiStore` (Task 3), `Panel` (Task 7).
- Produces: `GameWindow({ id, title?, children? })` — renders only while `useUiStore` has `windows[id].open`; close button calls `closeWindow(id)`; pointer-down calls `focusWindow(id)`; `style.zIndex` from the store.
- Consumed by: Tasks 12/13, gallery (which opens windows via `useUiStore.getState().toggleWindow(id)`).

- [ ] **Step 1: Write GameWindow.tsx**

```tsx
import type { ReactNode } from 'react'
import { Panel } from './Panel'
import { useUiStore } from '../uiStore'

export interface GameWindowProps {
  /** Window registry id (also used by `useUiStore` open/close/toggle). */
  id: string
  title?: ReactNode
  children?: ReactNode
}

/** A closable, focusable window managed by the `useUiStore` z-order registry. */
export function GameWindow({ id, title, children }: GameWindowProps) {
  const entry = useUiStore((s) => s.windows[id])
  const closeWindow = useUiStore((s) => s.closeWindow)
  const focusWindow = useUiStore((s) => s.focusWindow)
  if (!entry?.open) return null
  return (
    <div
      className="ow-window"
      data-ow-state="open"
      style={{ zIndex: entry.z }}
      onPointerDown={() => focusWindow(id)}
    >
      <Panel title={title} onClose={() => closeWindow(id)}>
        {children}
      </Panel>
    </div>
  )
}
```

- [ ] **Step 2: Export, verify, commit** (append to index.ts)

```ts
export { GameWindow } from './components/GameWindow'
export type { GameWindowProps } from './components/GameWindow'
```

Run: `pnpm --filter @overworld-engine/ui typecheck && pnpm --filter @overworld-engine/ui build`
Expected: clean.

```bash
git add packages/ui/src
git commit -m "feat(ui): GameWindow bound to useUiStore z-order registry

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 11: DialogueBox

**Files:**
- Create: `packages/ui/src/components/DialogueBox.tsx`
- Modify: `packages/ui/src/index.ts`

**Interfaces:**
- Consumes: `DialogueEngineLike` (Task 2), `useTypewriter` (Task 4), `Panel` (Task 7), `Button` (Task 7), zustand's `useStore`.
- Produces: `DialogueBox({ engine, charsPerSecond?, portrait? })` — hidden while no `currentNode`; click-to-skip typewriter, then click/`advance()`; choices call `engine.choose(id)`; `portrait?: (speaker: string | undefined) => ReactNode` slot.

- [ ] **Step 1: Write DialogueBox.tsx**

```tsx
import type { ReactNode } from 'react'
import { useStore } from 'zustand'
import { Button } from './Button'
import { Panel } from './Panel'
import { useTypewriter } from '../useTypewriter'
import type { DialogueEngineLike } from '../engineTypes'

export interface DialogueBoxProps {
  engine: DialogueEngineLike
  /** Typewriter speed. @default 40 */
  charsPerSecond?: number
  /** Optional portrait slot rendered beside the text. */
  portrait?: (speaker: string | undefined) => ReactNode
}

/**
 * Renders the active dialogue node: typewriter text, speaker tag and choice
 * buttons. First click skips the typewriter; the next advances linear nodes.
 * Renders nothing while no dialogue is active.
 */
export function DialogueBox({ engine, charsPerSecond = 40, portrait }: DialogueBoxProps) {
  const node = useStore(engine.store, (s) => s.currentNode)
  const responses = useStore(engine.store, (s) => s.availableResponses)
  const { output, done, skip } = useTypewriter(node?.text ?? '', charsPerSecond)
  if (!node) return null

  const showChoices = done && responses.length > 0
  const advance = () => {
    if (!done) skip()
    else if (responses.length === 0) engine.advance()
  }

  return (
    <div className="ow-dialogue" data-ow-state={done ? 'done' : 'typing'}>
      <Panel>
        <div className="ow-dialogue-layout" onClick={advance}>
          {portrait && <div className="ow-dialogue-portrait">{portrait(node.speaker)}</div>}
          <div className="ow-dialogue-main">
            {node.speaker && <div className="ow-dialogue-speaker">{node.speaker}</div>}
            <p className="ow-dialogue-text">{output}</p>
            {done && responses.length === 0 && (
              <span className="ow-dialogue-continue" aria-hidden="true">
                ▼
              </span>
            )}
          </div>
        </div>
        {showChoices && (
          <ol className="ow-dialogue-choices">
            {responses.map((r) => (
              <li key={r.id}>
                <Button variant="ghost" onClick={() => engine.choose(r.id)}>
                  {r.text}
                </Button>
              </li>
            ))}
          </ol>
        )}
      </Panel>
    </div>
  )
}
```

- [ ] **Step 2: Export, verify, commit** (append to index.ts)

```ts
export { DialogueBox } from './components/DialogueBox'
export type { DialogueBoxProps } from './components/DialogueBox'
```

Run: `pnpm --filter @overworld-engine/ui typecheck && pnpm --filter @overworld-engine/ui build`
Expected: clean.

```bash
git add packages/ui/src
git commit -m "feat(ui): DialogueBox with typewriter and choice list

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 12: QuestTracker + QuestLogWindow

**Files:**
- Create: `packages/ui/src/components/QuestTracker.tsx`
- Create: `packages/ui/src/components/QuestLogWindow.tsx`
- Modify: `packages/ui/src/index.ts`

**Interfaces:**
- Consumes: `QuestEngineLike` (Task 2), `trackerRows` (Task 6), `GameWindow` (Task 10), zustand's `useStore`.
- Produces: `QuestTracker({ engine, max? })` (HUD list, default max 3, hides when empty); `QuestLogWindow({ engine, id? })` (window id defaults to `'quest-log'`; lists active rows with progress + completed titles).

- [ ] **Step 1: Write QuestTracker.tsx**

```tsx
import { useStore } from 'zustand'
import { trackerRows } from '../questSelectors'
import type { QuestEngineLike } from '../engineTypes'

export interface QuestTrackerProps {
  engine: QuestEngineLike
  /** Maximum quests shown. @default 3 */
  max?: number
}

/** Compact HUD objective tracker. Renders nothing when no quests are active. */
export function QuestTracker({ engine, max = 3 }: QuestTrackerProps) {
  const definitions = useStore(engine.store, (s) => s.definitions)
  const active = useStore(engine.store, (s) => s.active)
  const rows = trackerRows(definitions, active, max)
  if (rows.length === 0) return null
  return (
    <ul className="ow-quest-tracker">
      {rows.map((row) => (
        <li key={row.questId} className="ow-quest-tracker-quest">
          <span className="ow-quest-tracker-title">{row.title}</span>
          <ul>
            {row.objectives.map((o) => (
              <li
                key={o.id}
                className="ow-quest-objective"
                data-ow-state={o.completed ? 'completed' : 'active'}
              >
                <span className="ow-quest-objective-text">{o.text}</span>
                <span className="ow-quest-objective-count">
                  {o.current}/{o.target}
                </span>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  )
}
```

- [ ] **Step 2: Write QuestLogWindow.tsx**

```tsx
import { useStore } from 'zustand'
import { GameWindow } from './GameWindow'
import { trackerRows } from '../questSelectors'
import type { QuestEngineLike } from '../engineTypes'

export interface QuestLogWindowProps {
  engine: QuestEngineLike
  /** Window registry id. @default 'quest-log' */
  id?: string
}

/** Full quest log window: active quests with progress, then completed ones. */
export function QuestLogWindow({ engine, id = 'quest-log' }: QuestLogWindowProps) {
  const definitions = useStore(engine.store, (s) => s.definitions)
  const active = useStore(engine.store, (s) => s.active)
  const completed = useStore(engine.store, (s) => s.completed)
  const rows = trackerRows(definitions, active)
  return (
    <GameWindow id={id} title="Quests">
      <div className="ow-quest-log">
        <h3 className="ow-quest-log-heading">Active</h3>
        {rows.length === 0 && <p className="ow-quest-log-empty">No active quests.</p>}
        <ul>
          {rows.map((row) => (
            <li key={row.questId} className="ow-quest-log-entry">
              <span className="ow-quest-tracker-title">{row.title}</span>
              <ul>
                {row.objectives.map((o) => (
                  <li
                    key={o.id}
                    className="ow-quest-objective"
                    data-ow-state={o.completed ? 'completed' : 'active'}
                  >
                    <span className="ow-quest-objective-text">{o.text}</span>
                    <span className="ow-quest-objective-count">
                      {o.current}/{o.target}
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
        <h3 className="ow-quest-log-heading">Completed</h3>
        <ul>
          {completed.map((questId) => (
            <li key={questId} className="ow-quest-log-entry" data-ow-state="completed">
              {definitions[questId]?.title ?? questId}
            </li>
          ))}
        </ul>
      </div>
    </GameWindow>
  )
}
```

- [ ] **Step 3: Export, verify, commit** (append to index.ts)

```ts
export { QuestTracker } from './components/QuestTracker'
export type { QuestTrackerProps } from './components/QuestTracker'
export { QuestLogWindow } from './components/QuestLogWindow'
export type { QuestLogWindowProps } from './components/QuestLogWindow'
```

Run: `pnpm --filter @overworld-engine/ui typecheck && pnpm --filter @overworld-engine/ui build`
Expected: clean.

```bash
git add packages/ui/src
git commit -m "feat(ui): QuestTracker and QuestLogWindow

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 13: InventoryWindow

**Files:**
- Create: `packages/ui/src/components/InventoryWindow.tsx`
- Modify: `packages/ui/src/index.ts`

**Interfaces:**
- Consumes: `InventoryEngineLike`, `ItemLike` (Task 2), `slotRows` (Task 6), `GameWindow` (Task 10), `SlotGrid`/`Slot` (Task 8), `Tooltip` (Task 9), `Button` (Task 7).
- Produces: `InventoryWindow({ engine, id?, columns?, title?, rarityOf? })` — window id defaults to `'inventory'`; click selects a slot; detail footer shows name/description with Use (`engine.use`) and Drop (`engine.remove(itemId, 1)`) buttons; `rarityOf?: (item: ItemLike) => string | undefined` maps items to `data-ow-rarity`.

- [ ] **Step 1: Write InventoryWindow.tsx**

```tsx
import { useState } from 'react'
import { useStore } from 'zustand'
import { Button } from './Button'
import { GameWindow } from './GameWindow'
import { Slot, SlotGrid } from './SlotGrid'
import { Tooltip } from './Tooltip'
import { slotRows } from '../inventorySelectors'
import type { InventoryEngineLike, ItemLike } from '../engineTypes'

export interface InventoryWindowProps {
  engine: InventoryEngineLike
  /** Window registry id. @default 'inventory' */
  id?: string
  /** @default 5 */
  columns?: number
  title?: string
  /** Map an item to a rarity key for `data-ow-rarity` styling. */
  rarityOf?: (item: ItemLike) => string | undefined
}

/** Inventory window: slot grid with tooltips and a use/drop detail footer. */
export function InventoryWindow({
  engine,
  id = 'inventory',
  columns = 5,
  title = 'Inventory',
  rarityOf,
}: InventoryWindowProps) {
  const slots = useStore(engine.store, (s) => s.slots)
  const [selected, setSelected] = useState<number | null>(null)
  const rows = slotRows(slots, (itemId) => engine.getDefinition(itemId))
  const selectedRow = selected != null ? rows[selected] : undefined

  return (
    <GameWindow id={id} title={title}>
      <SlotGrid columns={columns}>
        {rows.map((row, i) => (
          <Tooltip key={`${row.itemId}-${i}`} content={row.item?.name ?? row.itemId}>
            <Slot
              icon={row.item?.icon}
              quantity={row.quantity}
              rarity={row.item && rarityOf ? rarityOf(row.item) : undefined}
              selected={selected === i}
              onClick={() => setSelected(selected === i ? null : i)}
            />
          </Tooltip>
        ))}
        {rows.length === 0 && <p className="ow-inventory-empty">Empty</p>}
      </SlotGrid>
      {selectedRow && (
        <footer className="ow-inventory-detail">
          <div className="ow-inventory-detail-text">
            <strong>{selectedRow.item?.name ?? selectedRow.itemId}</strong>
            {selectedRow.item?.description && <p>{selectedRow.item.description}</p>}
          </div>
          <div className="ow-inventory-actions">
            <Button
              onClick={() => {
                engine.use(selectedRow.itemId)
                setSelected(null)
              }}
            >
              Use
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                engine.remove(selectedRow.itemId, 1)
                setSelected(null)
              }}
            >
              Drop
            </Button>
          </div>
        </footer>
      )}
    </GameWindow>
  )
}
```

- [ ] **Step 2: Export, verify, commit** (append to index.ts)

```ts
export { InventoryWindow } from './components/InventoryWindow'
export type { InventoryWindowProps } from './components/InventoryWindow'
```

Run: `pnpm --filter @overworld-engine/ui typecheck && pnpm --filter @overworld-engine/ui build`
Expected: clean.

```bash
git add packages/ui/src
git commit -m "feat(ui): InventoryWindow with slot grid, tooltips, use/drop actions

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 14: ToastViewport + AlertHost

**Files:**
- Create: `packages/ui/src/components/ToastViewport.tsx`
- Create: `packages/ui/src/components/AlertHost.tsx`
- Modify: `packages/ui/src/index.ts`

**Interfaces:**
- Consumes: `ReadableStore`, `ToastStateLike`, `AlertStateLike` (Task 2), `Modal`/`Panel`/`Button` (Task 7).
- Produces: `ToastViewport({ store, anchor?, renderMessage? })`; `AlertHost({ store, renderMessage? })`. `store` accepts `@overworld-engine/notifications`' `useToastStore`/`useAlertStore` objects directly (a zustand hook object satisfies `ReadableStore` structurally). `renderMessage?: (message: unknown) => ReactNode` defaults to `String(message)`.

- [ ] **Step 1: Write ToastViewport.tsx**

```tsx
import type { ReactNode } from 'react'
import { useStore } from 'zustand'
import type { ReadableStore, ToastStateLike } from '../engineTypes'

export interface ToastViewportProps {
  /** Pass `useToastStore` from @overworld-engine/notifications (or any store of the same shape). */
  store: ReadableStore<ToastStateLike>
  /** Screen corner for the stack. @default 'top-right' */
  anchor?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
  /** Render opaque toast payloads. @default String(message) */
  renderMessage?: (message: unknown) => ReactNode
}

/** Renders the toast queue as a stacked corner viewport. */
export function ToastViewport({ store, anchor = 'top-right', renderMessage }: ToastViewportProps) {
  const toasts = useStore(store, (s) => s.toasts)
  if (toasts.length === 0) return null
  return (
    <ol className="ow-toasts" data-ow-anchor={anchor}>
      {toasts.map((t) => (
        <li key={t.id} className="ow-toast" data-ow-variant={t.variant}>
          {t.icon && (
            <span className="ow-toast-icon" aria-hidden="true">
              {t.icon}
            </span>
          )}
          <span className="ow-toast-message">
            {renderMessage ? renderMessage(t.message) : String(t.message)}
          </span>
          <button
            type="button"
            className="ow-toast-dismiss"
            aria-label="Dismiss"
            onClick={() => store.getState().dismiss(t.id)}
          >
            ×
          </button>
        </li>
      ))}
    </ol>
  )
}
```

- [ ] **Step 2: Write AlertHost.tsx**

```tsx
import type { ReactNode } from 'react'
import { useStore } from 'zustand'
import { Button } from './Button'
import { Modal } from './Modal'
import { Panel } from './Panel'
import type { AlertStateLike, ReadableStore } from '../engineTypes'

export interface AlertHostProps {
  /** Pass `useAlertStore` from @overworld-engine/notifications (or any store of the same shape). */
  store: ReadableStore<AlertStateLike>
  /** Render opaque payloads. @default String(message) */
  renderMessage?: (message: unknown) => ReactNode
}

/** Renders the current alert/confirm dialog from the notifications queue. */
export function AlertHost({ store, renderMessage }: AlertHostProps) {
  const current = useStore(store, (s) => s.current)
  if (!current) return null
  const render = renderMessage ?? ((m: unknown) => String(m))
  return (
    <Modal open onDismiss={() => store.getState().resolveCurrent(false)}>
      <Panel title={current.title != null ? render(current.title) : undefined}>
        <p className="ow-alert-message">{render(current.message)}</p>
        <footer className="ow-alert-actions">
          {current.kind === 'confirm' && (
            <Button variant="ghost" onClick={() => store.getState().resolveCurrent(false)}>
              {current.cancelLabel ?? 'Cancel'}
            </Button>
          )}
          <Button onClick={() => store.getState().resolveCurrent(true)}>
            {current.confirmLabel ?? 'OK'}
          </Button>
        </footer>
      </Panel>
    </Modal>
  )
}
```

- [ ] **Step 3: Export, verify, commit** (append to index.ts)

```ts
export { ToastViewport } from './components/ToastViewport'
export type { ToastViewportProps } from './components/ToastViewport'
export { AlertHost } from './components/AlertHost'
export type { AlertHostProps } from './components/AlertHost'
```

Run: `pnpm --filter @overworld-engine/ui typecheck && pnpm --filter @overworld-engine/ui build`
Expected: clean.

```bash
git add packages/ui/src
git commit -m "feat(ui): ToastViewport and AlertHost for notification stores

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 15: TutorialOverlay + AchievementPopup

**Files:**
- Create: `packages/ui/src/components/TutorialOverlay.tsx`
- Create: `packages/ui/src/components/AchievementPopup.tsx`
- Modify: `packages/ui/src/index.ts`

**Interfaces:**
- Consumes: `TutorialEngineLike`, `AchievementsEngineLike` (Task 2), `highlightBox`, `newlyUnlocked` (Task 6), `Panel`/`Button` (Task 7).
- Produces: `TutorialOverlay({ engine })` — spotlight ring over `document.querySelector(step.target)` + step card with Next/Skip; `AchievementPopup({ engine, duration? })` — self-queued unlock cards, auto-dismissed after `duration` ms (default 4000).

- [ ] **Step 1: Write TutorialOverlay.tsx**

```tsx
import { useLayoutEffect, useState } from 'react'
import { useStore } from 'zustand'
import { Button } from './Button'
import { Panel } from './Panel'
import { highlightBox } from '../highlightBox'
import type { TutorialEngineLike } from '../engineTypes'

export interface TutorialOverlayProps {
  engine: TutorialEngineLike
}

/**
 * Tutorial coach overlay: a spotlight ring around the step's `target`
 * element (a DOM selector) plus a card with the step copy and Next/Skip.
 */
export function TutorialOverlay({ engine }: TutorialOverlayProps) {
  const activeTutorialId = useStore(engine.store, (s) => s.activeTutorialId)
  const stepIndex = useStore(engine.store, (s) => s.stepIndex)
  const step = activeTutorialId ? engine.currentStep() : null
  const [box, setBox] = useState<ReturnType<typeof highlightBox> | null>(null)

  useLayoutEffect(() => {
    if (!step?.target) {
      setBox(null)
      return
    }
    const el = document.querySelector(step.target)
    if (!el) {
      setBox(null)
      return
    }
    const r = el.getBoundingClientRect()
    setBox(highlightBox({ x: r.x, y: r.y, width: r.width, height: r.height }))
  }, [activeTutorialId, stepIndex, step?.target])

  if (!step) return null
  return (
    <div className="ow-tutorial">
      {box && (
        <div
          className="ow-tutorial-highlight"
          style={{ left: box.left, top: box.top, width: box.width, height: box.height }}
        />
      )}
      <div className="ow-tutorial-card">
        <Panel>
          {step.content && <p className="ow-tutorial-content">{step.content}</p>}
          <footer className="ow-tutorial-actions">
            <Button variant="ghost" onClick={() => engine.skip()}>
              Skip
            </Button>
            <Button onClick={() => engine.next()}>Next</Button>
          </footer>
        </Panel>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Write AchievementPopup.tsx**

```tsx
import { useEffect, useRef, useState } from 'react'
import { useStore } from 'zustand'
import { newlyUnlocked } from '../achievementDiff'
import type { AchievementsEngineLike } from '../engineTypes'

export interface AchievementPopupProps {
  engine: AchievementsEngineLike
  /** How long each unlock card stays, in ms. @default 4000 */
  duration?: number
}

let popupKey = 0

/**
 * Standalone unlock popup stack: watches the achievements store, queues a
 * card per newly-unlocked id, auto-dismisses after `duration` ms. Styled by
 * the toast look but independent of the notifications queue.
 */
export function AchievementPopup({ engine, duration = 4000 }: AchievementPopupProps) {
  const unlocked = useStore(engine.store, (s) => s.unlocked)
  const prevRef = useRef(unlocked)
  const [cards, setCards] = useState<{ id: string; key: number }[]>([])

  useEffect(() => {
    const fresh = newlyUnlocked(prevRef.current, unlocked)
    prevRef.current = unlocked
    if (fresh.length === 0) return
    const added = fresh.map((id) => ({ id, key: ++popupKey }))
    setCards((c) => [...c, ...added])
    const keys = added.map((a) => a.key)
    const timer = setTimeout(
      () => setCards((c) => c.filter((card) => !keys.includes(card.key))),
      duration,
    )
    return () => clearTimeout(timer)
  }, [unlocked, duration])

  if (cards.length === 0) return null
  return (
    <ol className="ow-achievements">
      {cards.map((card) => {
        const def = engine.getDefinition(card.id)
        return (
          <li key={card.key} className="ow-achievement">
            {def?.icon && (
              <span className="ow-achievement-icon" aria-hidden="true">
                {def.icon}
              </span>
            )}
            <div>
              <span className="ow-achievement-kicker">Achievement unlocked</span>
              <span className="ow-achievement-title">{def?.title ?? card.id}</span>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
```

- [ ] **Step 3: Export, verify, commit** (append to index.ts)

```ts
export { TutorialOverlay } from './components/TutorialOverlay'
export type { TutorialOverlayProps } from './components/TutorialOverlay'
export { AchievementPopup } from './components/AchievementPopup'
export type { AchievementPopupProps } from './components/AchievementPopup'
```

Run: `pnpm --filter @overworld-engine/ui typecheck && pnpm --filter @overworld-engine/ui build && pnpm --filter @overworld-engine/ui test`
Expected: all clean/pass.

```bash
git add packages/ui/src
git commit -m "feat(ui): TutorialOverlay spotlight + AchievementPopup stack

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 16: Base stylesheet (`styles.css`)

**Files:**
- Modify: `packages/ui/src/styles/styles.css` (replace placeholder with full content)

**Interfaces:**
- Consumes: every `ow-*` class and `data-ow-*` attribute emitted by Tasks 7–15 (exact names as written there).
- Produces: the token contract themes override in Tasks 18–21 — every `--ow-*` custom property below.

- [ ] **Step 1: Write the full base layer**

```css
/* ============================================================
   @overworld-engine/ui — base layer
   Tokens + layout skeleton + neutral default look.
   Themes override tokens/decorations under
   .ow-root[data-ow-theme="…"]. All state hooks are data-ow-*.
   ============================================================ */

.ow-root {
  /* ------ design tokens (theme override surface) ------ */
  --ow-color-surface: rgba(24, 26, 32, 0.92);
  --ow-color-surface-2: rgba(38, 41, 50, 0.95);
  --ow-color-border: #4a5060;
  --ow-color-text: #e8eaf0;
  --ow-color-text-dim: #9aa0b0;
  --ow-color-accent: #6c9bd2;
  --ow-color-accent-text: #10131a;
  --ow-color-danger: #c0504d;
  --ow-color-hp: #c0504d;
  --ow-color-mp: #4d7ec0;
  --ow-color-xp: #c0a84d;
  --ow-color-rarity-common: #9aa0b0;
  --ow-color-rarity-rare: #4d7ec0;
  --ow-color-rarity-epic: #9b59b6;
  --ow-color-rarity-legendary: #e67e22;
  --ow-font-display: system-ui, sans-serif;
  --ow-font-body: system-ui, sans-serif;
  --ow-radius: 6px;
  --ow-radius-sm: 3px;
  --ow-space-1: 4px;
  --ow-space-2: 8px;
  --ow-space-3: 12px;
  --ow-space-4: 20px;
  --ow-ui-scale: 1;
  --ow-panel-border-width: 1px;
  --ow-panel-border-image: none;
  --ow-shadow: 0 4px 16px rgba(0, 0, 0, 0.45);
  --ow-slot-size: 48px;

  font-family: var(--ow-font-body);
  font-size: calc(14px * var(--ow-ui-scale));
  color: var(--ow-color-text);
  line-height: 1.45;
}

.ow-root *,
.ow-root *::before,
.ow-root *::after {
  box-sizing: border-box;
}

/* ---------------- HUD overlay ---------------- */
.ow-hud {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  z-index: 100;
}
.ow-hud-anchor {
  position: absolute;
  display: flex;
  flex-direction: column;
  gap: var(--ow-space-2);
  padding: var(--ow-space-3);
}
.ow-hud-anchor > * { pointer-events: auto; }
.ow-hud-anchor[data-ow-anchor="top-left"] { top: 0; left: 0; }
.ow-hud-anchor[data-ow-anchor="top"] { top: 0; left: 50%; transform: translateX(-50%); align-items: center; }
.ow-hud-anchor[data-ow-anchor="top-right"] { top: 0; right: 0; align-items: flex-end; }
.ow-hud-anchor[data-ow-anchor="left"] { top: 50%; left: 0; transform: translateY(-50%); }
.ow-hud-anchor[data-ow-anchor="center"] { top: 50%; left: 50%; transform: translate(-50%, -50%); align-items: center; }
.ow-hud-anchor[data-ow-anchor="right"] { top: 50%; right: 0; transform: translateY(-50%); align-items: flex-end; }
.ow-hud-anchor[data-ow-anchor="bottom-left"] { bottom: 0; left: 0; }
.ow-hud-anchor[data-ow-anchor="bottom"] { bottom: 0; left: 50%; transform: translateX(-50%); align-items: center; }
.ow-hud-anchor[data-ow-anchor="bottom-right"] { bottom: 0; right: 0; align-items: flex-end; }

/* ---------------- Panel ---------------- */
.ow-panel {
  background: var(--ow-color-surface);
  border: var(--ow-panel-border-width) solid var(--ow-color-border);
  border-image: var(--ow-panel-border-image);
  border-radius: var(--ow-radius);
  box-shadow: var(--ow-shadow);
  min-width: 180px;
}
.ow-panel-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ow-space-2);
  padding: var(--ow-space-2) var(--ow-space-3);
  border-bottom: 1px solid var(--ow-color-border);
  font-family: var(--ow-font-display);
  font-weight: 600;
  letter-spacing: 0.02em;
}
.ow-panel-close {
  border: none;
  background: none;
  color: var(--ow-color-text-dim);
  font-size: 1.2em;
  line-height: 1;
  cursor: pointer;
  padding: 0 var(--ow-space-1);
}
.ow-panel-close:hover { color: var(--ow-color-text); }
.ow-panel-body { padding: var(--ow-space-3); }

/* ---------------- Buttons ---------------- */
.ow-button {
  font: inherit;
  font-family: var(--ow-font-display);
  padding: var(--ow-space-1) var(--ow-space-3);
  border-radius: var(--ow-radius-sm);
  border: 1px solid var(--ow-color-border);
  background: var(--ow-color-accent);
  color: var(--ow-color-accent-text);
  cursor: pointer;
}
.ow-button[data-ow-variant="ghost"] {
  background: transparent;
  color: var(--ow-color-text);
}
.ow-button[data-ow-variant="danger"] {
  background: var(--ow-color-danger);
  color: var(--ow-color-text);
}
.ow-button:hover { filter: brightness(1.15); }
.ow-button:active { transform: translateY(1px); }
.ow-icon-button {
  font: inherit;
  display: inline-grid;
  place-items: center;
  width: 2em;
  height: 2em;
  border-radius: var(--ow-radius-sm);
  border: 1px solid var(--ow-color-border);
  background: var(--ow-color-surface-2);
  color: var(--ow-color-text);
  cursor: pointer;
}

/* ---------------- Bar ---------------- */
.ow-bar { display: flex; align-items: center; gap: var(--ow-space-2); min-width: 160px; }
.ow-bar-label { font-size: 0.85em; color: var(--ow-color-text-dim); min-width: 2.2em; }
.ow-bar-track {
  position: relative;
  flex: 1;
  height: 14px;
  border: 1px solid var(--ow-color-border);
  border-radius: var(--ow-radius-sm);
  background: rgba(0, 0, 0, 0.55);
  overflow: hidden;
}
.ow-bar-fill,
.ow-bar-ghost {
  position: absolute;
  inset: 0 auto 0 0;
  border-radius: inherit;
}
.ow-bar-fill { background: var(--ow-color-accent); transition: width 0.12s ease-out; }
.ow-bar-ghost { background: rgba(255, 255, 255, 0.45); transition: width 0.9s ease 0.25s; }
.ow-bar[data-ow-variant="hp"] .ow-bar-fill { background: var(--ow-color-hp); }
.ow-bar[data-ow-variant="mp"] .ow-bar-fill { background: var(--ow-color-mp); }
.ow-bar[data-ow-variant="xp"] .ow-bar-fill { background: var(--ow-color-xp); }
.ow-bar-value {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  font-size: 0.75em;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
}

/* ---------------- Slots ---------------- */
.ow-slot-grid {
  display: grid;
  grid-template-columns: repeat(var(--ow-columns, 5), var(--ow-slot-size));
  gap: var(--ow-space-1);
}
.ow-slot {
  position: relative;
  width: var(--ow-slot-size);
  height: var(--ow-slot-size);
  display: grid;
  place-items: center;
  font-size: 1.4em;
  border: 1px solid var(--ow-color-border);
  border-radius: var(--ow-radius-sm);
  background: var(--ow-color-surface-2);
  color: var(--ow-color-text);
  cursor: pointer;
  padding: 0;
}
.ow-slot:hover { border-color: var(--ow-color-accent); }
.ow-slot[data-ow-state="selected"] {
  border-color: var(--ow-color-accent);
  box-shadow: 0 0 0 1px var(--ow-color-accent);
}
.ow-slot[data-ow-rarity="common"] { border-color: var(--ow-color-rarity-common); }
.ow-slot[data-ow-rarity="rare"] { border-color: var(--ow-color-rarity-rare); }
.ow-slot[data-ow-rarity="epic"] { border-color: var(--ow-color-rarity-epic); }
.ow-slot[data-ow-rarity="legendary"] { border-color: var(--ow-color-rarity-legendary); }
.ow-slot-qty {
  position: absolute;
  right: 2px;
  bottom: 1px;
  font-size: 0.55em;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.9);
}
.ow-slot-key {
  position: absolute;
  left: 2px;
  top: 1px;
  font-size: 0.5em;
  color: var(--ow-color-text-dim);
}
.ow-hotbar {
  display: flex;
  gap: var(--ow-space-1);
  padding: var(--ow-space-1);
  border: 1px solid var(--ow-color-border);
  border-radius: var(--ow-radius);
  background: var(--ow-color-surface);
}

/* ---------------- Tooltip ---------------- */
.ow-tooltip-trigger { display: inline-block; }
.ow-tooltip {
  z-index: 400;
  max-width: 260px;
  padding: var(--ow-space-1) var(--ow-space-2);
  border: 1px solid var(--ow-color-border);
  border-radius: var(--ow-radius-sm);
  background: var(--ow-color-surface-2);
  box-shadow: var(--ow-shadow);
  font-size: 0.85em;
  pointer-events: none;
}

/* ---------------- Window / Modal ---------------- */
.ow-window {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  pointer-events: auto;
}
.ow-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 300;
  display: grid;
  place-items: center;
  background: rgba(0, 0, 0, 0.55);
  pointer-events: auto;
}
.ow-alert-message { margin: 0 0 var(--ow-space-3); max-width: 320px; }
.ow-alert-actions { display: flex; justify-content: flex-end; gap: var(--ow-space-2); }

/* ---------------- Dialogue ---------------- */
.ow-dialogue { max-width: 560px; width: min(560px, 92vw); }
.ow-dialogue-layout { display: flex; gap: var(--ow-space-3); cursor: pointer; }
.ow-dialogue-portrait { flex: none; font-size: 2.4em; }
.ow-dialogue-main { position: relative; flex: 1; min-height: 3.6em; }
.ow-dialogue-speaker {
  font-family: var(--ow-font-display);
  font-weight: 700;
  color: var(--ow-color-accent);
  margin-bottom: var(--ow-space-1);
}
.ow-dialogue-text { margin: 0; white-space: pre-wrap; }
.ow-dialogue-continue {
  position: absolute;
  right: 0;
  bottom: -0.4em;
  animation: ow-blink 1s steps(2) infinite;
  color: var(--ow-color-text-dim);
}
.ow-dialogue-choices {
  list-style: none;
  margin: var(--ow-space-3) 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ow-space-1);
}
.ow-dialogue-choices .ow-button { width: 100%; text-align: left; }
@keyframes ow-blink { 50% { opacity: 0; } }

/* ---------------- Quest tracker / log ---------------- */
.ow-quest-tracker,
.ow-quest-tracker ul,
.ow-quest-log ul {
  list-style: none;
  margin: 0;
  padding: 0;
}
.ow-quest-tracker {
  display: flex;
  flex-direction: column;
  gap: var(--ow-space-2);
  padding: var(--ow-space-2) var(--ow-space-3);
  background: var(--ow-color-surface);
  border: 1px solid var(--ow-color-border);
  border-radius: var(--ow-radius);
  min-width: 200px;
}
.ow-quest-tracker-title {
  font-family: var(--ow-font-display);
  font-weight: 600;
  font-size: 0.9em;
  color: var(--ow-color-accent);
}
.ow-quest-objective {
  display: flex;
  justify-content: space-between;
  gap: var(--ow-space-2);
  font-size: 0.85em;
}
.ow-quest-objective[data-ow-state="completed"] {
  color: var(--ow-color-text-dim);
  text-decoration: line-through;
}
.ow-quest-objective-count { color: var(--ow-color-text-dim); }
.ow-quest-log { min-width: 280px; display: flex; flex-direction: column; gap: var(--ow-space-2); }
.ow-quest-log-heading {
  margin: 0;
  font-family: var(--ow-font-display);
  font-size: 0.8em;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--ow-color-text-dim);
}
.ow-quest-log-entry { padding: var(--ow-space-1) 0; }
.ow-quest-log-entry[data-ow-state="completed"] { color: var(--ow-color-text-dim); }
.ow-quest-log-empty { margin: 0; color: var(--ow-color-text-dim); font-size: 0.85em; }

/* ---------------- Inventory ---------------- */
.ow-inventory-empty { grid-column: 1 / -1; margin: 0; color: var(--ow-color-text-dim); }
.ow-inventory-detail {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: var(--ow-space-3);
  margin-top: var(--ow-space-3);
  padding-top: var(--ow-space-2);
  border-top: 1px solid var(--ow-color-border);
}
.ow-inventory-detail-text p { margin: var(--ow-space-1) 0 0; font-size: 0.85em; color: var(--ow-color-text-dim); }
.ow-inventory-actions { display: flex; gap: var(--ow-space-2); }

/* ---------------- Toasts / achievements ---------------- */
.ow-toasts,
.ow-achievements {
  position: fixed;
  z-index: 350;
  list-style: none;
  margin: 0;
  padding: var(--ow-space-3);
  display: flex;
  flex-direction: column;
  gap: var(--ow-space-2);
  pointer-events: none;
}
.ow-toasts[data-ow-anchor="top-right"] { top: 0; right: 0; }
.ow-toasts[data-ow-anchor="top-left"] { top: 0; left: 0; }
.ow-toasts[data-ow-anchor="bottom-right"] { bottom: 0; right: 0; }
.ow-toasts[data-ow-anchor="bottom-left"] { bottom: 0; left: 0; }
.ow-achievements { top: 0; left: 50%; transform: translateX(-50%); }
.ow-toast,
.ow-achievement {
  display: flex;
  align-items: center;
  gap: var(--ow-space-2);
  padding: var(--ow-space-2) var(--ow-space-3);
  background: var(--ow-color-surface);
  border: 1px solid var(--ow-color-border);
  border-left: 3px solid var(--ow-color-accent);
  border-radius: var(--ow-radius-sm);
  box-shadow: var(--ow-shadow);
  pointer-events: auto;
  animation: ow-slide-in 0.25s ease-out;
}
.ow-toast[data-ow-variant="success"] { border-left-color: #4dc07a; }
.ow-toast[data-ow-variant="warning"] { border-left-color: var(--ow-color-xp); }
.ow-toast[data-ow-variant="error"] { border-left-color: var(--ow-color-danger); }
.ow-toast-dismiss {
  border: none;
  background: none;
  color: var(--ow-color-text-dim);
  cursor: pointer;
  font-size: 1.1em;
  line-height: 1;
}
.ow-achievement { border-left-color: var(--ow-color-xp); }
.ow-achievement-kicker {
  display: block;
  font-size: 0.7em;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--ow-color-text-dim);
}
.ow-achievement-title { font-family: var(--ow-font-display); font-weight: 700; }
.ow-achievement-icon { font-size: 1.6em; }
@keyframes ow-slide-in {
  from { opacity: 0; transform: translateY(-6px); }
}

/* ---------------- Tutorial ---------------- */
.ow-tutorial-highlight {
  position: fixed;
  z-index: 250;
  border: 2px solid var(--ow-color-accent);
  border-radius: var(--ow-radius-sm);
  box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.5);
  pointer-events: none;
}
.ow-tutorial-card {
  position: fixed;
  z-index: 260;
  bottom: var(--ow-space-4);
  left: 50%;
  transform: translateX(-50%);
  pointer-events: auto;
  max-width: 360px;
}
.ow-tutorial-content { margin: 0 0 var(--ow-space-3); }
.ow-tutorial-actions { display: flex; justify-content: flex-end; gap: var(--ow-space-2); }

/* ---------------- Motion ---------------- */
@media (prefers-reduced-motion: reduce) {
  .ow-root *,
  .ow-root *::before,
  .ow-root *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

- [ ] **Step 2: Verify + commit**

Run: `pnpm --filter @overworld-engine/ui build && ls packages/ui/dist/styles.css`
Expected: build clean; file exists in dist.

```bash
git add packages/ui/src/styles/styles.css
git commit -m "feat(ui): base stylesheet — tokens, HUD skeleton, neutral look

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 17: `examples/ui-gallery` demo app

This app is also the compile-time proof that real engines satisfy the structural interfaces.

**Files:**
- Create: `examples/ui-gallery/package.json`
- Create: `examples/ui-gallery/vite.config.ts`
- Create: `examples/ui-gallery/tsconfig.json`
- Create: `examples/ui-gallery/index.html`
- Create: `examples/ui-gallery/src/main.tsx`
- Create: `examples/ui-gallery/src/App.tsx`
- Modify: `.changeset/config.json` (add `"ui-gallery"` to `ignore`)

**Interfaces:**
- Consumes: the full `@overworld-engine/ui` export surface; real engines from `@overworld-engine/{dialogue,quest,inventory,notifications,tutorial,achievements}`.

- [ ] **Step 1: Write package.json**

```json
{
  "name": "ui-gallery",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "typecheck": "tsc --noEmit",
    "preview": "vite preview"
  },
  "dependencies": {
    "@overworld-engine/achievements": "workspace:*",
    "@overworld-engine/core": "workspace:*",
    "@overworld-engine/dialogue": "workspace:*",
    "@overworld-engine/inventory": "workspace:*",
    "@overworld-engine/notifications": "workspace:*",
    "@overworld-engine/quest": "workspace:*",
    "@overworld-engine/tutorial": "workspace:*",
    "@overworld-engine/ui": "workspace:*",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "zustand": "^5.0.2"
  },
  "devDependencies": {
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.3.4",
    "typescript": "^5.6.3",
    "vite": "^6.0.1"
  }
}
```

- [ ] **Step 2: Write vite.config.ts, tsconfig.json, index.html**

`examples/ui-gallery/vite.config.ts`:

```ts
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
})
```

`examples/ui-gallery/tsconfig.json` (mirror `examples/starter/tsconfig.json` — copy that file verbatim):

```bash
cp examples/starter/tsconfig.json examples/ui-gallery/tsconfig.json
```

`examples/ui-gallery/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Overworld UI Gallery</title>
    <style>
      body { margin: 0; background: #202430; }
      #root { position: relative; min-height: 100vh; }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 3: Write src/main.tsx**

```tsx
import { createRoot } from 'react-dom/client'
import '@overworld-engine/ui/styles.css'
import '@overworld-engine/ui/themes/xianxia.css'
import '@overworld-engine/ui/themes/hextech.css'
import '@overworld-engine/ui/themes/tactical.css'
import '@overworld-engine/ui/themes/pixel.css'
import { App } from './App'

createRoot(document.getElementById('root')!).render(<App />)
```

- [ ] **Step 4: Write src/App.tsx**

```tsx
import { useState } from 'react'
import { createDialogueEngine } from '@overworld-engine/dialogue'
import { createQuestEngine } from '@overworld-engine/quest'
import { createInventory } from '@overworld-engine/inventory'
import { createTutorial } from '@overworld-engine/tutorial'
import { createAchievements } from '@overworld-engine/achievements'
import { useAlertStore, useToastStore, confirm } from '@overworld-engine/notifications'
import {
  AchievementPopup,
  AlertHost,
  Bar,
  Button,
  DialogueBox,
  Hotbar,
  Hud,
  InventoryWindow,
  QuestLogWindow,
  QuestTracker,
  Slot,
  ToastViewport,
  Tooltip,
  TutorialOverlay,
  useUiStore,
} from '@overworld-engine/ui'

// ---- engines with sample content (created once at module level) ----

const dialogue = createDialogueEngine()
dialogue.registerDialogues({
  id: 'elder',
  nodes: [
    {
      id: 'hello',
      speaker: 'Village Elder',
      text: 'Welcome, traveler! Our village needs help with the herb harvest.',
      next: 'ask',
    },
    {
      id: 'ask',
      speaker: 'Village Elder',
      text: 'Will you gather 3 moon herbs for us?',
      responses: [
        { id: 'yes', text: 'Of course!', next: 'thanks' },
        { id: 'no', text: 'Maybe later.' },
      ],
    },
    { id: 'thanks', speaker: 'Village Elder', text: 'Bless you! Come back soon.' },
  ],
})

const quests = createQuestEngine()
quests.registerQuests({
  id: 'herbs',
  title: 'Moonlit Harvest',
  objectives: [{ id: 'gather', description: 'Gather moon herbs', target: 3 }],
})

const inventory = createInventory()
inventory.registerItems([
  { id: 'potion', name: 'Health Potion', description: 'Restores 50 HP.', icon: '🧪', category: 'consumable' },
  { id: 'herb', name: 'Moon Herb', description: 'Glows faintly at night.', icon: '🌿', category: 'material' },
  { id: 'sword', name: 'Iron Sword', description: 'A dependable blade.', icon: '🗡️', stackable: false },
])
inventory.add('potion', 3)
inventory.add('herb', 2)
inventory.add('sword', 1)

const tutorial = createTutorial()
tutorial.registerTutorials([
  {
    id: 'intro',
    steps: [
      { id: 's1', content: 'This is your health bar.', target: '#gallery-bars' },
      { id: 's2', content: 'Open your inventory here.', target: '#gallery-actions' },
    ],
  },
])

const achievements = createAchievements()
achievements.registerAchievements([
  { id: 'first-steps', title: 'First Steps', icon: '👣', trigger: null },
])

const THEMES = ['base', 'xianxia', 'hextech', 'tactical', 'pixel'] as const

export function App() {
  const [theme, setTheme] = useState<(typeof THEMES)[number]>('base')
  const [hp, setHp] = useState(80)
  const toggleWindow = useUiStore((s) => s.toggleWindow)

  return (
    <Hud theme={theme === 'base' ? undefined : theme}>
      <Hud.Anchor anchor="top-left">
        <div id="gallery-bars">
          <Bar value={hp} max={100} variant="hp" label="HP" showValue />
          <Bar value={40} max={100} variant="mp" label="MP" showValue />
          <Bar value={65} max={100} variant="xp" label="XP" />
        </div>
        <QuestTracker engine={quests} />
      </Hud.Anchor>

      <Hud.Anchor anchor="top-right">
        <label style={{ pointerEvents: 'auto' }}>
          Theme{' '}
          <select value={theme} onChange={(e) => setTheme(e.target.value as (typeof THEMES)[number])}>
            {THEMES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
      </Hud.Anchor>

      <Hud.Anchor anchor="bottom">
        <div id="gallery-actions" style={{ display: 'flex', gap: 8 }}>
          <Button onClick={() => dialogue.start('elder')}>Talk</Button>
          <Button onClick={() => quests.startQuest('herbs')}>Start quest</Button>
          <Button onClick={() => quests.reportProgress('herbs', 'gather')}>+1 herb</Button>
          <Button onClick={() => toggleWindow('inventory')}>Inventory</Button>
          <Button onClick={() => toggleWindow('quest-log')}>Quest log</Button>
          <Button onClick={() => setHp((h) => Math.max(h - 15, 0))}>Take damage</Button>
          <Button onClick={() => useToastStore.getState().show({ message: 'Item acquired!', variant: 'success', icon: '✨' })}>
            Toast
          </Button>
          <Button onClick={() => void confirm({ title: 'Leave area?', message: 'Progress will be saved.' })}>
            Confirm
          </Button>
          <Button onClick={() => tutorial.start('intro')}>Tutorial</Button>
          <Button onClick={() => achievements.unlock('first-steps')}>Achievement</Button>
        </div>
        <Hotbar>
          <Tooltip content="Health Potion">
            <Slot icon="🧪" quantity={3} keybind="1" onClick={() => inventory.use('potion')} />
          </Tooltip>
          <Slot icon="🗡️" keybind="2" rarity="rare" />
          <Slot keybind="3" />
          <Slot keybind="4" />
        </Hotbar>
      </Hud.Anchor>

      <Hud.Anchor anchor="bottom">
        <DialogueBox engine={dialogue} portrait={() => <span>🧓</span>} />
      </Hud.Anchor>

      <InventoryWindow engine={inventory} rarityOf={(item) => (item.category === 'material' ? 'rare' : undefined)} />
      <QuestLogWindow engine={quests} />
      <ToastViewport store={useToastStore} />
      <AlertHost store={useAlertStore} />
      <TutorialOverlay engine={tutorial} />
      <AchievementPopup engine={achievements} />
    </Hud>
  )
}
```

- [ ] **Step 5: Add `ui-gallery` to the changeset ignore list**

In `.changeset/config.json`, change:

```json
  "ignore": [
    "starter",
    "dungeon",
    "ws-server",
    "authority-server",
    "docs",
    "benchmarks"
  ]
```

to:

```json
  "ignore": [
    "starter",
    "dungeon",
    "ws-server",
    "authority-server",
    "docs",
    "benchmarks",
    "ui-gallery"
  ]
```

- [ ] **Step 6: Install, typecheck, run**

Run: `pnpm install && pnpm --filter @overworld-engine/ui build && pnpm --filter ui-gallery typecheck && pnpm --filter ui-gallery build`
Expected: all clean. **The `ui-gallery` typecheck passing is the compile-time proof that real engines satisfy every `*Like` interface** — if it fails on an `engine=` prop, fix the interface in `packages/ui/src/engineTypes.ts` (widen/correct the mirror), never by importing engine types.

Then: `pnpm --filter ui-gallery dev` — open the printed URL; verify base look renders, dialogue/quest/inventory/toast/alert/tutorial/achievement flows all work. (Theme dropdown entries beyond `base` remain unstyled until Tasks 18–21.)

- [ ] **Step 7: Commit**

```bash
git add examples/ui-gallery .changeset/config.json pnpm-lock.yaml
git commit -m "feat(examples): ui-gallery demo app exercising @overworld-engine/ui with real engines

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 18: Theme — xianxia (仙侠国风)

**Files:**
- Modify: `packages/ui/src/styles/themes/xianxia.css` (replace placeholder)

**Interfaces:**
- Consumes: the token contract + `ow-*` class names from Task 16. Every theme file follows the same recipe: token overrides on `.ow-root[data-ow-theme="…"]`, then component-level texture rules, then an inline-SVG `border-image` frame.

- [ ] **Step 1: Write the theme**

Identity: 暗红/描金, 祥云角饰, 宫廷卷轴质感. Serif/Kai display, warm parchment text on deep lacquer red.

```css
/* @overworld-engine/ui — theme: xianxia (ornate eastern fantasy) */

.ow-root[data-ow-theme="xianxia"] {
  --ow-color-surface: linear-gradient(160deg, rgba(46, 18, 14, 0.96), rgba(28, 10, 8, 0.97));
  --ow-color-surface-2: rgba(58, 26, 18, 0.95);
  --ow-color-border: #c9a227;
  --ow-color-text: #f3e6c8;
  --ow-color-text-dim: #b7a179;
  --ow-color-accent: #c9a227;
  --ow-color-accent-text: #2e120e;
  --ow-color-danger: #a53326;
  --ow-color-hp: #b03a2e;
  --ow-color-mp: #2e6da4;
  --ow-color-xp: #c9a227;
  --ow-font-display: "STKaiti", "KaiTi", "Noto Serif SC", serif;
  --ow-font-body: "Songti SC", "Noto Serif SC", serif;
  --ow-radius: 10px;
  --ow-radius-sm: 6px;
  --ow-panel-border-width: 2px;
  --ow-shadow: 0 6px 24px rgba(0, 0, 0, 0.6), inset 0 0 24px rgba(201, 162, 39, 0.08);
}

/* gold double-frame with cloud-curl corners (inline SVG, 9-slice) */
.ow-root[data-ow-theme="xianxia"] .ow-panel {
  background: var(--ow-color-surface);
  border-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'%3E%3Cpath d='M4 4h40v40H4z' fill='none' stroke='%23c9a227' stroke-width='2'/%3E%3Cpath d='M8 8h32v32H8z' fill='none' stroke='%23c9a227' stroke-width='0.8' opacity='0.6'/%3E%3Cpath d='M4 14c6 0 10-4 10-10M44 14c-6 0-10-4-10-10M4 34c6 0 10 4 10 10M44 34c-6 0-10 4-10 10' fill='none' stroke='%23c9a227' stroke-width='1.6'/%3E%3C/svg%3E") 14 / 14px stretch;
}
.ow-root[data-ow-theme="xianxia"] .ow-panel-title {
  border-bottom: 1px solid rgba(201, 162, 39, 0.45);
  letter-spacing: 0.12em;
}
.ow-root[data-ow-theme="xianxia"] .ow-panel-title-text::before { content: "❖ "; color: var(--ow-color-border); }
.ow-root[data-ow-theme="xianxia"] .ow-button {
  background: linear-gradient(180deg, #dcb63a, #a9821c);
  border-color: #7a5e12;
  text-shadow: 0 1px 0 rgba(255, 240, 200, 0.4);
}
.ow-root[data-ow-theme="xianxia"] .ow-button[data-ow-variant="ghost"] {
  background: transparent;
  border-color: rgba(201, 162, 39, 0.5);
  color: var(--ow-color-text);
}
.ow-root[data-ow-theme="xianxia"] .ow-slot,
.ow-root[data-ow-theme="xianxia"] .ow-hotbar {
  background: rgba(20, 8, 6, 0.85);
  border-color: rgba(201, 162, 39, 0.55);
}
.ow-root[data-ow-theme="xianxia"] .ow-bar-track {
  border-color: rgba(201, 162, 39, 0.7);
  background: rgba(16, 6, 4, 0.8);
}
.ow-root[data-ow-theme="xianxia"] .ow-bar-fill {
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.25), transparent 40%), var(--ow-color-accent);
}
.ow-root[data-ow-theme="xianxia"] .ow-bar[data-ow-variant="hp"] .ow-bar-fill {
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.25), transparent 40%), var(--ow-color-hp);
}
.ow-root[data-ow-theme="xianxia"] .ow-bar[data-ow-variant="mp"] .ow-bar-fill {
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.25), transparent 40%), var(--ow-color-mp);
}
.ow-root[data-ow-theme="xianxia"] .ow-dialogue-speaker { letter-spacing: 0.15em; }
.ow-root[data-ow-theme="xianxia"] .ow-toast,
.ow-root[data-ow-theme="xianxia"] .ow-achievement {
  background: var(--ow-color-surface);
  border-left-width: 4px;
}
```

- [ ] **Step 2: Verify visually + commit**

Run: `pnpm --filter @overworld-engine/ui build && pnpm --filter ui-gallery dev`
Expected: selecting "xianxia" in the gallery restyles panels (gold cloud-curl frame, lacquer red surfaces, serif display) with readable text everywhere. Iterate on the CSS until panels/buttons/bars/slots/dialogue all read as one coherent style — visual polish edits stay inside this one file.

```bash
git add packages/ui/src/styles/themes/xianxia.css
git commit -m "feat(ui): xianxia theme skin

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 19: Theme — hextech (奥术魔幻)

**Files:**
- Modify: `packages/ui/src/styles/themes/hextech.css`

**Interfaces:** same recipe as Task 18.

- [ ] **Step 1: Write the theme**

Identity: 深蓝/青金, 切角几何边框, 发光纹路金属质感. Angular (radius 0 + chamfer), teal glow accents.

```css
/* @overworld-engine/ui — theme: hextech (arcane magitech) */

.ow-root[data-ow-theme="hextech"] {
  --ow-color-surface: linear-gradient(170deg, rgba(9, 20, 40, 0.96), rgba(6, 12, 24, 0.97));
  --ow-color-surface-2: rgba(12, 28, 52, 0.95);
  --ow-color-border: #c8aa6e;
  --ow-color-text: #f0e6d2;
  --ow-color-text-dim: #8fa3b0;
  --ow-color-accent: #0ac8b9;
  --ow-color-accent-text: #04121c;
  --ow-color-danger: #be3044;
  --ow-color-hp: #1fbf75;
  --ow-color-mp: #2e86de;
  --ow-color-xp: #c8aa6e;
  --ow-font-display: "Cinzel", "Trajan Pro", serif;
  --ow-font-body: "Segoe UI", system-ui, sans-serif;
  --ow-radius: 0px;
  --ow-radius-sm: 0px;
  --ow-panel-border-width: 1px;
  --ow-shadow: 0 6px 24px rgba(0, 0, 0, 0.7), 0 0 12px rgba(10, 200, 185, 0.12);
}

/* chamfered corners + gold frame with teal inner line */
.ow-root[data-ow-theme="hextech"] .ow-panel {
  background: var(--ow-color-surface);
  clip-path: polygon(10px 0, calc(100% - 10px) 0, 100% 10px, 100% calc(100% - 10px), calc(100% - 10px) 100%, 10px 100%, 0 calc(100% - 10px), 0 10px);
  border-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'%3E%3Cpath d='M12 2h24l10 10v24l-10 10H12L2 36V12z' fill='none' stroke='%23c8aa6e' stroke-width='2'/%3E%3Cpath d='M14 5h20l9 9v20l-9 9H14L5 34V14z' fill='none' stroke='%230ac8b9' stroke-width='0.8' opacity='0.7'/%3E%3C/svg%3E") 14 / 12px stretch;
}
.ow-root[data-ow-theme="hextech"] .ow-panel-title {
  text-transform: uppercase;
  letter-spacing: 0.14em;
  font-size: 0.9em;
  color: #c8aa6e;
  border-bottom: 1px solid rgba(200, 170, 110, 0.4);
}
.ow-root[data-ow-theme="hextech"] .ow-button {
  clip-path: polygon(6px 0, calc(100% - 6px) 0, 100% 50%, calc(100% - 6px) 100%, 6px 100%, 0 50%);
  background: linear-gradient(180deg, #0e3b52, #072331);
  border: 1px solid #0ac8b9;
  color: #0ac8b9;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 0.85em;
}
.ow-root[data-ow-theme="hextech"] .ow-button:hover { box-shadow: 0 0 10px rgba(10, 200, 185, 0.5); filter: none; }
.ow-root[data-ow-theme="hextech"] .ow-button[data-ow-variant="danger"] { border-color: var(--ow-color-danger); color: #ff8fa0; }
.ow-root[data-ow-theme="hextech"] .ow-button[data-ow-variant="ghost"] { border-color: rgba(200, 170, 110, 0.5); color: var(--ow-color-text); background: transparent; }
.ow-root[data-ow-theme="hextech"] .ow-slot { background: rgba(4, 14, 26, 0.9); border-color: rgba(200, 170, 110, 0.5); }
.ow-root[data-ow-theme="hextech"] .ow-slot:hover { border-color: var(--ow-color-accent); box-shadow: 0 0 8px rgba(10, 200, 185, 0.4); }
.ow-root[data-ow-theme="hextech"] .ow-hotbar { background: rgba(6, 12, 24, 0.9); }
.ow-root[data-ow-theme="hextech"] .ow-bar-track { border-color: rgba(200, 170, 110, 0.6); background: rgba(2, 8, 16, 0.85); }
.ow-root[data-ow-theme="hextech"] .ow-bar-fill { box-shadow: 0 0 8px currentColor; }
.ow-root[data-ow-theme="hextech"] .ow-dialogue-speaker { color: #c8aa6e; text-transform: uppercase; letter-spacing: 0.1em; }
.ow-root[data-ow-theme="hextech"] .ow-toast,
.ow-root[data-ow-theme="hextech"] .ow-achievement { background: var(--ow-color-surface); }
.ow-root[data-ow-theme="hextech"] .ow-tutorial-highlight {
  border-color: var(--ow-color-accent);
  box-shadow: 0 0 0 9999px rgba(2, 8, 16, 0.6), 0 0 16px rgba(10, 200, 185, 0.6);
}
```

- [ ] **Step 2: Verify visually + commit**

Run: `pnpm --filter @overworld-engine/ui build`, reload gallery, select "hextech".
Expected: angular gold/teal magitech look; text readable; chamfered panels.

```bash
git add packages/ui/src/styles/themes/hextech.css
git commit -m "feat(ui): hextech theme skin

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 20: Theme — tactical (军事战术)

**Files:**
- Modify: `packages/ui/src/styles/themes/tactical.css`

**Interfaces:** same recipe as Task 18.

- [ ] **Step 1: Write the theme**

Identity: 橄榄/灰黑, 斜切单角, 大写窄字, 扫描线. One clipped corner, stencil uppercase, scanline texture via repeating-linear-gradient.

```css
/* @overworld-engine/ui — theme: tactical (modern military FPS) */

.ow-root[data-ow-theme="tactical"] {
  --ow-color-surface: rgba(18, 22, 18, 0.92);
  --ow-color-surface-2: rgba(28, 34, 28, 0.94);
  --ow-color-border: #6b7264;
  --ow-color-text: #dde4d6;
  --ow-color-text-dim: #8a927f;
  --ow-color-accent: #a8b820;
  --ow-color-accent-text: #161a12;
  --ow-color-danger: #c74436;
  --ow-color-hp: #c74436;
  --ow-color-mp: #3d9987;
  --ow-color-xp: #d5a021;
  --ow-font-display: "Oswald", "Arial Narrow", system-ui, sans-serif;
  --ow-font-body: "Segoe UI", system-ui, sans-serif;
  --ow-radius: 2px;
  --ow-radius-sm: 1px;
  --ow-panel-border-width: 1px;
  --ow-shadow: 0 4px 14px rgba(0, 0, 0, 0.7);
}

.ow-root[data-ow-theme="tactical"] .ow-panel {
  position: relative;
  clip-path: polygon(0 0, calc(100% - 16px) 0, 100% 16px, 100% 100%, 0 100%);
  border-color: var(--ow-color-border);
}
/* scanline texture */
.ow-root[data-ow-theme="tactical"] .ow-panel::after {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: repeating-linear-gradient(0deg, transparent 0 2px, rgba(255, 255, 255, 0.02) 2px 3px);
}
.ow-root[data-ow-theme="tactical"] .ow-panel-title {
  text-transform: uppercase;
  letter-spacing: 0.18em;
  font-size: 0.8em;
  background: rgba(168, 184, 32, 0.12);
}
.ow-root[data-ow-theme="tactical"] .ow-panel-title-text::before { content: "▸ "; color: var(--ow-color-accent); }
.ow-root[data-ow-theme="tactical"] .ow-button {
  text-transform: uppercase;
  letter-spacing: 0.12em;
  font-size: 0.8em;
  background: var(--ow-color-accent);
  border-color: #57601a;
  clip-path: polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 0 100%);
}
.ow-root[data-ow-theme="tactical"] .ow-button[data-ow-variant="ghost"] {
  background: transparent;
  color: var(--ow-color-text);
  border: 1px solid var(--ow-color-border);
}
.ow-root[data-ow-theme="tactical"] .ow-slot,
.ow-root[data-ow-theme="tactical"] .ow-hotbar { background: rgba(12, 15, 12, 0.9); }
.ow-root[data-ow-theme="tactical"] .ow-slot-key {
  color: var(--ow-color-accent);
  font-family: var(--ow-font-display);
}
.ow-root[data-ow-theme="tactical"] .ow-bar-track {
  border-radius: 0;
  height: 10px;
  background: rgba(8, 10, 8, 0.9);
}
.ow-root[data-ow-theme="tactical"] .ow-bar-label {
  text-transform: uppercase;
  font-family: var(--ow-font-display);
  letter-spacing: 0.1em;
}
.ow-root[data-ow-theme="tactical"] .ow-quest-tracker {
  border-left: 3px solid var(--ow-color-accent);
  border-radius: 0;
}
.ow-root[data-ow-theme="tactical"] .ow-dialogue-speaker {
  color: var(--ow-color-accent);
  text-transform: uppercase;
  letter-spacing: 0.14em;
}
.ow-root[data-ow-theme="tactical"] .ow-toast,
.ow-root[data-ow-theme="tactical"] .ow-achievement { border-radius: 0; }
.ow-root[data-ow-theme="tactical"] .ow-tutorial-highlight {
  border: 1px dashed var(--ow-color-accent);
  border-radius: 0;
}
```

- [ ] **Step 2: Verify visually + commit**

Run: `pnpm --filter @overworld-engine/ui build`, reload gallery, select "tactical".

```bash
git add packages/ui/src/styles/themes/tactical.css
git commit -m "feat(ui): tactical theme skin

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 21: Theme — pixel (像素复古)

**Files:**
- Modify: `packages/ui/src/styles/themes/pixel.css`

**Interfaces:** same recipe as Task 18.

- [ ] **Step 1: Write the theme**

Identity: 暖纸色/深棕, 硬边像素框 (8×8 SVG border-image + pixelated), 硬阴影, 等宽字体. No rounded corners, no smooth gradients.

```css
/* @overworld-engine/ui — theme: pixel (retro top-down RPG) */

.ow-root[data-ow-theme="pixel"] {
  --ow-color-surface: #f8e7b7;
  --ow-color-surface-2: #efd89a;
  --ow-color-border: #6d3f1f;
  --ow-color-text: #4a2c14;
  --ow-color-text-dim: #8a6a45;
  --ow-color-accent: #3f7d3a;
  --ow-color-accent-text: #f8e7b7;
  --ow-color-danger: #a33327;
  --ow-color-hp: #c04a3a;
  --ow-color-mp: #3a6ac0;
  --ow-color-xp: #c0952e;
  --ow-font-display: "Courier New", monospace;
  --ow-font-body: "Courier New", monospace;
  --ow-radius: 0px;
  --ow-radius-sm: 0px;
  --ow-panel-border-width: 4px;
  --ow-shadow: 4px 4px 0 rgba(0, 0, 0, 0.35);
  image-rendering: pixelated;
  font-weight: 700;
}

/* 8x8 hard-edged pixel frame, scaled crisp */
.ow-root[data-ow-theme="pixel"] .ow-panel {
  border-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 8 8'%3E%3Cpath d='M2 0h4v1h1v1h1v4h-1v1h-1v1H2V7H1V6H0V2h1V1h1z' fill='%236d3f1f'/%3E%3Cpath d='M2 1h4v1h1v4H6v1H2V6H1V2h1z' fill='%23f8e7b7'/%3E%3C/svg%3E") 3 / 9px stretch;
  box-shadow: var(--ow-shadow);
}
.ow-root[data-ow-theme="pixel"] .ow-panel-title { border-bottom: 2px dashed var(--ow-color-border); }
.ow-root[data-ow-theme="pixel"] .ow-button {
  border: 3px solid var(--ow-color-border);
  box-shadow: 2px 2px 0 rgba(0, 0, 0, 0.35);
  font-weight: 700;
}
.ow-root[data-ow-theme="pixel"] .ow-button:active { transform: translate(2px, 2px); box-shadow: none; }
.ow-root[data-ow-theme="pixel"] .ow-button:hover { filter: none; outline: 2px solid var(--ow-color-xp); }
.ow-root[data-ow-theme="pixel"] .ow-slot {
  border: 3px solid var(--ow-color-border);
  background: var(--ow-color-surface-2);
}
.ow-root[data-ow-theme="pixel"] .ow-slot[data-ow-state="selected"] { outline: 3px solid var(--ow-color-xp); box-shadow: none; }
.ow-root[data-ow-theme="pixel"] .ow-hotbar { border: 3px solid var(--ow-color-border); background: var(--ow-color-surface); }
.ow-root[data-ow-theme="pixel"] .ow-slot-qty,
.ow-root[data-ow-theme="pixel"] .ow-slot-key { text-shadow: none; color: var(--ow-color-text); }
.ow-root[data-ow-theme="pixel"] .ow-bar-track {
  border: 3px solid var(--ow-color-border);
  height: 16px;
  background: #d9c48c;
}
.ow-root[data-ow-theme="pixel"] .ow-bar-fill,
.ow-root[data-ow-theme="pixel"] .ow-bar-ghost { transition: none; }
.ow-root[data-ow-theme="pixel"] .ow-bar-value { color: var(--ow-color-text); text-shadow: none; }
.ow-root[data-ow-theme="pixel"] .ow-dialogue-text { line-height: 1.7; }
.ow-root[data-ow-theme="pixel"] .ow-dialogue-continue { animation-timing-function: steps(1); }
.ow-root[data-ow-theme="pixel"] .ow-toast,
.ow-root[data-ow-theme="pixel"] .ow-achievement {
  border: 3px solid var(--ow-color-border);
  border-left: 6px solid var(--ow-color-accent);
  box-shadow: var(--ow-shadow);
}
.ow-root[data-ow-theme="pixel"] .ow-tooltip { border: 3px solid var(--ow-color-border); box-shadow: var(--ow-shadow); }
.ow-root[data-ow-theme="pixel"] .ow-tutorial-highlight { border: 3px dashed var(--ow-color-border); }
```

- [ ] **Step 2: Verify visually + commit**

Run: `pnpm --filter @overworld-engine/ui build`, reload gallery, select "pixel".
Expected: warm paper panels with crisp pixel frames and hard offset shadows; light-surface text contrast holds (dark text on light surfaces — check toasts and quest tracker especially, since base assumes dark surfaces; fix any unreadable spot inside this file).

```bash
git add packages/ui/src/styles/themes/pixel.css
git commit -m "feat(ui): pixel theme skin

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 22: Changeset + final verification

**Files:**
- Create: `.changeset/ui-package.md`

- [ ] **Step 1: Write the changeset**

```md
---
'@overworld-engine/ui': minor
---

New package: headless game UI. HUD primitives (Hud, Panel, GameWindow, Bar, Slot/SlotGrid, Hotbar, Button, Tooltip, Modal), engine-bound components via duck-typed interfaces (DialogueBox, QuestTracker, QuestLogWindow, InventoryWindow, ToastViewport, AlertHost, TutorialOverlay, AchievementPopup), behavior hooks, a neutral base stylesheet, and four theme skins: xianxia, hextech, tactical, pixel.
```

- [ ] **Step 2: Zero-cross-package-import check**

Run: `grep -rn "@overworld-engine/" packages/ui/src --include='*.ts' --include='*.tsx' | grep -v "@overworld-engine/core" | grep -v "from '\./" || echo CLEAN`
Expected: `CLEAN` (only `@overworld-engine/core` may appear, and in v1 likely nothing at all).

- [ ] **Step 3: Full workspace verification**

Run: `pnpm build && pnpm typecheck && pnpm test`
Expected: every package builds, typechecks and tests green (pre-existing suites unaffected).

- [ ] **Step 4: Commit**

```bash
git add .changeset/ui-package.md
git commit -m "chore(changeset): @overworld-engine/ui minor release

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Self-Review Notes

- Spec coverage: package structure (T1), structural interfaces (T2), UI store/z-order + input-focus flag (T3), typewriter (T4), tooltip (T5, T9), selectors + error-handling defaults (T6), HUD primitives incl. pointer-events discipline (T7–T10, T16), all six engine renderers (T11–T15), base tokens + data-attr contract + reduced-motion (T16), gallery acceptance app (T17), four skins with inline-SVG borders (T18–T21), release (T22). Non-goals (drag, joystick, weapp, bitmaps) have no tasks — intentional.
- Testing convention respected: only pure functions have tests; no jsdom/testing-library anywhere.
- Type consistency: names cross-checked (`trackerRows`, `slotRows`, `newlyUnlocked`, `highlightBox`, `positionTooltip`, `advanceReveal`, `useUiStore`, `selectAnyWindowOpen`, `*Like` interfaces) — each later task consumes exactly the signatures produced earlier.
