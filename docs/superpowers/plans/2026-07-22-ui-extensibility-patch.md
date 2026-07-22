# UI Extensibility Patch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Patch four extensibility/tooling gaps in `@overworld-engine/ui`: enforce the zero-cross-package-import rule with dependency-cruiser, add a `packages/ui/README.md`, add `asChild` polymorphism to `Button`/`IconButton` via a new public `Slot` primitive, and rewrite `Modal` as a compound component (`Modal.Root`/`Modal.Content`/`Modal.Close`).

**Architecture:** All ui-package work builds on one new primitive (`Slot`) that `Button`, `IconButton`, and `Modal.Close` share for `asChild` support. The `Modal` rewrite is a breaking API change (function component → `{ Root, Content, Close }` namespace) bundled with an unrelated-but-necessary rename (`SlotGrid`'s barrel export `Slot` → `InventorySlot`, to free up the `Slot` name for the new primitive) — both land in the same major version. The dependency-cruiser rule is fully independent of the UI changes and enforces repo-wide package boundaries via CI.

**Tech Stack:** TypeScript, React 18 (forwardRef, Context), tsup (build), vitest (pure-logic tests only — no `@testing-library/react`, matching existing repo convention), pnpm workspaces, changesets (fixed version group `@overworld-engine/*`), dependency-cruiser, GitHub Actions.

Design spec: `docs/superpowers/specs/2026-07-22-ui-extensibility-patch-design.md` (read this first for the "why" behind each decision — naming conflict resolution, Modal compatibility choice, dependency-cruiser whitelist rationale).

## Global Constraints

- Repo has **no ESLint** — do not introduce one; dependency-cruiser is the only new lint-like tool, single purpose.
- No `@testing-library/react` or any component-rendering test library — pure-logic vitest tests only, consistent with `packages/ui/src/__tests__/focusTrap.test.ts`.
- `packages/ui` peerDeps stay unchanged (`react ^18.0.0`, `zustand ^5.0.0`, optional `@noriginmedia/norigin-spatial-navigation ^3.2.1`) — nothing in this patch adds a new runtime dependency to `ui`.
- Changesets use a **fixed version group** (`.changeset/config.json`: `"fixed": [["@overworld-engine/*"]]`) — any bump to `@overworld-engine/ui` releases every `@overworld-engine/*` package at the same new version. This is expected, existing repo behavior, not something to work around.
- `pnpm --filter <name> <script>` is the correct way to run a single package's `build`/`typecheck`/`test` scripts throughout this plan (confirmed working during spec validation).
- Every code change in this plan was hand-verified against the real repo before being written down (typecheck + build + vitest all green) — the exact code below is known-good, not illustrative.

---

### Task 1: Enforce package import boundaries with dependency-cruiser

**Files:**
- Create: `.dependency-cruiser.cjs`
- Modify: `package.json:16-30` (root) — add `depcruise` script and devDependency
- Modify: `.github/workflows/ci.yml:33-37` — add boundary-check CI step

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `pnpm depcruise` — a repo-root script other tasks/CI can invoke. No code-level exports.

- [ ] **Step 1: Install dependency-cruiser**

Run: `pnpm add -D -w dependency-cruiser@^18.1.0`
Expected: adds `"dependency-cruiser": "^18.1.0"` to the root `package.json` `devDependencies` and updates `pnpm-lock.yaml`.

- [ ] **Step 2: Write the boundary rule config**

Create `.dependency-cruiser.cjs`:

```js
module.exports = {
  forbidden: [
    {
      name: 'no-cross-package-imports',
      severity: 'error',
      comment:
        'Package systems must only depend on @overworld-engine/core; cross-system ' +
        'communication goes through the typed event bus (gameEvents), not direct imports. ' +
        'See README.md "系统之间零依赖".',
      from: {
        path: '^packages/(?!core/)([^/]+)/src',
        pathNot: [
          '__tests__',
          // Pre-existing undeclared cross-package imports, out of scope for this
          // patch — see docs/superpowers/specs/2026-07-22-ui-extensibility-patch-design.md
          '^packages/inspector/src/EventBusInspector\\.tsx$',
          '^packages/content/src/validateContentPack\\.ts$',
          '^packages/adapters-weapp/src/joystick\\.ts$',
          '^packages/adapters-weapp/src/bridge\\.ts$',
        ],
      },
      to: {
        path: '^packages/(?!core/)(?!$1/)[^/]+/',
      },
    },
  ],
  options: {
    doNotFollow: {
      path: 'node_modules',
    },
    tsConfig: {
      fileName: 'tsconfig.base.json',
    },
  },
}
```

- [ ] **Step 3: Add the root script**

In `package.json`, add to `"scripts"` (after `"clean"`, before `"docs:dev"`):

```json
    "depcruise": "depcruise packages --config .dependency-cruiser.cjs",
```

- [ ] **Step 4: Run it and verify it passes clean**

Run: `pnpm depcruise`
Expected: `✔ no dependency violations found (415 modules, 928 dependencies cruised)` (module/dependency counts may drift slightly as the repo changes, but the command must exit 0 with no violations).

- [ ] **Step 5: Wire into CI**

In `.github/workflows/ci.yml`, in the `packages` job, insert a new step after `Build packages` and before `Typecheck packages` (boundary resolution needs each package's built `dist`, same reason `Typecheck packages` already runs after the build step):

```yaml
      - name: Build packages
        run: pnpm -r --filter './packages/*' build

      - name: Check package boundaries
        run: pnpm depcruise

      - name: Typecheck packages
        run: pnpm -r --filter './packages/*' typecheck
```

- [ ] **Step 6: Commit**

```bash
git add .dependency-cruiser.cjs package.json pnpm-lock.yaml .github/workflows/ci.yml
git commit -m "chore: enforce zero-cross-package-import with dependency-cruiser"
```

---

### Task 2: Add the `Slot` asChild primitive (and resolve the `Slot`/`InventorySlot` naming conflict)

**Files:**
- Create: `packages/ui/src/primitives/Slot.tsx`
- Create: `packages/ui/src/__tests__/slotMerge.test.ts`
- Modify: `packages/ui/src/index.ts:36-37` — rename the `SlotGrid` barrel export, add the new `Slot` export
- Modify: `examples/ui-gallery/src/Slots.stories.tsx` — rename `Slot` usages to `InventorySlot`
- Modify: `examples/ui-gallery/src/Focus.stories.tsx` — rename `Slot` usages to `InventorySlot`
- Modify: `examples/ui-gallery/src/FullHud.stories.tsx` — rename `Slot` usages to `InventorySlot`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `Slot` (forwardRef component), `SlotProps` interface, `mergeProps(slotProps, childProps)`, `mergeRefs(...refs)` — all from `packages/ui/src/primitives/Slot.tsx`. Task 3 and Task 4 import `Slot` from `'../primitives/Slot'`.

- [ ] **Step 1: Write the failing tests for the merge helpers**

Create `packages/ui/src/__tests__/slotMerge.test.ts`:

```ts
import { describe, expect, test, vi } from 'vitest'
import { mergeProps, mergeRefs } from '../primitives/Slot'

describe('mergeProps', () => {
  test('concatenates className when both sides have one', () => {
    expect(mergeProps({ className: 'ow-button' }, { className: 'user-class' })).toMatchObject({
      className: 'ow-button user-class',
    })
  })

  test('keeps slot className when child has none', () => {
    expect(mergeProps({ className: 'ow-button' }, {})).toMatchObject({ className: 'ow-button' })
  })

  test('merges style with child values winning per-key', () => {
    const merged = mergeProps({ style: { color: 'red', fontSize: 12 } }, { style: { color: 'blue' } })
    expect(merged.style).toEqual({ color: 'blue', fontSize: 12 })
  })

  test('calls both event handlers, slot first then child', () => {
    const calls: string[] = []
    const slotOnClick = () => calls.push('slot')
    const childOnClick = () => calls.push('child')
    const merged = mergeProps({ onClick: slotOnClick }, { onClick: childOnClick })
    ;(merged.onClick as () => void)()
    expect(calls).toEqual(['slot', 'child'])
  })

  test('non-special keys fall back to child value when present', () => {
    expect(mergeProps({ 'data-ow-variant': 'primary' }, { 'data-ow-variant': 'ghost' })).toMatchObject({
      'data-ow-variant': 'ghost',
    })
  })

  test('non-special keys fall back to slot value when child omits them', () => {
    expect(mergeProps({ 'data-ow-variant': 'primary' }, {})).toMatchObject({ 'data-ow-variant': 'primary' })
  })
})

describe('mergeRefs', () => {
  test('assigns object refs', () => {
    const refA = { current: null }
    const refB = { current: null }
    mergeRefs(refA, refB)('node' as unknown as null)
    expect(refA.current).toBe('node')
    expect(refB.current).toBe('node')
  })

  test('calls function refs', () => {
    const fnA = vi.fn()
    const fnB = vi.fn()
    mergeRefs(fnA, fnB)('node' as unknown as null)
    expect(fnA).toHaveBeenCalledWith('node')
    expect(fnB).toHaveBeenCalledWith('node')
  })

  test('ignores undefined refs', () => {
    const refA = { current: null }
    expect(() => mergeRefs(refA, undefined)('node' as unknown as null)).not.toThrow()
    expect(refA.current).toBe('node')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @overworld-engine/ui test -- slotMerge`
Expected: FAIL — `Cannot find module '../primitives/Slot'` (the file doesn't exist yet).

- [ ] **Step 3: Implement the Slot primitive**

Create `packages/ui/src/primitives/Slot.tsx`:

```tsx
import { cloneElement, forwardRef, isValidElement, type HTMLAttributes, type ReactElement, type ReactNode, type Ref } from 'react'

export interface SlotProps extends HTMLAttributes<HTMLElement> {
  children?: ReactNode
}

type PropsWithRef = Record<string, unknown> & { ref?: Ref<unknown> }

export function mergeProps(
  slotProps: Record<string, unknown>,
  childProps: Record<string, unknown>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...slotProps, ...childProps }
  for (const key in slotProps) {
    const slotValue = slotProps[key]
    const childValue = childProps[key]
    const isHandler = /^on[A-Z]/.test(key)
    if (isHandler && typeof slotValue === 'function' && typeof childValue === 'function') {
      merged[key] = (...args: unknown[]) => {
        ;(slotValue as (...a: unknown[]) => void)(...args)
        ;(childValue as (...a: unknown[]) => void)(...args)
      }
    } else if (key === 'style' && slotValue && childValue) {
      merged[key] = { ...(slotValue as object), ...(childValue as object) }
    } else if (key === 'className' && slotValue) {
      merged[key] = childValue ? `${slotValue as string} ${childValue as string}` : slotValue
    }
  }
  return merged
}

export function mergeRefs<T>(...refs: Array<Ref<T> | undefined>): (value: T | null) => void {
  return (value) => {
    for (const ref of refs) {
      if (typeof ref === 'function') ref(value)
      else if (ref) (ref as { current: T | null }).current = value
    }
  }
}

/**
 * Merges its own props/ref onto its single child element instead of rendering
 * a DOM node of its own — used by `asChild`-capable components (Button,
 * IconButton, Modal.Close) so consumers can swap the rendered tag (e.g. an
 * anchor or router Link) while keeping the component's styling/behavior.
 */
export const Slot = forwardRef<HTMLElement, SlotProps>(function Slot({ children, ...slotProps }, forwardedRef) {
  if (!isValidElement(children)) {
    console.error('<Slot> expects exactly one valid React element child; rendering children as-is.')
    return <>{children ?? null}</>
  }
  const child = children as ReactElement<Record<string, unknown>> & PropsWithRef
  return cloneElement(child, {
    ...mergeProps(slotProps as Record<string, unknown>, child.props),
    ref: mergeRefs(forwardedRef, child.ref),
  })
})
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @overworld-engine/ui test -- slotMerge`
Expected: PASS — 9 tests passing.

- [ ] **Step 5: Resolve the barrel naming conflict and export the new primitive**

In `packages/ui/src/index.ts`, replace:

```ts
export { Button, IconButton } from './components/Button'
export type { ButtonProps, IconButtonProps } from './components/Button'
export { Modal } from './components/Modal'
export type { ModalProps } from './components/Modal'
export { Bar } from './components/Bar'
export type { BarProps } from './components/Bar'
export { SlotGrid, Slot } from './components/SlotGrid'
export type { SlotGridProps, SlotProps } from './components/SlotGrid'
```

with:

```ts
export { Button, IconButton } from './components/Button'
export type { ButtonProps, IconButtonProps } from './components/Button'
export { Modal } from './components/Modal'
export type { ModalRootProps, ModalContentProps, ModalCloseProps } from './components/Modal'
export { Slot } from './primitives/Slot'
export type { SlotProps } from './primitives/Slot'
export { Bar } from './components/Bar'
export type { BarProps } from './components/Bar'
export { SlotGrid, Slot as InventorySlot } from './components/SlotGrid'
export type { SlotGridProps, SlotProps as InventorySlotProps } from './components/SlotGrid'
```

(The `Modal` type-export line changes here too — it will only compile after Task 4 rewrites `Modal.tsx`. If you're executing tasks in order, this is expected: Tasks 2, 3 leave `packages/ui` mid-migration and `pnpm --filter @overworld-engine/ui typecheck` will fail until Task 4 lands. That's fine — each task's own verification step below only asserts what that task is responsible for.)

- [ ] **Step 6: Rename `Slot` usages to `InventorySlot` in the three gallery files that use the inventory grid slot**

In `examples/ui-gallery/src/Slots.stories.tsx`, replace the whole file with:

```tsx
import { Hotbar, InventorySlot, SlotGrid, Tooltip } from '@overworld-engine/ui'

export default { title: 'Primitives / Slots' }

export const Rarities = () => (
  <SlotGrid columns={4}>
    <InventorySlot icon="🧪" quantity={3} rarity="common" />
    <InventorySlot icon="🗡️" rarity="rare" />
    <InventorySlot icon="🛡️" rarity="epic" />
    <InventorySlot icon="👑" rarity="legendary" selected />
  </SlotGrid>
)

export const HotbarStory = () => (
  <Hotbar>
    <Tooltip content="Health Potion">
      <InventorySlot icon="🧪" quantity={3} keybind="1" />
    </Tooltip>
    <InventorySlot icon="🗡️" keybind="2" rarity="rare" />
    <InventorySlot keybind="3" />
    <InventorySlot keybind="4" />
  </Hotbar>
)
HotbarStory.storyName = 'Hotbar'
```

In `examples/ui-gallery/src/Focus.stories.tsx`, change the import line:

```ts
import { InventorySlot, SlotGrid } from '@overworld-engine/ui'
```

and the one JSX usage:

```tsx
                <InventorySlot ref={ref} icon={icon} selected={focused} onClick={() => setPicked(icon)} />
```

In `examples/ui-gallery/src/FullHud.stories.tsx`, change the import block:

```ts
import {
  Bar,
  Button,
  DialogueBox,
  Hotbar,
  Hud,
  InventorySlot,
  InventoryWindow,
  QuestLogWindow,
  QuestTracker,
  ToastViewport,
  useUiStore,
} from '@overworld-engine/ui'
```

and the two JSX usages:

```tsx
            <InventorySlot icon="🧪" quantity={5} keybind="1" onClick={() => inventory.use('potion')} />
            <InventorySlot keybind="2" />
```

- [ ] **Step 7: Run the ui package's full test suite to confirm nothing else broke**

Run: `pnpm --filter @overworld-engine/ui test`
Expected: all test files pass (63 tests as of this writing — count may drift with unrelated future changes, but there must be zero failures).

- [ ] **Step 8: Commit**

```bash
git add packages/ui/src/primitives packages/ui/src/__tests__/slotMerge.test.ts packages/ui/src/index.ts \
        examples/ui-gallery/src/Slots.stories.tsx examples/ui-gallery/src/Focus.stories.tsx \
        examples/ui-gallery/src/FullHud.stories.tsx
git commit -m "feat(ui): add public Slot asChild primitive; rename inventory Slot export to InventorySlot"
```

---

### Task 3: Add `asChild` to `Button` and `IconButton`

**Files:**
- Modify: `packages/ui/src/components/Button.tsx` (full file)
- Modify: `examples/ui-gallery/src/Button.stories.tsx` — add an `asChild` demo story

**Interfaces:**
- Consumes: `Slot` from `packages/ui/src/primitives/Slot.tsx` (Task 2).
- Produces: `ButtonProps.asChild?: boolean`, `IconButtonProps.asChild?: boolean`. No other task depends on these directly.

- [ ] **Step 1: Rewrite Button.tsx with asChild support**

Replace the full contents of `packages/ui/src/components/Button.tsx`:

```tsx
import { forwardRef, type ButtonHTMLAttributes, type ElementType } from 'react'
import { Slot } from '../primitives/Slot'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost' | 'danger'
  /** Render props/ref onto the single child element instead of a `<button>`. */
  asChild?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', className, asChild, ...rest },
  ref,
) {
  const Comp: ElementType = asChild ? Slot : 'button'
  return (
    <Comp
      ref={ref}
      {...(asChild ? {} : { type: 'button' })}
      className={className ? `ow-button ${className}` : 'ow-button'}
      data-ow-variant={variant}
      {...rest}
    />
  )
})

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Accessible name — required because the content is icon-only. */
  label: string
  /** Render props/ref onto the single child element instead of a `<button>`. */
  asChild?: boolean
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, className, asChild, ...rest },
  ref,
) {
  const Comp: ElementType = asChild ? Slot : 'button'
  return (
    <Comp
      ref={ref}
      {...(asChild ? {} : { type: 'button' })}
      className={className ? `ow-icon-button ${className}` : 'ow-icon-button'}
      aria-label={label}
      {...rest}
    />
  )
})
```

- [ ] **Step 2: Typecheck the ui package**

Run: `pnpm --filter @overworld-engine/ui typecheck`
Expected: PASS with no errors (this will still fail on unrelated `Modal` type errors if Task 4 hasn't landed yet — if so, confirm the *only* errors are in `Modal.tsx`/`index.ts`'s `Modal` type re-export, not in `Button.tsx`).

- [ ] **Step 3: Add a gallery story demonstrating asChild**

In `examples/ui-gallery/src/Button.stories.tsx`, append after the existing `Variants` story:

```tsx
export const AsChild = () => (
  <div style={{ display: 'flex', gap: 8 }}>
    <Button asChild>
      <a href="https://github.com/luzhenqian/overworld" target="_blank" rel="noreferrer">
        Renders an &lt;a&gt;
      </a>
    </Button>
  </div>
)
AsChild.storyName = 'asChild'
```

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/components/Button.tsx examples/ui-gallery/src/Button.stories.tsx
git commit -m "feat(ui): add asChild to Button and IconButton"
```

---

### Task 4: Rewrite `Modal` as a compound component

**Files:**
- Modify: `packages/ui/src/components/Modal.tsx` (full file)
- Modify: `packages/ui/src/components/AlertHost.tsx` — migrate to `Modal.Root`/`Modal.Content`
- Modify: `examples/ui-gallery/src/Surfaces.stories.tsx` — migrate to compound API, demonstrate `Modal.Close asChild`

**Interfaces:**
- Consumes: `Slot` from `packages/ui/src/primitives/Slot.tsx` (Task 2, for `Modal.Close`'s `asChild`); `FOCUSABLE_SELECTOR`/`nextTrapIndex` from `packages/ui/src/focusTrap.ts` (unchanged).
- Produces: `Modal = { Root, Content, Close }`, `ModalRootProps`, `ModalContentProps`, `ModalCloseProps` — all exported from `packages/ui/src/components/Modal.tsx` and re-exported from `packages/ui/src/index.ts` (already updated in Task 2 Step 5). No later task in this plan depends on these.

- [ ] **Step 1: Rewrite Modal.tsx**

Replace the full contents of `packages/ui/src/components/Modal.tsx`:

```tsx
import {
  createContext,
  forwardRef,
  useContext,
  useEffect,
  useRef,
  type ButtonHTMLAttributes,
  type ElementType,
  type HTMLAttributes,
  type MouseEvent,
  type ReactNode,
  type RefObject,
} from 'react'
import { FOCUSABLE_SELECTOR, nextTrapIndex } from '../focusTrap'
import { Slot } from '../primitives/Slot'

interface ModalContextValue {
  onDismiss?: () => void
  contentRef: RefObject<HTMLDivElement>
}

const ModalContext = createContext<ModalContextValue | null>(null)

function useModalContext(component: string): ModalContextValue {
  const ctx = useContext(ModalContext)
  if (!ctx) throw new Error(`Modal.${component} must be used within Modal.Root`)
  return ctx
}

export interface ModalRootProps {
  open: boolean
  /** Called on backdrop click or Escape. Omit to make the modal non-dismissable. */
  onDismiss?: () => void
  children?: ReactNode
}

/**
 * Centered modal layer with a keyboard focus trap: on open it focuses the first
 * focusable inside `Modal.Content` (or Content itself), cycles Tab/Shift+Tab
 * within, calls `onDismiss` on Escape, and restores focus on close. Renders
 * nothing when closed.
 */
function ModalRoot({ open, onDismiss, children }: ModalRootProps) {
  const contentRef = useRef<HTMLDivElement>(null)
  const onDismissRef = useRef(onDismiss)
  onDismissRef.current = onDismiss

  useEffect(() => {
    if (!open) return
    const previouslyFocused = document.activeElement as HTMLElement | null
    const content = contentRef.current
    const focusables = (): HTMLElement[] =>
      content ? Array.from(content.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)) : []
    ;(focusables()[0] ?? content)?.focus()

    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        onDismissRef.current?.()
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
  }, [open])

  if (!open) return null
  return (
    <div
      className="ow-modal-backdrop"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onDismiss?.()
      }}
    >
      <ModalContext.Provider value={{ onDismiss, contentRef }}>{children}</ModalContext.Provider>
    </div>
  )
}

export interface ModalContentProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode
}

function ModalContent({ children, ...rest }: ModalContentProps) {
  const { contentRef } = useModalContext('Content')
  return (
    <div className="ow-modal" role="dialog" aria-modal="true" tabIndex={-1} ref={contentRef} {...rest}>
      {children}
    </div>
  )
}

export interface ModalCloseProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Render props/ref onto the single child element instead of a `<button>`. */
  asChild?: boolean
}

const ModalClose = forwardRef<HTMLButtonElement, ModalCloseProps>(function ModalClose(
  { asChild, onClick, ...rest },
  ref,
) {
  const { onDismiss } = useModalContext('Close')
  const Comp: ElementType = asChild ? Slot : 'button'
  return (
    <Comp
      ref={ref}
      {...(asChild ? {} : { type: 'button' })}
      onClick={(e: MouseEvent<HTMLButtonElement>) => {
        onClick?.(e)
        onDismiss?.()
      }}
      {...rest}
    />
  )
})

export const Modal = { Root: ModalRoot, Content: ModalContent, Close: ModalClose }
```

- [ ] **Step 2: Migrate AlertHost.tsx to the compound API**

In `packages/ui/src/components/AlertHost.tsx`, replace the `return` statement's JSX:

```tsx
  return (
    <Modal.Root open onDismiss={() => store.getState().resolveCurrent(false)}>
      <Modal.Content>
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
      </Modal.Content>
    </Modal.Root>
  )
```

- [ ] **Step 3: Typecheck and test the ui package**

Run: `pnpm --filter @overworld-engine/ui typecheck && pnpm --filter @overworld-engine/ui test`
Expected: both PASS with zero errors/failures. `focusTrap.test.ts` still passes unmodified — the trap logic itself didn't change, only its ref target (`contentRef` instead of `modalRef`).

- [ ] **Step 4: Build the ui package**

Run: `pnpm --filter @overworld-engine/ui build`
Expected: tsup build succeeds, `dist/index.js` and `dist/index.d.ts` are regenerated.

- [ ] **Step 5: Migrate the gallery's Modal story and demonstrate `Modal.Close asChild`**

In `examples/ui-gallery/src/Surfaces.stories.tsx`, replace the `ModalStory` export:

```tsx
export const ModalStory = () => {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button onClick={() => setOpen(true)}>Open modal</Button>
      <Modal.Root open={open} onDismiss={() => setOpen(false)}>
        <Modal.Content>
          <Panel title="Confirm">
            Backdrop click dismisses.
            <footer style={{ marginTop: 12 }}>
              <Modal.Close asChild>
                <Button variant="ghost">Close</Button>
              </Modal.Close>
            </footer>
          </Panel>
        </Modal.Content>
      </Modal.Root>
    </>
  )
}
```

- [ ] **Step 6: Typecheck the gallery example**

Run: `pnpm --filter ui-gallery typecheck`
Expected: PASS with no errors (this requires Task 2's `InventorySlot` rename to already be in place, since this file's neighbors in the same package share one `tsc` invocation).

- [ ] **Step 7: Commit**

```bash
git add packages/ui/src/components/Modal.tsx packages/ui/src/components/AlertHost.tsx \
        examples/ui-gallery/src/Surfaces.stories.tsx
git commit -m "feat(ui)!: rewrite Modal as a compound component (Root/Content/Close)

BREAKING CHANGE: Modal is no longer a component you render directly.
Migrate <Modal open onDismiss>{children}</Modal> to:
<Modal.Root open onDismiss={...}><Modal.Content>{children}</Modal.Content></Modal.Root>"
```

---

### Task 5: Write `packages/ui/README.md` and the release changeset

**Files:**
- Create: `packages/ui/README.md`
- Create: `.changeset/ui-extensibility-patch.md`

**Interfaces:**
- Consumes: final public API shape from Tasks 2–4 (`Slot`, `InventorySlot`, `Button`/`IconButton` `asChild`, `Modal.Root`/`.Content`/`.Close`).
- Produces: nothing consumed by other tasks — this is the terminal task.

- [ ] **Step 1: Write the README**

Create `packages/ui/README.md`:

```markdown
# @overworld-engine/ui

Headless-first game UI: state/logic-only helpers plus a thin, CSS-themeable
styled layer on top. See the [repo root README](../../README.md) for the
overall "无头"(headless) philosophy and the zero-cross-package-import rule
(enforced by `pnpm depcruise` in CI — this package has zero
`@overworld-engine/*` runtime dependencies; engine-bound components like
`DialogueBox`/`QuestTracker` accept structurally-typed props instead of
importing their engine packages, see `src/engineTypes.ts`).

## Exports

- `@overworld-engine/ui` — all components plus headless helpers/hooks
  (`useTypewriter`, `advanceReveal`, `positionTooltip`, etc.)
- `@overworld-engine/ui/focus` — optional spatial/gamepad focus navigation
  (`FocusProvider`, `useSpatialFocus`, `useGamepadFocus`); requires the
  optional peer dependency `@noriginmedia/norigin-spatial-navigation`
- `@overworld-engine/ui/styles.css` — base CSS variable tokens (`--ow-*`)
- `@overworld-engine/ui/themes/*` — four swappable theme skins (hextech,
  pixel, tactical, xianxia)

## Theming

Import the base stylesheet once, then switch skins by setting
`data-ow-theme` on your root element:

```tsx
import '@overworld-engine/ui/styles.css'
import '@overworld-engine/ui/themes/hextech.css'

<div data-ow-theme="hextech">{/* your game UI */}</div>
```

## `asChild`

`Button`, `IconButton`, and `Modal.Close` accept an `asChild` prop: instead of
rendering their own DOM tag, they merge their props/ref onto a single child
element you provide. Useful for rendering a router `Link`, an anchor tag, or
any other element while keeping the component's styling and behavior:

```tsx
<Button asChild>
  <a href="/inventory">Open inventory</a>
</Button>
```

The underlying primitive, `Slot`, is exported publicly so you can add
`asChild` support to your own components the same way.

## `Modal`

`Modal` is a compound component:

```tsx
<Modal.Root open={open} onDismiss={() => setOpen(false)}>
  <Modal.Content>
    <p>Are you sure?</p>
    <Modal.Close asChild>
      <Button variant="ghost">Cancel</Button>
    </Modal.Close>
  </Modal.Content>
</Modal.Root>
```

`Modal.Root` owns the backdrop, the keyboard focus trap (Tab cycling, Escape
to dismiss), and focus restore on close. `Modal.Content` is the dialog
surface. `Modal.Close` dismisses on click and supports `asChild`.
```

- [ ] **Step 2: Write the changeset**

Create `.changeset/ui-extensibility-patch.md`:

```markdown
---
'@overworld-engine/ui': major
---

**Breaking:** `Modal` is now a compound component — `{ Root, Content, Close }` —
instead of a single component. Migrate:

```diff
-<Modal open={open} onDismiss={() => setOpen(false)}>
-  {children}
-</Modal>
+<Modal.Root open={open} onDismiss={() => setOpen(false)}>
+  <Modal.Content>{children}</Modal.Content>
+</Modal.Root>
```

**Breaking:** the barrel export `Slot` (the inventory grid slot component,
from `SlotGrid.tsx`) is renamed to `InventorySlot`. The name `Slot` now
refers to the new asChild primitive (see below).

**Feature:** `Button` and `IconButton` accept `asChild`, rendering their
props/ref onto a single child element instead of their own `<button>`. Backed
by a new public `Slot` primitive, exported for building your own
`asChild`-capable components.

**Feature:** `Modal.Close` accepts `asChild` too.

**Docs:** added `packages/ui/README.md` covering exports, theming, and the
new APIs.

**Chore:** CI now runs `pnpm depcruise` to enforce the zero-cross-package-import
rule (previously comment-only) across all `packages/*`.
```

- [ ] **Step 3: Verify the full ui + ui-gallery pipeline end to end**

Run: `pnpm --filter @overworld-engine/ui build && pnpm --filter @overworld-engine/ui typecheck && pnpm --filter @overworld-engine/ui test && pnpm --filter ui-gallery typecheck && pnpm depcruise`
Expected: all five commands exit 0.

- [ ] **Step 4: Commit**

```bash
git add packages/ui/README.md .changeset/ui-extensibility-patch.md
git commit -m "docs(ui): add package README; add release changeset for extensibility patch"
```
