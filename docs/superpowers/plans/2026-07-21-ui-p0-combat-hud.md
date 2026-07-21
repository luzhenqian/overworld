# P0 Combat HUD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add four prop-driven combat-HUD components (CastBar, BuffBar, TargetFrame, Nameplate) plus two tested pure-logic helpers to `@overworld-engine/ui`, and expand the rarity color tokens from 4 to 6 tiers.

**Architecture:** All four components are thin presentational components in the existing `Bar`/`SlotGrid` mold — no engine binding (there is no combat engine and the repo forbids cross-package imports). Non-trivial math is extracted into pure functions (`castProgress`, `buffTimer`) that get real vitest tests; components are verified by typecheck + build + a Storybook gallery story (the repo has no component-render test infra). TargetFrame/Nameplate reuse `Bar`; TargetFrame reuses `BuffBar`.

**Tech Stack:** React 18, TypeScript, tsup, vitest (node), CSS custom-property tokens (`--ow-*`), Storybook 9.

## Global Constraints

- **Zero cross-package imports** inside `packages/ui/src` — no `@overworld-engine/*` imports; engine shapes are duck-typed. (New components take plain props, so this is satisfied by construction.)
- **Pure-logic tests only** — vitest node tests for extracted functions; NO testing-library / jsdom; do not add test-infra dependencies.
- **Styling convention** — stable `ow-*` classes + `data-ow-*` state attributes, near-zero inline styles, all visuals via `--ow-*` tokens. Component CSS uses bare `.ow-*` selectors (tokens inherit from the `.ow-root` ancestor the host/decorator provides).
- **Respect `prefers-reduced-motion`** — CSS-only animation, disabled under reduce.
- **Avoid TS1149 case collisions** in filenames. New files: `castProgress.ts`, `buffTimer.ts`, `CastBar.tsx`, `BuffBar.tsx`, `TargetFrame.tsx`, `Nameplate.tsx` (the `Buff` sub-component lives inside `BuffBar.tsx`, no separate file).
- **Scoped verification** — only build/test `@overworld-engine/ui` and its dependent `ui-gallery`; never the full workspace.
- **Release** — `@overworld-engine/ui` `minor` via a changeset (fixed version group).

## File Structure

| File | Responsibility |
|---|---|
| `packages/ui/src/castProgress.ts` | Pure: cast fill % + remaining seconds (create) |
| `packages/ui/src/buffTimer.ts` | Pure: cooldown sweep % + compact time format (create) |
| `packages/ui/src/components/CastBar.tsx` | Cast bar component (create) |
| `packages/ui/src/components/BuffBar.tsx` | BuffBar + internal Buff cell (create) |
| `packages/ui/src/components/TargetFrame.tsx` | Target frame, composes Bar + BuffBar (create) |
| `packages/ui/src/components/Nameplate.tsx` | Enemy nameplate, composes Bar (create) |
| `packages/ui/src/styles/styles.css` | Base-layer CSS + rarity tokens (modify) |
| `packages/ui/src/styles/themes/*.css` | Per-theme rarity token overrides (modify ×4) |
| `packages/ui/src/index.ts` | Public exports (modify) |
| `packages/ui/src/__tests__/castProgress.test.ts` | Tests for castProgress (create) |
| `packages/ui/src/__tests__/buffTimer.test.ts` | Tests for buffTimer (create) |
| `examples/ui-gallery/src/CombatHud.stories.tsx` | Gallery demo/story (create) |
| `examples/ui-gallery/.storybook/preview.tsx` | Add 'HUD' to storySort order (modify) |
| `.changeset/p0-combat-hud.md` | Release note (create) |

---

### Task 1: `castProgress` pure logic

**Files:**
- Create: `packages/ui/src/castProgress.ts`
- Test: `packages/ui/src/__tests__/castProgress.test.ts`
- Modify: `packages/ui/src/index.ts`

**Interfaces:**
- Produces: `castProgress(value: number, max: number, opts?: { channel?: boolean }): { fillPct: number; remainingSeconds: number }` and `interface CastProgress { fillPct: number; remainingSeconds: number }`.

- [ ] **Step 1: Write the failing test**

Create `packages/ui/src/__tests__/castProgress.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { castProgress } from '../castProgress'

describe('castProgress', () => {
  test('normal cast fills proportionally and reports remaining', () => {
    expect(castProgress(1, 4)).toEqual({ fillPct: 25, remainingSeconds: 3 })
  })

  test('channel inverts the fill (drains from full) but remaining is unchanged', () => {
    expect(castProgress(1, 4, { channel: true })).toEqual({ fillPct: 75, remainingSeconds: 3 })
  })

  test('clamps overshoot to 100% fill / 0 remaining', () => {
    expect(castProgress(5, 4)).toEqual({ fillPct: 100, remainingSeconds: 0 })
  })

  test('clamps negative value to 0% fill', () => {
    expect(castProgress(-2, 4).fillPct).toBe(0)
  })

  test('max <= 0 is a safe zero', () => {
    expect(castProgress(1, 0)).toEqual({ fillPct: 0, remainingSeconds: 0 })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @overworld-engine/ui exec vitest run src/__tests__/castProgress.test.ts`
Expected: FAIL — cannot resolve `../castProgress`.

- [ ] **Step 3: Write minimal implementation**

Create `packages/ui/src/castProgress.ts`:

```ts
export interface CastProgress {
  /** Fill width as a percentage 0–100. */
  fillPct: number
  /** Seconds until the cast completes (never negative). */
  remainingSeconds: number
}

/**
 * Cast/channel progress math. Normal casts fill 0 → 100%; channeled casts
 * drain 100 → 0%. `value` and `max` share one time unit (e.g. seconds).
 */
export function castProgress(
  value: number,
  max: number,
  opts?: { channel?: boolean },
): CastProgress {
  if (max <= 0) return { fillPct: 0, remainingSeconds: 0 }
  const ratio = Math.min(Math.max(value / max, 0), 1)
  const fillPct = (opts?.channel ? 1 - ratio : ratio) * 100
  return { fillPct, remainingSeconds: Math.max(0, max - value) }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @overworld-engine/ui exec vitest run src/__tests__/castProgress.test.ts`
Expected: PASS (5 passed).

- [ ] **Step 5: Export from the package index**

In `packages/ui/src/index.ts`, add after the `highlightBox` export line:

```ts
export { castProgress } from './castProgress'
export type { CastProgress } from './castProgress'
```

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter @overworld-engine/ui typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/ui/src/castProgress.ts packages/ui/src/__tests__/castProgress.test.ts packages/ui/src/index.ts
git commit -m "feat(ui): add castProgress pure-logic helper"
```

---

### Task 2: `buffTimer` pure logic

**Files:**
- Create: `packages/ui/src/buffTimer.ts`
- Test: `packages/ui/src/__tests__/buffTimer.test.ts`
- Modify: `packages/ui/src/index.ts`

**Interfaces:**
- Produces: `buffSweepPct(remaining: number, duration: number): number` and `formatBuffTime(seconds: number): string`.

- [ ] **Step 1: Write the failing test**

Create `packages/ui/src/__tests__/buffTimer.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { buffSweepPct, formatBuffTime } from '../buffTimer'

describe('buffSweepPct', () => {
  test('returns the remaining fraction as a percentage', () => {
    expect(buffSweepPct(3, 12)).toBe(25)
  })
  test('clamps to 0–100', () => {
    expect(buffSweepPct(20, 12)).toBe(100)
    expect(buffSweepPct(-1, 12)).toBe(0)
  })
  test('duration <= 0 means permanent (no sweep)', () => {
    expect(buffSweepPct(5, 0)).toBe(0)
  })
})

describe('formatBuffTime', () => {
  test('minutes:seconds above 60s, zero-padded', () => {
    expect(formatBuffTime(83)).toBe('1:23')
    expect(formatBuffTime(60)).toBe('1:00')
    expect(formatBuffTime(125)).toBe('2:05')
  })
  test('whole seconds with "s" from 10 to 59', () => {
    expect(formatBuffTime(45)).toBe('45s')
    expect(formatBuffTime(10)).toBe('10s')
    expect(formatBuffTime(12.4)).toBe('12s')
  })
  test('one decimal, no unit, below 10s', () => {
    expect(formatBuffTime(9.9)).toBe('9.9')
    expect(formatBuffTime(3.2)).toBe('3.2')
    expect(formatBuffTime(0.4)).toBe('0.4')
  })
  test('empty string at or below zero', () => {
    expect(formatBuffTime(0)).toBe('')
    expect(formatBuffTime(-5)).toBe('')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @overworld-engine/ui exec vitest run src/__tests__/buffTimer.test.ts`
Expected: FAIL — cannot resolve `../buffTimer`.

- [ ] **Step 3: Write minimal implementation**

Create `packages/ui/src/buffTimer.ts`:

```ts
/**
 * Fraction of a buff/cooldown still remaining, as a percentage 0–100, for the
 * conic-gradient sweep. A non-positive `duration` means "permanent" → 0.
 */
export function buffSweepPct(remaining: number, duration: number): number {
  if (duration <= 0) return 0
  return Math.min(Math.max(remaining / duration, 0), 1) * 100
}

/**
 * Compact countdown label:
 *   ≥ 60s → "M:SS" (83 → "1:23")
 *   10–59s → "Ns"  (45 → "45s", rounded)
 *   0–10s  → one decimal, no unit ("3.2")
 *   ≤ 0    → "" (render nothing)
 */
export function formatBuffTime(seconds: number): string {
  if (seconds <= 0) return ''
  if (seconds >= 60) {
    const m = Math.floor(seconds / 60)
    const s = Math.floor(seconds % 60)
    return `${m}:${s.toString().padStart(2, '0')}`
  }
  if (seconds >= 10) return `${Math.round(seconds)}s`
  return (Math.round(seconds * 10) / 10).toFixed(1)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @overworld-engine/ui exec vitest run src/__tests__/buffTimer.test.ts`
Expected: PASS.

- [ ] **Step 5: Export from the package index**

In `packages/ui/src/index.ts`, add after the `castProgress` exports from Task 1:

```ts
export { buffSweepPct, formatBuffTime } from './buffTimer'
```

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter @overworld-engine/ui typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/ui/src/buffTimer.ts packages/ui/src/__tests__/buffTimer.test.ts packages/ui/src/index.ts
git commit -m "feat(ui): add buffTimer pure-logic helpers"
```

---

### Task 3: Expand rarity tokens to 6 tiers

**Files:**
- Modify: `packages/ui/src/styles/styles.css` (tokens block ~lines 21–24; slot selectors ~lines 202–205)
- Modify: `packages/ui/src/styles/themes/hextech.css`, `tactical.css`, `pixel.css`, `xianxia.css` (add rarity overrides in each `.ow-root[data-ow-theme="…"]` token block)

**Interfaces:**
- Produces: tokens `--ow-color-rarity-{poor,common,uncommon,rare,epic,legendary}` and matching `.ow-slot[data-ow-rarity="…"]` border rules.

- [ ] **Step 1: Replace the base rarity tokens**

In `packages/ui/src/styles/styles.css`, replace these four lines:

```css
  --ow-color-rarity-common: #9aa0b0;
  --ow-color-rarity-rare: #4d7ec0;
  --ow-color-rarity-epic: #9b59b6;
  --ow-color-rarity-legendary: #e67e22;
```

with the six-tier set (WoW-aligned semantics: poor grey / common near-white / uncommon green / rare blue / epic purple / legendary orange):

```css
  --ow-color-rarity-poor: #9d9d9d;
  --ow-color-rarity-common: #f0f0f0;
  --ow-color-rarity-uncommon: #4caf50;
  --ow-color-rarity-rare: #4d7ec0;
  --ow-color-rarity-epic: #9b59b6;
  --ow-color-rarity-legendary: #e67e22;
```

- [ ] **Step 2: Add the two new slot border selectors**

In `packages/ui/src/styles/styles.css`, the existing block is:

```css
.ow-slot[data-ow-rarity="common"] { border-color: var(--ow-color-rarity-common); }
.ow-slot[data-ow-rarity="rare"] { border-color: var(--ow-color-rarity-rare); }
.ow-slot[data-ow-rarity="epic"] { border-color: var(--ow-color-rarity-epic); }
.ow-slot[data-ow-rarity="legendary"] { border-color: var(--ow-color-rarity-legendary); }
```

Replace it with all six tiers:

```css
.ow-slot[data-ow-rarity="poor"] { border-color: var(--ow-color-rarity-poor); }
.ow-slot[data-ow-rarity="common"] { border-color: var(--ow-color-rarity-common); }
.ow-slot[data-ow-rarity="uncommon"] { border-color: var(--ow-color-rarity-uncommon); }
.ow-slot[data-ow-rarity="rare"] { border-color: var(--ow-color-rarity-rare); }
.ow-slot[data-ow-rarity="epic"] { border-color: var(--ow-color-rarity-epic); }
.ow-slot[data-ow-rarity="legendary"] { border-color: var(--ow-color-rarity-legendary); }
```

- [ ] **Step 3: Add per-theme rarity overrides**

In each theme file, inside the `.ow-root[data-ow-theme="…"]` token block (next to the existing `--ow-color-*` declarations), add the six rarity tokens.

`themes/hextech.css`:
```css
  --ow-color-rarity-poor: #7a8a99;
  --ow-color-rarity-common: #f0e6d2;
  --ow-color-rarity-uncommon: #1fbf75;
  --ow-color-rarity-rare: #2e86de;
  --ow-color-rarity-epic: #9b6cd6;
  --ow-color-rarity-legendary: #c8aa6e;
```

`themes/tactical.css`:
```css
  --ow-color-rarity-poor: #8a8f98;
  --ow-color-rarity-common: #d7dde3;
  --ow-color-rarity-uncommon: #6fae3a;
  --ow-color-rarity-rare: #4a90c2;
  --ow-color-rarity-epic: #a05fc0;
  --ow-color-rarity-legendary: #e0a53c;
```

`themes/pixel.css`:
```css
  --ow-color-rarity-poor: #a0a0a0;
  --ow-color-rarity-common: #ffffff;
  --ow-color-rarity-uncommon: #4fdb3a;
  --ow-color-rarity-rare: #4aa3ff;
  --ow-color-rarity-epic: #c74aff;
  --ow-color-rarity-legendary: #ff9d2e;
```

`themes/xianxia.css`:
```css
  --ow-color-rarity-poor: #9a938a;
  --ow-color-rarity-common: #f2ede0;
  --ow-color-rarity-uncommon: #6fbf73;
  --ow-color-rarity-rare: #5aa0d8;
  --ow-color-rarity-epic: #b06fd8;
  --ow-color-rarity-legendary: #e0b64c;
```

- [ ] **Step 4: Build to verify CSS is copied without error**

Run: `pnpm --filter @overworld-engine/ui build`
Expected: build succeeds; `dist/styles.css` and `dist/themes/*.css` regenerated.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/styles/styles.css packages/ui/src/styles/themes/
git commit -m "feat(ui): expand rarity tokens to 6 tiers (poor…legendary)"
```

---

### Task 4: CastBar component

**Files:**
- Create: `packages/ui/src/components/CastBar.tsx`
- Modify: `packages/ui/src/styles/styles.css` (append CastBar block)
- Modify: `packages/ui/src/index.ts`
- Create: `examples/ui-gallery/src/CombatHud.stories.tsx`
- Modify: `examples/ui-gallery/.storybook/preview.tsx` (storySort order)

**Interfaces:**
- Consumes: `castProgress` (Task 1).
- Produces: `CastBar(props: CastBarProps)`; `interface CastBarProps { value: number; max: number; label?: ReactNode; icon?: ReactNode; state?: 'casting' | 'channeling' | 'interrupted' | 'success'; channel?: boolean; showRemaining?: boolean }`.

- [ ] **Step 1: Write the component**

Create `packages/ui/src/components/CastBar.tsx`:

```tsx
import type { ReactNode } from 'react'
import { castProgress } from '../castProgress'

export interface CastBarProps {
  /** Elapsed cast time. */
  value: number
  /** Total cast duration (same unit as `value`). */
  max: number
  /** Ability name shown on the bar. */
  label?: ReactNode
  /** Ability icon. */
  icon?: ReactNode
  /** Visual status; sets `data-ow-state`. @default 'casting' */
  state?: 'casting' | 'channeling' | 'interrupted' | 'success'
  /** Channeled cast: fills 100% → 0% instead of 0% → 100%. */
  channel?: boolean
  /** Show remaining seconds (one decimal) at the bar's end. */
  showRemaining?: boolean
}

/** Ability cast/channel bar. Presentational: the host owns the timer. */
export function CastBar({
  value,
  max,
  label,
  icon,
  state = 'casting',
  channel = false,
  showRemaining,
}: CastBarProps) {
  const { fillPct, remainingSeconds } = castProgress(value, max, { channel })
  return (
    <div className="ow-castbar" data-ow-state={state}>
      {icon != null && (
        <span className="ow-castbar-icon" aria-hidden="true">
          {icon}
        </span>
      )}
      <div
        className="ow-castbar-track"
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={typeof label === 'string' ? label : undefined}
      >
        <div className="ow-castbar-fill" style={{ width: `${fillPct}%` }} />
        {label != null && <span className="ow-castbar-label">{label}</span>}
        {showRemaining && <span className="ow-castbar-time">{remainingSeconds.toFixed(1)}</span>}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Append base CSS**

Append to `packages/ui/src/styles/styles.css`:

```css
/* ---------------- CastBar ---------------- */
.ow-castbar {
  display: flex;
  align-items: center;
  gap: var(--ow-space-2);
  pointer-events: auto;
}
.ow-castbar-icon {
  flex: none;
  width: calc(var(--ow-slot-size) * 0.6);
  height: calc(var(--ow-slot-size) * 0.6);
  display: grid;
  place-items: center;
  background: var(--ow-color-surface-2);
  border: 1px solid var(--ow-color-border);
  border-radius: var(--ow-radius-sm);
  font-size: 1.1em;
}
.ow-castbar-track {
  position: relative;
  flex: 1;
  min-width: 120px;
  height: 18px;
  background: var(--ow-color-surface-2);
  border: 1px solid var(--ow-color-border);
  border-radius: var(--ow-radius-sm);
  overflow: hidden;
}
.ow-castbar-fill {
  position: absolute;
  inset: 0 auto 0 0;
  background: var(--ow-color-accent);
  transition: width 80ms linear;
}
.ow-castbar[data-ow-state="interrupted"] .ow-castbar-fill { background: var(--ow-color-danger); }
.ow-castbar[data-ow-state="success"] .ow-castbar-fill { background: var(--ow-color-xp); }
.ow-castbar[data-ow-state="channeling"] .ow-castbar-fill { background: var(--ow-color-mp); }
.ow-castbar-label,
.ow-castbar-time {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  font-size: 0.78em;
  color: var(--ow-color-text);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
  pointer-events: none;
}
.ow-castbar-label { left: var(--ow-space-2); }
.ow-castbar-time { right: var(--ow-space-2); font-variant-numeric: tabular-nums; }
@media (prefers-reduced-motion: reduce) {
  .ow-castbar-fill { transition: none; }
}
```

- [ ] **Step 3: Export from the package index**

In `packages/ui/src/index.ts`, add (with the other component exports):

```ts
export { CastBar } from './components/CastBar'
export type { CastBarProps } from './components/CastBar'
```

- [ ] **Step 4: Create the gallery story**

Create `examples/ui-gallery/src/CombatHud.stories.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { CastBar } from '@overworld-engine/ui'

export default { title: 'HUD / Combat' }

export const CastBars = () => {
  const [t, setT] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setT((v) => (v >= 2.5 ? 0 : v + 0.1)), 100)
    return () => clearInterval(id)
  }, [])
  return (
    <div style={{ display: 'grid', gap: 12, maxWidth: 340 }}>
      <CastBar value={t} max={2.5} label="Fireball" icon="🔥" showRemaining />
      <CastBar value={t} max={2.5} label="Channel" icon="🌊" state="channeling" channel showRemaining />
      <CastBar value={1.2} max={2.5} label="Interrupted" icon="💥" state="interrupted" />
    </div>
  )
}
```

- [ ] **Step 5: Slot the story into the gallery sort order**

In `examples/ui-gallery/.storybook/preview.tsx`, change the storySort order line:

```ts
      order: ['Primitives', 'Engines', 'Integrated'],
```

to:

```ts
      order: ['Primitives', 'HUD', 'Engines', 'Integrated'],
```

- [ ] **Step 6: Typecheck the package, then build, then typecheck the gallery**

Run: `pnpm --filter @overworld-engine/ui typecheck`
Expected: no errors.

Run: `pnpm --filter @overworld-engine/ui build`
Expected: build succeeds (regenerates `dist` so the gallery resolves the new export).

Run: `pnpm --filter ui-gallery typecheck`
Expected: no errors (proves `CastBar` + props compile against real usage).

- [ ] **Step 7: Commit**

```bash
git add packages/ui/src/components/CastBar.tsx packages/ui/src/styles/styles.css packages/ui/src/index.ts examples/ui-gallery/src/CombatHud.stories.tsx examples/ui-gallery/.storybook/preview.tsx
git commit -m "feat(ui): add CastBar component"
```

---

### Task 5: BuffBar component (+ internal Buff)

**Files:**
- Create: `packages/ui/src/components/BuffBar.tsx`
- Modify: `packages/ui/src/styles/styles.css` (append BuffBar block)
- Modify: `packages/ui/src/index.ts`
- Modify: `examples/ui-gallery/src/CombatHud.stories.tsx` (add `Buffs` story)

**Interfaces:**
- Consumes: `buffSweepPct`, `formatBuffTime` (Task 2).
- Produces: `BuffBar(props: BuffBarProps)`; `interface BuffSpec { id: string; icon?: ReactNode; remaining?: number; duration?: number; stacks?: number; kind?: 'buff' | 'debuff' }`; `interface BuffBarProps { buffs: readonly BuffSpec[]; max?: number }`.

- [ ] **Step 1: Write the component**

Create `packages/ui/src/components/BuffBar.tsx`:

```tsx
import type { CSSProperties, ReactNode } from 'react'
import { buffSweepPct, formatBuffTime } from '../buffTimer'

export interface BuffSpec {
  id: string
  icon?: ReactNode
  /** Remaining duration; omit for a permanent buff (no sweep, no timer). */
  remaining?: number
  /** Total duration; with `remaining`, drives the cooldown sweep. */
  duration?: number
  /** Stack count badge; hidden when omitted or <= 1. */
  stacks?: number
  /** Beneficial or harmful; sets `data-ow-kind`. @default 'buff' */
  kind?: 'buff' | 'debuff'
}

export interface BuffBarProps {
  buffs: readonly BuffSpec[]
  /** Cap the number rendered; extras are dropped. */
  max?: number
}

/** Row of buff/debuff icons with cooldown sweeps and stack badges. */
export function BuffBar({ buffs, max }: BuffBarProps) {
  const shown = max != null ? buffs.slice(0, max) : buffs
  if (shown.length === 0) return null
  return (
    <ul className="ow-buffbar">
      {shown.map((b) => (
        <Buff key={b.id} {...b} />
      ))}
    </ul>
  )
}

function Buff({ icon, remaining, duration, stacks, kind = 'buff' }: BuffSpec) {
  const sweep =
    remaining != null && duration != null ? buffSweepPct(remaining, duration) : null
  const time = remaining != null ? formatBuffTime(remaining) : ''
  return (
    <li
      className="ow-buff"
      data-ow-kind={kind}
      style={sweep != null ? ({ '--ow-buff-sweep': `${sweep}%` } as CSSProperties) : undefined}
    >
      <span className="ow-buff-icon" aria-hidden="true">
        {icon}
      </span>
      {sweep != null && <span className="ow-buff-sweep" aria-hidden="true" />}
      {stacks != null && stacks > 1 && <span className="ow-buff-stacks">{stacks}</span>}
      {time && <span className="ow-buff-time">{time}</span>}
    </li>
  )
}
```

- [ ] **Step 2: Append base CSS**

Append to `packages/ui/src/styles/styles.css`:

```css
/* ---------------- BuffBar ---------------- */
.ow-buffbar {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ow-space-1);
  list-style: none;
  margin: 0;
  padding: 0;
  pointer-events: auto;
}
.ow-buff {
  position: relative;
  width: calc(var(--ow-slot-size) * 0.66);
  height: calc(var(--ow-slot-size) * 0.66);
  display: grid;
  place-items: center;
  background: var(--ow-color-surface-2);
  border: 1px solid var(--ow-color-border);
  border-radius: var(--ow-radius-sm);
  overflow: hidden;
}
.ow-buff[data-ow-kind="debuff"] { border-color: var(--ow-color-danger); }
.ow-buff-icon { font-size: 1em; line-height: 1; }
/* `--ow-buff-sweep` is the fraction REMAINING; darken the elapsed complement,
   so a fresh buff shows a clear icon and darkens as it expires. */
.ow-buff-sweep {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  background: conic-gradient(from 0deg, transparent var(--ow-buff-sweep, 100%), rgba(0, 0, 0, 0.55) 0);
}
.ow-buff-stacks {
  position: absolute;
  right: 1px;
  bottom: 0;
  font-size: 0.62em;
  font-weight: 700;
  color: var(--ow-color-text);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.9);
}
.ow-buff-time {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  text-align: center;
  font-size: 0.6em;
  font-variant-numeric: tabular-nums;
  color: var(--ow-color-text);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.9);
}
```

- [ ] **Step 3: Export from the package index**

In `packages/ui/src/index.ts`, add:

```ts
export { BuffBar } from './components/BuffBar'
export type { BuffBarProps, BuffSpec } from './components/BuffBar'
```

- [ ] **Step 4: Extend the gallery story**

In `examples/ui-gallery/src/CombatHud.stories.tsx`, change the import line:

```tsx
import { CastBar } from '@overworld-engine/ui'
```

to:

```tsx
import { BuffBar, CastBar } from '@overworld-engine/ui'
```

Then append a new story export at the end of the file:

```tsx
export const Buffs = () => {
  const [t, setT] = useState(12)
  useEffect(() => {
    const id = setInterval(() => setT((v) => (v <= 0 ? 12 : v - 0.2)), 200)
    return () => clearInterval(id)
  }, [])
  return (
    <BuffBar
      buffs={[
        { id: 'might', icon: '⚔️', remaining: t, duration: 12, stacks: 3, kind: 'buff' },
        { id: 'shield', icon: '🛡️', remaining: t * 5, duration: 60, kind: 'buff' },
        { id: 'poison', icon: '☠️', remaining: t / 2, duration: 6, kind: 'debuff' },
        { id: 'blessing', icon: '✨', kind: 'buff' },
      ]}
    />
  )
}
```

- [ ] **Step 5: Typecheck, build, gallery typecheck**

Run: `pnpm --filter @overworld-engine/ui typecheck`
Expected: no errors.

Run: `pnpm --filter @overworld-engine/ui build`
Expected: build succeeds.

Run: `pnpm --filter ui-gallery typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/components/BuffBar.tsx packages/ui/src/styles/styles.css packages/ui/src/index.ts examples/ui-gallery/src/CombatHud.stories.tsx
git commit -m "feat(ui): add BuffBar component"
```

---

### Task 6: TargetFrame component

**Files:**
- Create: `packages/ui/src/components/TargetFrame.tsx`
- Modify: `packages/ui/src/styles/styles.css` (append TargetFrame block)
- Modify: `packages/ui/src/index.ts`
- Modify: `examples/ui-gallery/src/CombatHud.stories.tsx` (add `Targets` story)

**Interfaces:**
- Consumes: `Bar` (existing), `BuffBar` + `BuffSpec` (Task 5).
- Produces: `TargetFrame(props: TargetFrameProps)`; `interface TargetFrameProps { name: ReactNode; level?: number | string; hp: number; hpMax: number; resource?: number; resourceMax?: number; classification?: 'normal' | 'elite' | 'rare' | 'boss'; reaction?: 'hostile' | 'neutral' | 'friendly'; portrait?: ReactNode; buffs?: readonly BuffSpec[]; castBar?: ReactNode }`.

- [ ] **Step 1: Write the component**

Create `packages/ui/src/components/TargetFrame.tsx`:

```tsx
import type { ReactNode } from 'react'
import { Bar } from './Bar'
import { BuffBar, type BuffSpec } from './BuffBar'

export interface TargetFrameProps {
  name: ReactNode
  level?: number | string
  hp: number
  hpMax: number
  /** Optional secondary resource (mana/energy). */
  resource?: number
  resourceMax?: number
  /** Difficulty tier; sets `data-ow-classification`. @default 'normal' */
  classification?: 'normal' | 'elite' | 'rare' | 'boss'
  /** Hostility; sets `data-ow-reaction`. @default 'hostile' */
  reaction?: 'hostile' | 'neutral' | 'friendly'
  portrait?: ReactNode
  buffs?: readonly BuffSpec[]
  /** Optional cast bar rendered under the resources (pass a `<CastBar>`). */
  castBar?: ReactNode
}

/** Selected-target unit frame: portrait, name/level, health, resource, buffs. */
export function TargetFrame({
  name,
  level,
  hp,
  hpMax,
  resource,
  resourceMax,
  classification = 'normal',
  reaction = 'hostile',
  portrait,
  buffs,
  castBar,
}: TargetFrameProps) {
  return (
    <div
      className="ow-target-frame"
      data-ow-classification={classification}
      data-ow-reaction={reaction}
    >
      {portrait != null && (
        <div className="ow-target-portrait" aria-hidden="true">
          {portrait}
        </div>
      )}
      <div className="ow-target-main">
        <div className="ow-target-header">
          {level != null && <span className="ow-target-level">{level}</span>}
          <span className="ow-target-name">{name}</span>
        </div>
        <Bar value={hp} max={hpMax} variant="hp" showValue />
        {resource != null && resourceMax != null && (
          <Bar value={resource} max={resourceMax} variant="mp" />
        )}
        {castBar}
        {buffs != null && buffs.length > 0 && <BuffBar buffs={buffs} />}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Append base CSS**

Append to `packages/ui/src/styles/styles.css`:

```css
/* ---------------- TargetFrame ---------------- */
.ow-target-frame {
  display: flex;
  gap: var(--ow-space-2);
  padding: var(--ow-space-2);
  min-width: 200px;
  background: var(--ow-color-surface);
  border: var(--ow-panel-border-width) solid var(--ow-color-border);
  border-image: var(--ow-panel-border-image);
  border-radius: var(--ow-radius);
  box-shadow: var(--ow-shadow);
  pointer-events: auto;
}
.ow-target-portrait {
  flex: none;
  width: var(--ow-slot-size);
  height: var(--ow-slot-size);
  display: grid;
  place-items: center;
  background: var(--ow-color-surface-2);
  border: 1px solid var(--ow-color-border);
  border-radius: var(--ow-radius-sm);
  font-size: 1.4em;
}
.ow-target-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--ow-space-1);
  min-width: 0;
}
.ow-target-header {
  display: flex;
  align-items: baseline;
  gap: var(--ow-space-1);
}
.ow-target-level {
  font-size: 0.75em;
  color: var(--ow-color-text-dim);
  font-variant-numeric: tabular-nums;
}
.ow-target-name {
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ow-target-frame[data-ow-reaction="hostile"] .ow-target-name { color: var(--ow-color-hp); }
.ow-target-frame[data-ow-reaction="friendly"] .ow-target-name { color: var(--ow-color-rarity-uncommon); }
.ow-target-frame[data-ow-classification="rare"] { border-color: var(--ow-color-rarity-rare); }
.ow-target-frame[data-ow-classification="elite"] { border-color: var(--ow-color-rarity-epic); }
.ow-target-frame[data-ow-classification="boss"] { border-color: var(--ow-color-rarity-legendary); }
```

- [ ] **Step 3: Export from the package index**

In `packages/ui/src/index.ts`, add:

```ts
export { TargetFrame } from './components/TargetFrame'
export type { TargetFrameProps } from './components/TargetFrame'
```

- [ ] **Step 4: Extend the gallery story**

In `examples/ui-gallery/src/CombatHud.stories.tsx`, change the import line to add `TargetFrame`:

```tsx
import { BuffBar, CastBar, TargetFrame } from '@overworld-engine/ui'
```

Then append at the end of the file:

```tsx
export const Targets = () => (
  <div style={{ display: 'grid', gap: 12, maxWidth: 320 }}>
    <TargetFrame
      name="Ancient Dragon"
      level={60}
      hp={82000}
      hpMax={120000}
      resource={40}
      resourceMax={100}
      classification="boss"
      reaction="hostile"
      portrait="🐉"
      buffs={[
        { id: 'enrage', icon: '🔥', remaining: 8, duration: 12, kind: 'buff' },
        { id: 'slow', icon: '🐌', remaining: 3, duration: 6, kind: 'debuff' },
      ]}
    />
    <TargetFrame
      name="Village Elder"
      level={5}
      hp={120}
      hpMax={120}
      classification="normal"
      reaction="friendly"
      portrait="🧙"
    />
  </div>
)
```

- [ ] **Step 5: Typecheck, build, gallery typecheck**

Run: `pnpm --filter @overworld-engine/ui typecheck`
Expected: no errors.

Run: `pnpm --filter @overworld-engine/ui build`
Expected: build succeeds.

Run: `pnpm --filter ui-gallery typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/components/TargetFrame.tsx packages/ui/src/styles/styles.css packages/ui/src/index.ts examples/ui-gallery/src/CombatHud.stories.tsx
git commit -m "feat(ui): add TargetFrame component"
```

---

### Task 7: Nameplate component

**Files:**
- Create: `packages/ui/src/components/Nameplate.tsx`
- Modify: `packages/ui/src/styles/styles.css` (append Nameplate block)
- Modify: `packages/ui/src/index.ts`
- Modify: `examples/ui-gallery/src/CombatHud.stories.tsx` (add `Nameplates` story)

**Interfaces:**
- Consumes: `Bar` (existing).
- Produces: `Nameplate(props: NameplateProps)`; `interface NameplateProps { name: ReactNode; hp: number; hpMax: number; level?: number | string; reaction?: 'hostile' | 'neutral' | 'friendly'; showLevel?: boolean }`.

- [ ] **Step 1: Write the component**

Create `packages/ui/src/components/Nameplate.tsx`:

```tsx
import type { ReactNode } from 'react'
import { Bar } from './Bar'

export interface NameplateProps {
  name: ReactNode
  hp: number
  hpMax: number
  level?: number | string
  /** Hostility; sets `data-ow-reaction`. @default 'hostile' */
  reaction?: 'hostile' | 'neutral' | 'friendly'
  /** Show the level tag before the name. @default false */
  showLevel?: boolean
}

/**
 * Compact over-head enemy nameplate (name + health). The host positions it in
 * screen space (world→screen projection is not this component's concern).
 */
export function Nameplate({
  name,
  hp,
  hpMax,
  level,
  reaction = 'hostile',
  showLevel = false,
}: NameplateProps) {
  return (
    <div className="ow-nameplate" data-ow-reaction={reaction}>
      <div className="ow-nameplate-header">
        {showLevel && level != null && <span className="ow-nameplate-level">{level}</span>}
        <span className="ow-nameplate-name">{name}</span>
      </div>
      <Bar value={hp} max={hpMax} variant="hp" />
    </div>
  )
}
```

- [ ] **Step 2: Append base CSS**

Append to `packages/ui/src/styles/styles.css`:

```css
/* ---------------- Nameplate ---------------- */
.ow-nameplate {
  display: flex;
  flex-direction: column;
  gap: 1px;
  width: 120px;
  pointer-events: auto;
}
.ow-nameplate-header {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: var(--ow-space-1);
  font-size: 0.75em;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.9);
}
.ow-nameplate-level {
  color: var(--ow-color-text-dim);
  font-variant-numeric: tabular-nums;
}
.ow-nameplate-name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ow-nameplate[data-ow-reaction="hostile"] .ow-nameplate-name { color: var(--ow-color-hp); }
.ow-nameplate[data-ow-reaction="neutral"] .ow-nameplate-name { color: var(--ow-color-xp); }
.ow-nameplate[data-ow-reaction="friendly"] .ow-nameplate-name { color: var(--ow-color-rarity-uncommon); }
```

- [ ] **Step 3: Export from the package index**

In `packages/ui/src/index.ts`, add:

```ts
export { Nameplate } from './components/Nameplate'
export type { NameplateProps } from './components/Nameplate'
```

- [ ] **Step 4: Extend the gallery story**

In `examples/ui-gallery/src/CombatHud.stories.tsx`, change the import line to add `Nameplate`:

```tsx
import { BuffBar, CastBar, Nameplate, TargetFrame } from '@overworld-engine/ui'
```

Then append at the end of the file:

```tsx
export const Nameplates = () => (
  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
    <Nameplate name="Goblin" level={3} hp={45} hpMax={60} reaction="hostile" showLevel />
    <Nameplate name="Wolf" hp={30} hpMax={80} reaction="neutral" />
    <Nameplate name="Guard" hp={200} hpMax={200} reaction="friendly" />
  </div>
)
```

- [ ] **Step 5: Typecheck, build, gallery typecheck**

Run: `pnpm --filter @overworld-engine/ui typecheck`
Expected: no errors.

Run: `pnpm --filter @overworld-engine/ui build`
Expected: build succeeds.

Run: `pnpm --filter ui-gallery typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/components/Nameplate.tsx packages/ui/src/styles/styles.css packages/ui/src/index.ts examples/ui-gallery/src/CombatHud.stories.tsx
git commit -m "feat(ui): add Nameplate component"
```

---

### Task 8: Changeset + full module verification

**Files:**
- Create: `.changeset/p0-combat-hud.md`

- [ ] **Step 1: Write the changeset**

Create `.changeset/p0-combat-hud.md`:

```md
---
'@overworld-engine/ui': minor
---

Add combat HUD components — CastBar, BuffBar, TargetFrame, Nameplate — plus
`castProgress` / `buffSweepPct` / `formatBuffTime` pure helpers, and expand the
rarity color tokens to six tiers (poor / common / uncommon / rare / epic /
legendary).
```

- [ ] **Step 2: Run the full package test suite**

Run: `pnpm --filter @overworld-engine/ui test`
Expected: all tests pass (includes the existing suite plus `castProgress` and `buffTimer`).

- [ ] **Step 3: Typecheck + build the package**

Run: `pnpm --filter @overworld-engine/ui typecheck && pnpm --filter @overworld-engine/ui build`
Expected: no errors; `dist` regenerated.

- [ ] **Step 4: Typecheck the gallery (real-usage compile proof)**

Run: `pnpm --filter ui-gallery typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add .changeset/p0-combat-hud.md
git commit -m "chore(ui): changeset for P0 combat HUD"
```

---

## Notes for the implementer

- **Story styling:** the Storybook preview decorator (`examples/ui-gallery/.storybook/preview.tsx`) already wraps every story in `.ow-root` with the toolbar-selected theme, so stories render components bare (no `<Hud>` wrapper) and still get scoped tokens + live theme switching. Mirror the existing `Bar.stories.tsx` pattern.
- **Build-before-gallery-typecheck:** `ui-gallery` imports from the built `@overworld-engine/ui` (`workspace:*` → `dist`). Always run the package `build` before `pnpm --filter ui-gallery typecheck`, or the new exports won't resolve.
- **`data-ow-*` escape hatch:** every new component exposes state via `data-ow-state` / `data-ow-kind` / `data-ow-classification` / `data-ow-reaction` so themes and consumers restyle via attribute selectors — no prop needed.
- **Rarity color-blindness:** rarity is color-only for now by design; the `data-ow-rarity` hook lets consumers add shape/icon redundancy later (out of scope here).
