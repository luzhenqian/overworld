# P0 Spatial Focus Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add gamepad/keyboard spatial focus navigation to `@overworld-engine/ui` as an opt-in `@overworld-engine/ui/focus` subpath (backed by `@noriginmedia/norigin-spatial-navigation` as an optional peer dependency), plus zero-dependency core improvements: `forwardRef` on Button/IconButton/Slot and a DOM focus trap on Modal.

**Architecture:** Two layers. The **core** (`packages/ui/src/`) stays dependency-free: Button/IconButton/Slot become `forwardRef` so external focus refs attach to the DOM button, and Modal gets a keyboard focus trap (Tab cycling + Escape + focus restore) built on the pure `focusTrap` helper. The **`/focus` subpath** (`packages/ui/src/focus/`) holds `FocusProvider`, `Focusable`, `useSpatialFocus`, `useGamepadFocus`, and re-exports norigin's hooks; it is NOT re-exported from the main barrel, so the core install never pulls norigin.

**Tech Stack:** React 18, TypeScript, tsup (multi-entry), vitest (node), `@noriginmedia/norigin-spatial-navigation` ^3.2.1, Storybook 9, pnpm workspace.

## Global Constraints

- **Core stays zero-dependency.** `@overworld-engine/ui`'s `dependencies` remains `{}`. norigin is added ONLY as an optional `peerDependency` (+ a `devDependency` for this package's own typecheck/build). Nothing under `packages/ui/src/` OUTSIDE `packages/ui/src/focus/` may import norigin.
- **Pure-logic tests only** — vitest node tests for `focusTrap` and `gamepadAxis`; NO testing-library / jsdom. Components, hooks, and the Modal focus trap are verified by typecheck + build + gallery typecheck (spatial-nav runtime interaction is browser behavior, out of the repo's test gate; the gallery story is the smoke check). Do NOT add a render test.
- **norigin real API (v3.2.1, verified):** `init(options?)`; `useFocusable<P, E>(config?) => { ref: RefObject<E>; focusSelf; focused; hasFocusedChild; focusKey }`; `FocusContext: React.Context<string>`; `setFocus(focusKey, details?): Promise<void>`; `navigateByDirection(direction: string, details?): Promise<void>`; `getCurrentFocusKey(): string`; type `Direction = 'up'|'down'|'left'|'right'`. Import from the meta package `@noriginmedia/norigin-spatial-navigation`.
- **Styling convention** — `ow-*` classes + `data-ow-*` attributes; `--ow-*` tokens; bare selectors.
- **forwardRef retrofit must preserve behavior** — props interfaces, class names, `data-ow-*` attributes, and child markup are unchanged; only a forwarded `ref` is added. Existing usages (SlotGrid→Slot, DialogueBox→Button, all gallery stories) must still compile.
- **Avoid TS1149 case collisions.** New files: `focusTrap.ts`, `gamepadAxis.ts`, `focus/index.ts`, `focus/FocusProvider.tsx`, `focus/Focusable.tsx`, `focus/useSpatialFocus.ts`, `focus/useGamepadFocus.ts`.
- **Scoped verification** — only `@overworld-engine/ui` + `ui-gallery`; never the full workspace.
- **Release** — `@overworld-engine/ui` `minor` via a changeset (fixed version group). Ships together with module B (already on main) in one release.

## File Structure

| File | Responsibility |
|---|---|
| `packages/ui/src/focusTrap.ts` | Pure: focusable selector + Tab-cycle index (create) |
| `packages/ui/src/gamepadAxis.ts` | Pure: analog stick → Direction (create) |
| `packages/ui/src/components/Button.tsx` | Button/IconButton → forwardRef (modify) |
| `packages/ui/src/components/SlotGrid.tsx` | Slot → forwardRef (modify) |
| `packages/ui/src/components/Modal.tsx` | Add DOM focus trap (modify) |
| `packages/ui/src/focus/index.ts` | `/focus` barrel (create) |
| `packages/ui/src/focus/FocusProvider.tsx` | norigin init + root FocusContext (create) |
| `packages/ui/src/focus/Focusable.tsx` | Render-prop focusable wrapper (create) |
| `packages/ui/src/focus/useSpatialFocus.ts` | Imperative focus API hook (create) |
| `packages/ui/src/focus/useGamepadFocus.ts` | Gamepad → navigateByDirection bridge (create) |
| `packages/ui/tsup.config.ts` | Add `src/focus/index.ts` entry (modify) |
| `packages/ui/package.json` | peerDep + peerDepMeta + devDep + `./focus` export (modify) |
| `packages/ui/src/__tests__/focusTrap.test.ts` | Tests (create) |
| `packages/ui/src/__tests__/gamepadAxis.test.ts` | Tests (create) |
| `examples/ui-gallery/package.json` | Add norigin dep (modify) |
| `examples/ui-gallery/src/Focus.stories.tsx` | Spatial-focus demo (create) |
| `.changeset/p0-spatial-focus.md` | Release note (create) |

---

### Task 1: `focusTrap` pure logic

**Files:**
- Create: `packages/ui/src/focusTrap.ts`
- Test: `packages/ui/src/__tests__/focusTrap.test.ts`
- Modify: `packages/ui/src/index.ts`

**Interfaces:**
- Produces: `FOCUSABLE_SELECTOR: string`; `nextTrapIndex(count: number, current: number, forward: boolean): number`.

- [ ] **Step 1: Write the failing test**

Create `packages/ui/src/__tests__/focusTrap.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { FOCUSABLE_SELECTOR, nextTrapIndex } from '../focusTrap'

describe('nextTrapIndex', () => {
  test('advances forward and wraps at the end', () => {
    expect(nextTrapIndex(3, 0, true)).toBe(1)
    expect(nextTrapIndex(3, 2, true)).toBe(0)
  })
  test('goes backward and wraps at the start', () => {
    expect(nextTrapIndex(3, 0, false)).toBe(2)
    expect(nextTrapIndex(3, 1, false)).toBe(0)
  })
  test('current not in set (-1) starts at first (forward) or last (backward)', () => {
    expect(nextTrapIndex(3, -1, true)).toBe(0)
    expect(nextTrapIndex(3, -1, false)).toBe(2)
  })
  test('empty set returns -1', () => {
    expect(nextTrapIndex(0, 0, true)).toBe(-1)
    expect(nextTrapIndex(0, -1, false)).toBe(-1)
  })
})

describe('FOCUSABLE_SELECTOR', () => {
  test('includes enabled buttons and excludes tabindex="-1"', () => {
    expect(FOCUSABLE_SELECTOR).toContain('button:not([disabled])')
    expect(FOCUSABLE_SELECTOR).toContain('[tabindex]:not([tabindex="-1"])')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @overworld-engine/ui exec vitest run src/__tests__/focusTrap.test.ts`
Expected: FAIL — cannot resolve `../focusTrap`.

- [ ] **Step 3: Write minimal implementation**

Create `packages/ui/src/focusTrap.ts`:

```ts
/** Selector matching the tabbable elements inside a focus trap. */
export const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Next index when cycling focus with Tab (`forward`) / Shift+Tab (`!forward`),
 * wrapping around the ends. `current < 0` means the active element is not in the
 * set, so start at the first (forward) or last (backward). Empty set → -1.
 */
export function nextTrapIndex(count: number, current: number, forward: boolean): number {
  if (count <= 0) return -1
  if (current < 0) return forward ? 0 : count - 1
  return forward ? (current + 1) % count : (current - 1 + count) % count
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @overworld-engine/ui exec vitest run src/__tests__/focusTrap.test.ts`
Expected: PASS.

- [ ] **Step 5: Export from the package index**

In `packages/ui/src/index.ts`, add after the `highlightBox` export line:

```ts
export { FOCUSABLE_SELECTOR, nextTrapIndex } from './focusTrap'
```

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter @overworld-engine/ui typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/ui/src/focusTrap.ts packages/ui/src/__tests__/focusTrap.test.ts packages/ui/src/index.ts
git commit -m "feat(ui): add focusTrap pure-logic helper"
```

---

### Task 2: `gamepadAxis` pure logic

**Files:**
- Create: `packages/ui/src/gamepadAxis.ts`
- Test: `packages/ui/src/__tests__/gamepadAxis.test.ts`

(No index export here — `axisToDirection` is re-exported from the `/focus` barrel in Task 7, keeping gamepad concerns off the main entry.)

**Interfaces:**
- Produces: `type Direction = 'up' | 'down' | 'left' | 'right'`; `axisToDirection(x: number, y: number, deadZone?: number): Direction | null`.

- [ ] **Step 1: Write the failing test**

Create `packages/ui/src/__tests__/gamepadAxis.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { axisToDirection } from '../gamepadAxis'

describe('axisToDirection', () => {
  test('inside the dead zone is null', () => {
    expect(axisToDirection(0, 0)).toBeNull()
    expect(axisToDirection(0.4, -0.4)).toBeNull()
  })
  test('cardinal pushes map to directions (screen y down = down)', () => {
    expect(axisToDirection(0.8, 0)).toBe('right')
    expect(axisToDirection(-0.8, 0)).toBe('left')
    expect(axisToDirection(0, 0.8)).toBe('down')
    expect(axisToDirection(0, -0.8)).toBe('up')
  })
  test('dominant axis wins; ties resolve horizontally', () => {
    expect(axisToDirection(0.9, 0.6)).toBe('right')
    expect(axisToDirection(0.6, 0.9)).toBe('down')
    expect(axisToDirection(0.7, 0.7)).toBe('right')
  })
  test('respects a custom dead zone', () => {
    expect(axisToDirection(0.3, 0, 0.2)).toBe('right')
    expect(axisToDirection(0.3, 0, 0.5)).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @overworld-engine/ui exec vitest run src/__tests__/gamepadAxis.test.ts`
Expected: FAIL — cannot resolve `../gamepadAxis`.

- [ ] **Step 3: Write minimal implementation**

Create `packages/ui/src/gamepadAxis.ts`:

```ts
export type Direction = 'up' | 'down' | 'left' | 'right'

/**
 * Map an analog-stick position to a navigation direction. Returns null when
 * both axes are within the dead zone. Screen convention: +x = right, +y = down.
 * The dominant axis wins; a tie (`|x| === |y|`) resolves horizontally.
 */
export function axisToDirection(x: number, y: number, deadZone = 0.5): Direction | null {
  if (Math.abs(x) < deadZone && Math.abs(y) < deadZone) return null
  if (Math.abs(x) >= Math.abs(y)) return x > 0 ? 'right' : 'left'
  return y > 0 ? 'down' : 'up'
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @overworld-engine/ui exec vitest run src/__tests__/gamepadAxis.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @overworld-engine/ui typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/gamepadAxis.ts packages/ui/src/__tests__/gamepadAxis.test.ts
git commit -m "feat(ui): add gamepadAxis pure-logic helper"
```

---

### Task 3: forwardRef retrofit (Button, IconButton, Slot)

**Files:**
- Modify: `packages/ui/src/components/Button.tsx`
- Modify: `packages/ui/src/components/SlotGrid.tsx`

**Interfaces:**
- Produces: `Button`, `IconButton`, `Slot` as `ForwardRefExoticComponent`s forwarding to `HTMLButtonElement`. Props interfaces unchanged.

- [ ] **Step 1: Rewrite Button.tsx with forwardRef**

Replace the entire contents of `packages/ui/src/components/Button.tsx` with:

```tsx
import { forwardRef, type ButtonHTMLAttributes } from 'react'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost' | 'danger'
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', className, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      className={className ? `ow-button ${className}` : 'ow-button'}
      data-ow-variant={variant}
      {...rest}
    />
  )
})

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Accessible name — required because the content is icon-only. */
  label: string
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, className, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      className={className ? `ow-icon-button ${className}` : 'ow-icon-button'}
      aria-label={label}
      {...rest}
    />
  )
})
```

- [ ] **Step 2: Rewrite the Slot export in SlotGrid.tsx with forwardRef**

In `packages/ui/src/components/SlotGrid.tsx`, keep `SlotGrid` and `SlotGridProps` and `SlotProps` unchanged. Change the top import line from:

```tsx
import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react'
```

to:

```tsx
import { forwardRef, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from 'react'
```

Then replace the entire `export function Slot(...) { ... }` definition with:

```tsx
export const Slot = forwardRef<HTMLButtonElement, SlotProps>(function Slot(
  { icon, quantity, rarity, keybind, selected, className, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
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
})
```

- [ ] **Step 3: Typecheck, build, gallery typecheck (existing usages must still compile)**

Run: `pnpm --filter @overworld-engine/ui typecheck`
Expected: no errors.

Run: `pnpm --filter @overworld-engine/ui build`
Expected: build succeeds.

Run: `pnpm --filter ui-gallery typecheck`
Expected: no errors (proves SlotGrid/DialogueBox/all stories still compile against the forwardRef components).

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/components/Button.tsx packages/ui/src/components/SlotGrid.tsx
git commit -m "feat(ui): forwardRef on Button, IconButton, Slot"
```

---

### Task 4: Modal DOM focus trap

**Files:**
- Modify: `packages/ui/src/components/Modal.tsx`

**Interfaces:**
- Consumes: `FOCUSABLE_SELECTOR`, `nextTrapIndex` (Task 1).
- Produces: `Modal` (props unchanged) with a focus trap.

- [ ] **Step 1: Rewrite Modal.tsx**

Replace the entire contents of `packages/ui/src/components/Modal.tsx` with:

```tsx
import { useEffect, useRef, type ReactNode } from 'react'
import { FOCUSABLE_SELECTOR, nextTrapIndex } from '../focusTrap'

export interface ModalProps {
  open: boolean
  /** Called on backdrop click or Escape. Omit to make the modal non-dismissable. */
  onDismiss?: () => void
  children?: ReactNode
}

/**
 * Centered modal layer with a keyboard focus trap: on open it focuses the first
 * focusable inside (or the dialog itself), cycles Tab/Shift+Tab within, calls
 * `onDismiss` on Escape, and restores focus on close. Renders nothing when closed.
 */
export function Modal({ open, onDismiss, children }: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const previouslyFocused = document.activeElement as HTMLElement | null
    const modal = modalRef.current
    const focusables = (): HTMLElement[] =>
      modal ? Array.from(modal.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)) : []
    ;(focusables()[0] ?? modal)?.focus()

    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        onDismiss?.()
        return
      }
      if (e.key !== 'Tab') return
      const els = focusables()
      e.preventDefault()
      if (els.length === 0) return
      const idx = els.indexOf(document.activeElement as HTMLElement)
      els[nextTrapIndex(els.length, idx, !e.shiftKey)]?.focus()
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      previouslyFocused?.focus?.()
    }
  }, [open, onDismiss])

  if (!open) return null
  return (
    <div
      className="ow-modal-backdrop"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onDismiss?.()
      }}
    >
      <div className="ow-modal" role="dialog" aria-modal="true" ref={modalRef} tabIndex={-1}>
        {children}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck, build, gallery typecheck**

Run: `pnpm --filter @overworld-engine/ui typecheck`
Expected: no errors.

Run: `pnpm --filter @overworld-engine/ui build`
Expected: build succeeds.

Run: `pnpm --filter ui-gallery typecheck`
Expected: no errors (Modal props unchanged; existing usages compile).

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/components/Modal.tsx
git commit -m "feat(ui): add keyboard focus trap to Modal"
```

---

### Task 5: `/focus` subpath scaffolding + FocusProvider + norigin peer dependency

**Files:**
- Modify: `packages/ui/package.json` (peerDep + peerDepMeta + devDep + `./focus` export)
- Modify: `packages/ui/tsup.config.ts` (second entry)
- Create: `packages/ui/src/focus/FocusProvider.tsx`
- Create: `packages/ui/src/focus/index.ts`

**Interfaces:**
- Produces (from `@overworld-engine/ui/focus`): `FocusProvider(props: FocusProviderProps)` with `interface FocusProviderProps { children?: ReactNode; focusKey?: string }`; plus re-exports `useFocusable`, `FocusContext`, `setFocus`, `navigateByDirection`, and type `Direction` from norigin.

- [ ] **Step 1: Add norigin to package.json (peer optional + dev) and the `./focus` export**

In `packages/ui/package.json`:

(a) Add `./focus` to the `exports` object (after the `"."` entry, keeping `styles.css`/`themes` entries):

```json
    "./focus": {
      "types": "./dist/focus/index.d.ts",
      "import": "./dist/focus/index.js"
    },
```

(b) After the `peerDependencies` object, add a `peerDependenciesMeta` object AND add norigin to `peerDependencies`. The result should be:

```json
  "peerDependencies": {
    "react": "^18.0.0",
    "zustand": "^5.0.0",
    "@noriginmedia/norigin-spatial-navigation": "^3.2.1"
  },
  "peerDependenciesMeta": {
    "@noriginmedia/norigin-spatial-navigation": {
      "optional": true
    }
  },
```

(c) Add a `devDependencies` object (the package currently has none) so this package can typecheck/build the `/focus` code:

```json
  "devDependencies": {
    "@noriginmedia/norigin-spatial-navigation": "^3.2.1"
  },
```

- [ ] **Step 2: Add the second tsup entry**

Replace `packages/ui/tsup.config.ts` contents with:

```ts
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts', 'src/focus/index.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
})
```

- [ ] **Step 3: Install to link norigin**

Run from the repo root: `pnpm install`
Expected: completes; `@noriginmedia/norigin-spatial-navigation` resolvable in `packages/ui/node_modules`.

- [ ] **Step 4: Create FocusProvider**

Create `packages/ui/src/focus/FocusProvider.tsx`:

```tsx
import { useState, type ReactNode } from 'react'
import { init, useFocusable, FocusContext } from '@noriginmedia/norigin-spatial-navigation'

let initialized = false
function ensureInit(): void {
  if (!initialized) {
    init({})
    initialized = true
  }
}

export interface FocusProviderProps {
  children?: ReactNode
  /** Focus key for the root region. @default 'OW_FOCUS_ROOT' */
  focusKey?: string
}

/**
 * Root of a spatial-navigation region: initializes norigin once (installs its
 * global key listeners) and provides the root `FocusContext`. Wrap the part of
 * the UI that should be keyboard/gamepad navigable.
 */
export function FocusProvider({ children, focusKey = 'OW_FOCUS_ROOT' }: FocusProviderProps) {
  // Run init() once, during the first render, before useFocusable registers.
  useState(() => {
    ensureInit()
    return null
  })
  const { ref, focusKey: rootKey } = useFocusable({
    focusKey,
    saveLastFocusedChild: true,
    trackChildren: true,
  })
  return (
    <FocusContext.Provider value={rootKey}>
      <div ref={ref} className="ow-focus-root">
        {children}
      </div>
    </FocusContext.Provider>
  )
}
```

- [ ] **Step 5: Create the `/focus` barrel**

Create `packages/ui/src/focus/index.ts`:

```ts
export { FocusProvider } from './FocusProvider'
export type { FocusProviderProps } from './FocusProvider'

// Re-export norigin's primitives so consumers use them through this subpath.
export {
  useFocusable,
  FocusContext,
  setFocus,
  navigateByDirection,
} from '@noriginmedia/norigin-spatial-navigation'
export type { Direction } from '@noriginmedia/norigin-spatial-navigation'
```

- [ ] **Step 6: Typecheck + build (produces dist/focus)**

Run: `pnpm --filter @overworld-engine/ui typecheck`
Expected: no errors (FocusProvider compiles against real norigin types).

Run: `pnpm --filter @overworld-engine/ui build`
Expected: build succeeds; `packages/ui/dist/focus/index.js` and `packages/ui/dist/focus/index.d.ts` are produced.

- [ ] **Step 7: Confirm the focus entry built**

Run: `ls packages/ui/dist/focus/`
Expected: lists `index.js` and `index.d.ts`.

- [ ] **Step 8: Commit**

```bash
git add packages/ui/package.json packages/ui/tsup.config.ts packages/ui/src/focus/FocusProvider.tsx packages/ui/src/focus/index.ts pnpm-lock.yaml
git commit -m "feat(ui): add /focus subpath scaffolding + FocusProvider (optional norigin peer dep)"
```

---

### Task 6: Focusable + useSpatialFocus

**Files:**
- Create: `packages/ui/src/focus/Focusable.tsx`
- Create: `packages/ui/src/focus/useSpatialFocus.ts`
- Modify: `packages/ui/src/focus/index.ts`

**Interfaces:**
- Consumes: norigin `useFocusable`, `setFocus`, `navigateByDirection`, `getCurrentFocusKey`.
- Produces: `Focusable<E extends HTMLElement>(props: FocusableProps<E>)`; `interface FocusableProps<E extends HTMLElement = HTMLElement> { focusKey?: string; onEnterPress?: () => void; onFocus?: () => void; children: (state: { ref: RefObject<E>; focused: boolean; focusSelf: () => void }) => ReactNode }`. `useSpatialFocus(): { setFocus; navigate; currentFocusKey }`.

- [ ] **Step 1: Create Focusable**

Create `packages/ui/src/focus/Focusable.tsx`:

```tsx
import type { ReactNode, RefObject } from 'react'
import { useFocusable } from '@noriginmedia/norigin-spatial-navigation'

export interface FocusableProps<E extends HTMLElement = HTMLElement> {
  focusKey?: string
  onEnterPress?: () => void
  onFocus?: () => void
  /**
   * Render-prop child. Attach `ref` to a DOM element (e.g. a forwardRef
   * `Slot`/`Button`) and use `focused` to style the focused state.
   */
  children: (state: { ref: RefObject<E>; focused: boolean; focusSelf: () => void }) => ReactNode
}

/** Makes its render-prop child spatially focusable via norigin. */
export function Focusable<E extends HTMLElement = HTMLElement>({
  focusKey,
  onEnterPress,
  onFocus,
  children,
}: FocusableProps<E>) {
  const { ref, focused, focusSelf } = useFocusable<object, E>({
    focusKey,
    onEnterPress: onEnterPress ? () => onEnterPress() : undefined,
    onFocus: onFocus ? () => onFocus() : undefined,
  })
  return <>{children({ ref, focused, focusSelf })}</>
}
```

- [ ] **Step 2: Create useSpatialFocus**

Create `packages/ui/src/focus/useSpatialFocus.ts`:

```ts
import {
  setFocus,
  navigateByDirection,
  getCurrentFocusKey,
} from '@noriginmedia/norigin-spatial-navigation'

export interface SpatialFocusApi {
  /** Move focus to a specific focus key. */
  setFocus: typeof setFocus
  /** Move focus in a direction ('up' | 'down' | 'left' | 'right'). */
  navigate: typeof navigateByDirection
  /** The currently focused key. */
  currentFocusKey: () => string
}

/** Imperative spatial-focus controls (thin wrapper over norigin's module API). */
export function useSpatialFocus(): SpatialFocusApi {
  return { setFocus, navigate: navigateByDirection, currentFocusKey: getCurrentFocusKey }
}
```

- [ ] **Step 3: Extend the `/focus` barrel**

In `packages/ui/src/focus/index.ts`, add after the `FocusProvider` exports:

```ts
export { Focusable } from './Focusable'
export type { FocusableProps } from './Focusable'
export { useSpatialFocus } from './useSpatialFocus'
export type { SpatialFocusApi } from './useSpatialFocus'
```

- [ ] **Step 4: Typecheck + build**

Run: `pnpm --filter @overworld-engine/ui typecheck`
Expected: no errors (the generic `Focusable` and the imperative hook compile against norigin's types).

Run: `pnpm --filter @overworld-engine/ui build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/focus/Focusable.tsx packages/ui/src/focus/useSpatialFocus.ts packages/ui/src/focus/index.ts
git commit -m "feat(ui): add Focusable + useSpatialFocus to /focus"
```

---

### Task 7: useGamepadFocus + gallery focus story

**Files:**
- Create: `packages/ui/src/focus/useGamepadFocus.ts`
- Modify: `packages/ui/src/focus/index.ts`
- Modify: `examples/ui-gallery/package.json` (add norigin dep)
- Create: `examples/ui-gallery/src/Focus.stories.tsx`

**Interfaces:**
- Consumes: `axisToDirection`/`Direction` (Task 2), norigin `navigateByDirection`.
- Produces: `useGamepadFocus(options?: UseGamepadFocusOptions): void` with `interface UseGamepadFocusOptions { deadZone?: number; repeatMs?: number; enabled?: boolean }`. Re-exports `axisToDirection` from `/focus`.

- [ ] **Step 1: Create useGamepadFocus**

Create `packages/ui/src/focus/useGamepadFocus.ts`:

```ts
import { useEffect, useRef } from 'react'
import { navigateByDirection } from '@noriginmedia/norigin-spatial-navigation'
import { axisToDirection } from '../gamepadAxis'

export interface UseGamepadFocusOptions {
  /** Analog-stick dead zone. @default 0.5 */
  deadZone?: number
  /** Minimum ms between repeated directional moves while a direction is held. @default 180 */
  repeatMs?: number
  /** Poll and navigate only when true. @default true */
  enabled?: boolean
}

/**
 * Bridge a gamepad to spatial navigation: the left stick / D-pad move focus via
 * `navigateByDirection`, and the A button (index 0) dispatches a synthetic Enter
 * keydown so norigin's `onEnterPress` handlers fire. No-op when disabled or when
 * the Gamepad API / a connected pad is unavailable.
 */
export function useGamepadFocus(options?: UseGamepadFocusOptions): void {
  const { deadZone = 0.5, repeatMs = 180, enabled = true } = options ?? {}
  const lastMove = useRef(0)
  const aWasDown = useRef(false)

  useEffect(() => {
    if (!enabled || typeof navigator === 'undefined' || !navigator.getGamepads) return
    let raf = 0
    const tick = (now: number): void => {
      const pad = navigator.getGamepads?.()[0]
      if (pad) {
        const dpad = pad.buttons[12]?.pressed
          ? 'up'
          : pad.buttons[13]?.pressed
            ? 'down'
            : pad.buttons[14]?.pressed
              ? 'left'
              : pad.buttons[15]?.pressed
                ? 'right'
                : null
        const dir = dpad ?? axisToDirection(pad.axes[0] ?? 0, pad.axes[1] ?? 0, deadZone)
        if (dir && now - lastMove.current >= repeatMs) {
          lastMove.current = now
          void navigateByDirection(dir, {})
        } else if (!dir) {
          lastMove.current = 0
        }
        const aDown = pad.buttons[0]?.pressed ?? false
        if (aDown && !aWasDown.current) {
          window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
          window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }))
        }
        aWasDown.current = aDown
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [enabled, deadZone, repeatMs])
}
```

- [ ] **Step 2: Extend the `/focus` barrel**

In `packages/ui/src/focus/index.ts`, add after the `useSpatialFocus` exports:

```ts
export { useGamepadFocus } from './useGamepadFocus'
export type { UseGamepadFocusOptions } from './useGamepadFocus'
export { axisToDirection } from '../gamepadAxis'
```

- [ ] **Step 3: Add norigin to the gallery dependencies**

In `examples/ui-gallery/package.json`, add to the `dependencies` object (alphabetical — it sorts to the top, before `@overworld-engine/achievements`):

```json
    "@noriginmedia/norigin-spatial-navigation": "^3.2.1",
```

- [ ] **Step 4: Install to link norigin into the gallery**

Run from the repo root: `pnpm install`
Expected: completes; norigin linked into `examples/ui-gallery/node_modules`.

- [ ] **Step 5: Create the gallery focus story**

Create `examples/ui-gallery/src/Focus.stories.tsx`:

```tsx
import { useState } from 'react'
import { Slot, SlotGrid } from '@overworld-engine/ui'
import { Focusable, FocusProvider, useGamepadFocus } from '@overworld-engine/ui/focus'

export default { title: 'HUD / Focus' }

const ITEMS = ['🗡️', '🛡️', '🧪', '🍞', '🔑', '💰', '📜', '🏹', '💎', '🪓']

export const SpatialGrid = () => {
  const [picked, setPicked] = useState<string | null>(null)
  useGamepadFocus()
  return (
    <FocusProvider>
      <div style={{ display: 'grid', gap: 12, maxWidth: 320 }}>
        <p style={{ margin: 0, fontSize: 13 }}>
          Arrow keys / gamepad move focus · Enter / A selects{picked ? ` · picked ${picked}` : ''}
        </p>
        <SlotGrid columns={5}>
          {ITEMS.map((icon, i) => (
            <Focusable<HTMLButtonElement> key={i} onEnterPress={() => setPicked(icon)}>
              {({ ref, focused }) => (
                <Slot ref={ref} icon={icon} selected={focused} onClick={() => setPicked(icon)} />
              )}
            </Focusable>
          ))}
        </SlotGrid>
      </div>
    </FocusProvider>
  )
}
```

- [ ] **Step 6: Typecheck, build, gallery typecheck**

Run: `pnpm --filter @overworld-engine/ui typecheck`
Expected: no errors.

Run: `pnpm --filter @overworld-engine/ui build`
Expected: build succeeds (regenerates `dist/focus` with the new exports).

Run: `pnpm --filter ui-gallery typecheck`
Expected: no errors (proves `@overworld-engine/ui/focus` resolves and the generic `Focusable` + `Slot` forwardRef compose).

- [ ] **Step 7: Commit**

```bash
git add packages/ui/src/focus/useGamepadFocus.ts packages/ui/src/focus/index.ts examples/ui-gallery/package.json examples/ui-gallery/src/Focus.stories.tsx pnpm-lock.yaml
git commit -m "feat(ui): add useGamepadFocus + gallery focus story"
```

---

### Task 8: Changeset + full module verification

**Files:**
- Create: `.changeset/p0-spatial-focus.md`

- [ ] **Step 1: Write the changeset**

Create `.changeset/p0-spatial-focus.md`:

```md
---
'@overworld-engine/ui': minor
---

Add spatial focus navigation as an opt-in `@overworld-engine/ui/focus` subpath
(FocusProvider, Focusable, useSpatialFocus, useGamepadFocus), backed by
`@noriginmedia/norigin-spatial-navigation` as an OPTIONAL peer dependency — the
core package stays dependency-free. Also: Button/IconButton/Slot now forward
refs, and Modal gains a keyboard focus trap (Tab cycling, Escape to dismiss,
focus restore on close).
```

- [ ] **Step 2: Run the full package test suite**

Run: `pnpm --filter @overworld-engine/ui test`
Expected: all tests pass (existing suite + `focusTrap` + `gamepadAxis`).

- [ ] **Step 3: Typecheck + build the package**

Run: `pnpm --filter @overworld-engine/ui typecheck && pnpm --filter @overworld-engine/ui build`
Expected: no errors; `dist/index.*` and `dist/focus/index.*` regenerated.

- [ ] **Step 4: Typecheck the gallery**

Run: `pnpm --filter ui-gallery typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add .changeset/p0-spatial-focus.md
git commit -m "chore(ui): changeset for P0 spatial focus navigation"
```

---

## Notes for the implementer

- **Zero-dep boundary:** norigin may be imported ONLY under `packages/ui/src/focus/`. The core (`focusTrap.ts`, `gamepadAxis.ts`, all `components/*`) must not import it. `gamepadAxis.ts` lives in `src/` (pure, dep-free) and is re-exported from `/focus`, not the main barrel.
- **Build order for gallery typecheck:** the gallery imports the built `@overworld-engine/ui` (including `dist/focus`). Always build ui before `pnpm --filter ui-gallery typecheck`.
- **`pnpm install` runs twice** (Task 5 adds norigin to the ui package; Task 7 adds it to the gallery). Commit the updated `pnpm-lock.yaml` each time.
- **norigin is external in the bundle:** tsup externalizes peer/deps, so `dist/focus/index.js` imports norigin at runtime rather than bundling it — correct for an optional peer dep.
- **Focus-trap & spatial-nav runtime behavior is not unit-tested** (the repo has no DOM test harness). The pure pieces (`nextTrapIndex`, `axisToDirection`) are tested; the wiring is verified by typecheck + build + gallery typecheck, with the `Focus` story as a manual/visual smoke check. A browser pass to confirm arrow-key/gamepad navigation is a reasonable follow-up but is out of this plan's automated gate.
- **`Focusable` is generic** (`<Focusable<HTMLButtonElement>>` in the story) to avoid a ref-variance type error when attaching norigin's ref to `Slot`'s `HTMLButtonElement` ref.
