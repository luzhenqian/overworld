# P0 Minimap HUD Decoration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three prop-driven navigation-HUD components (MinimapFrame, Compass, WaypointIndicator) plus two tested pure-logic helpers (compassStrip, edgeAnchor) to `@overworld-engine/ui`, and prove the cross-package composition by nesting a real `<MiniMap>` inside `<MinimapFrame>` in the gallery.

**Architecture:** All three components are thin presentational components (no engine binding, props only). The UI package NEVER imports `@overworld-engine/minimap` (zero cross-package rule) — composition happens in the app: the host nests `<MiniMap>` inside `<MinimapFrame>`, passes `heading` to `<Compass>`, and passes a screen-bearing `angle` (from the minimap package's `computeOffscreenIndicator`) to `<WaypointIndicator>`. Angle math lives in tested pure functions.

**Tech Stack:** React 18, TypeScript, tsup, vitest (node), CSS custom-property tokens (`--ow-*`), Storybook 9, pnpm workspace.

## Global Constraints

- **Zero cross-package imports** inside `packages/ui/src` — no `@overworld-engine/*` imports; components take plain props. (`examples/ui-gallery` MAY import `@overworld-engine/minimap` — that is the app composition layer, not the library.)
- **Pure-logic tests only** — vitest node tests for extracted functions; NO testing-library / jsdom; add no test-infra dependency. Components have NO render tests — verification is typecheck + build + gallery typecheck.
- **Styling convention** — stable `ow-*` classes + `data-ow-*` state attributes, near-zero inline styles (positioning `left`/`top`/`transform` and the `left` offset are the allowed inline styles), all visuals via `--ow-*` tokens; bare `.ow-*` selectors. Respect `prefers-reduced-motion`.
- **Angle conventions** (documented, do not "fix"): Compass `heading`/`bearing` use 0 = north (three.js facing −Z), +π/2 = east (clockwise). WaypointIndicator/`edgeAnchor` `angle` uses 0 = up, clockwise, matching the minimap package's `computeOffscreenIndicator().angle`.
- **Avoid TS1149 case collisions** in filenames. New files: `compassStrip.ts`, `edgeAnchor.ts`, `MinimapFrame.tsx`, `Compass.tsx`, `WaypointIndicator.tsx`.
- **Scoped verification** — only `@overworld-engine/ui`, `@overworld-engine/minimap` (its dist must exist for the gallery to typecheck), and `ui-gallery`; never the full workspace.
- **Release** — `@overworld-engine/ui` `minor` via a changeset (fixed version group).

## File Structure

| File | Responsibility |
|---|---|
| `packages/ui/src/compassStrip.ts` | Pure: bearing→strip offset + visible cardinal ticks (create) |
| `packages/ui/src/edgeAnchor.ts` | Pure: screen-bearing → rect-edge anchor + rotation (create) |
| `packages/ui/src/components/MinimapFrame.tsx` | Themed frame wrapping a map widget (create) |
| `packages/ui/src/components/Compass.tsx` | Heading-driven cardinal strip (create) |
| `packages/ui/src/components/WaypointIndicator.tsx` | Screen-edge off-screen arrow (create) |
| `packages/ui/src/styles/styles.css` | Base-layer CSS (modify) |
| `packages/ui/src/index.ts` | Public exports (modify) |
| `packages/ui/src/__tests__/compassStrip.test.ts` | Tests for compassStrip (create) |
| `packages/ui/src/__tests__/edgeAnchor.test.ts` | Tests for edgeAnchor (create) |
| `examples/ui-gallery/package.json` | Add `@overworld-engine/minimap` workspace dep (modify) |
| `examples/ui-gallery/src/Navigation.stories.tsx` | Gallery demo nesting real `<MiniMap>` (create) |
| `.changeset/p0-minimap-hud.md` | Release note (create) |

---

### Task 1: `compassStrip` pure logic

**Files:**
- Create: `packages/ui/src/compassStrip.ts`
- Test: `packages/ui/src/__tests__/compassStrip.test.ts`
- Modify: `packages/ui/src/index.ts`

**Interfaces:**
- Produces: `normalizeAngle(radians: number): number`; `compassOffset(bearing: number, heading: number, fov: number): number | null`; `compassTicks(heading: number, fov: number): CompassTick[]` where `interface CompassTick { label: string; offset: number; major: boolean }`.

- [ ] **Step 1: Write the failing test**

Create `packages/ui/src/__tests__/compassStrip.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { compassOffset, compassTicks, normalizeAngle } from '../compassStrip'

describe('normalizeAngle', () => {
  test('wraps into (-PI, PI]', () => {
    expect(normalizeAngle(0)).toBeCloseTo(0)
    expect(normalizeAngle(Math.PI)).toBeCloseTo(Math.PI)
    expect(normalizeAngle(-Math.PI)).toBeCloseTo(Math.PI)
    expect(normalizeAngle(1.5 * Math.PI)).toBeCloseTo(-0.5 * Math.PI)
    expect(normalizeAngle(-6)).toBeCloseTo(2 * Math.PI - 6)
  })
})

describe('compassOffset', () => {
  test('bearing straight ahead is centered', () => {
    expect(compassOffset(0, 0, Math.PI)).toBeCloseTo(0.5)
    expect(compassOffset(Math.PI / 2, Math.PI / 2, Math.PI)).toBeCloseTo(0.5)
  })
  test('right/left edges of the fov map to 1 and 0', () => {
    expect(compassOffset(Math.PI / 2, 0, Math.PI)).toBeCloseTo(1)
    expect(compassOffset(-Math.PI / 2, 0, Math.PI)).toBeCloseTo(0)
  })
  test('outside the fov returns null', () => {
    expect(compassOffset(Math.PI, 0, Math.PI)).toBeNull()
  })
  test('handles ±PI wraparound (near-opposite raw values are actually close)', () => {
    const off = compassOffset(-3.0, 3.0, Math.PI)
    expect(off).not.toBeNull()
    expect(off!).toBeCloseTo(0.5 + normalizeAngle(-3.0 - 3.0) / Math.PI)
  })
})

describe('compassTicks', () => {
  test('returns only visible cardinal/intercardinal ticks, left-to-right, with major flags', () => {
    const ticks = compassTicks(0, Math.PI)
    expect(ticks.map((t) => t.label)).toEqual(['W', 'NW', 'N', 'NE', 'E'])
    expect(ticks.map((t) => Number(t.offset.toFixed(2)))).toEqual([0, 0.25, 0.5, 0.75, 1])
    expect(ticks.filter((t) => t.major).map((t) => t.label)).toEqual(['W', 'N', 'E'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @overworld-engine/ui exec vitest run src/__tests__/compassStrip.test.ts`
Expected: FAIL — cannot resolve `../compassStrip`.

- [ ] **Step 3: Write minimal implementation**

Create `packages/ui/src/compassStrip.ts`:

```ts
/** Normalize an angle to (-π, π]. */
export function normalizeAngle(radians: number): number {
  const twoPi = Math.PI * 2
  let a = radians % twoPi
  if (a <= -Math.PI) a += twoPi
  else if (a > Math.PI) a -= twoPi
  return a
}

/**
 * Normalized x-position [0,1] of a bearing on the compass strip, or null when
 * the bearing is outside the visible field of view. `bearing`/`heading` share
 * the convention 0 = north, +π/2 = east (clockwise). Handles ±π wraparound.
 */
export function compassOffset(bearing: number, heading: number, fov: number): number | null {
  const rel = normalizeAngle(bearing - heading)
  if (Math.abs(rel) > fov / 2) return null
  return 0.5 + rel / fov
}

export interface CompassTick {
  label: string
  offset: number
  major: boolean
}

const CARDINALS: { label: string; bearing: number; major: boolean }[] = [
  { label: 'N', bearing: 0, major: true },
  { label: 'NE', bearing: Math.PI / 4, major: false },
  { label: 'E', bearing: Math.PI / 2, major: true },
  { label: 'SE', bearing: (3 * Math.PI) / 4, major: false },
  { label: 'S', bearing: Math.PI, major: true },
  { label: 'SW', bearing: (5 * Math.PI) / 4, major: false },
  { label: 'W', bearing: (3 * Math.PI) / 2, major: true },
  { label: 'NW', bearing: (7 * Math.PI) / 4, major: false },
]

/** Visible cardinal/intercardinal ticks within the fov, left-to-right by offset. */
export function compassTicks(heading: number, fov: number): CompassTick[] {
  return CARDINALS.flatMap((c) => {
    const offset = compassOffset(c.bearing, heading, fov)
    return offset == null ? [] : [{ label: c.label, offset, major: c.major }]
  }).sort((a, b) => a.offset - b.offset)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @overworld-engine/ui exec vitest run src/__tests__/compassStrip.test.ts`
Expected: PASS.

- [ ] **Step 5: Export from the package index**

In `packages/ui/src/index.ts`, add after the `highlightBox` export line:

```ts
export { normalizeAngle, compassOffset, compassTicks } from './compassStrip'
export type { CompassTick } from './compassStrip'
```

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter @overworld-engine/ui typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/ui/src/compassStrip.ts packages/ui/src/__tests__/compassStrip.test.ts packages/ui/src/index.ts
git commit -m "feat(ui): add compassStrip pure-logic helpers"
```

---

### Task 2: `edgeAnchor` pure logic

**Files:**
- Create: `packages/ui/src/edgeAnchor.ts`
- Test: `packages/ui/src/__tests__/edgeAnchor.test.ts`
- Modify: `packages/ui/src/index.ts`

**Interfaces:**
- Produces: `edgeAnchor(angle: number, opts?: { inset?: number }): EdgeAnchor` where `interface EdgeAnchor { xPct: number; yPct: number; rotationDeg: number }`.

- [ ] **Step 1: Write the failing test**

Create `packages/ui/src/__tests__/edgeAnchor.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { edgeAnchor } from '../edgeAnchor'

describe('edgeAnchor', () => {
  test('cardinal bearings anchor to the middle of each edge (inset 0.06)', () => {
    const up = edgeAnchor(0)
    expect(up.xPct).toBeCloseTo(0.5)
    expect(up.yPct).toBeCloseTo(0.06)
    expect(up.rotationDeg).toBeCloseTo(0)

    const right = edgeAnchor(Math.PI / 2)
    expect(right.xPct).toBeCloseTo(0.94)
    expect(right.yPct).toBeCloseTo(0.5)
    expect(right.rotationDeg).toBeCloseTo(90)

    const down = edgeAnchor(Math.PI)
    expect(down.xPct).toBeCloseTo(0.5)
    expect(down.yPct).toBeCloseTo(0.94)

    const left = edgeAnchor(-Math.PI / 2)
    expect(left.xPct).toBeCloseTo(0.06)
    expect(left.yPct).toBeCloseTo(0.5)
    expect(left.rotationDeg).toBeCloseTo(-90)
  })

  test('a diagonal bearing clamps toward a corner', () => {
    const tr = edgeAnchor(Math.PI / 4)
    expect(tr.xPct).toBeCloseTo(0.94)
    expect(tr.yPct).toBeCloseTo(0.06)
    expect(tr.rotationDeg).toBeCloseTo(45)
  })

  test('inset option controls the margin', () => {
    const up = edgeAnchor(0, { inset: 0.1 })
    expect(up.yPct).toBeCloseTo(0.1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @overworld-engine/ui exec vitest run src/__tests__/edgeAnchor.test.ts`
Expected: FAIL — cannot resolve `../edgeAnchor`.

- [ ] **Step 3: Write minimal implementation**

Create `packages/ui/src/edgeAnchor.ts`:

```ts
export interface EdgeAnchor {
  /** Horizontal anchor as a fraction [0,1] (0 = left, 1 = right). */
  xPct: number
  /** Vertical anchor as a fraction [0,1] (0 = top, 1 = bottom). */
  yPct: number
  /** Arrow rotation in degrees (0 = pointing up, clockwise). */
  rotationDeg: number
}

/**
 * Anchor an off-screen-target arrow to the edge of the screen rectangle.
 * `angle` is a screen bearing in radians, 0 = up, clockwise — the same value
 * the minimap package's `computeOffscreenIndicator().angle` returns. `inset`
 * is the margin (as a [0,1] fraction) kept from each screen edge.
 */
export function edgeAnchor(angle: number, opts?: { inset?: number }): EdgeAnchor {
  const inset = opts?.inset ?? 0.06
  const dx = Math.sin(angle)
  const dy = -Math.cos(angle)
  const t = 1 / Math.max(Math.abs(dx), Math.abs(dy))
  const clamp = (v: number): number => Math.min(Math.max(v, inset), 1 - inset)
  return {
    xPct: clamp((dx * t + 1) / 2),
    yPct: clamp((dy * t + 1) / 2),
    rotationDeg: (angle * 180) / Math.PI,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @overworld-engine/ui exec vitest run src/__tests__/edgeAnchor.test.ts`
Expected: PASS.

- [ ] **Step 5: Export from the package index**

In `packages/ui/src/index.ts`, add after the `compassStrip` exports from Task 1:

```ts
export { edgeAnchor } from './edgeAnchor'
export type { EdgeAnchor } from './edgeAnchor'
```

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter @overworld-engine/ui typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/ui/src/edgeAnchor.ts packages/ui/src/__tests__/edgeAnchor.test.ts packages/ui/src/index.ts
git commit -m "feat(ui): add edgeAnchor pure-logic helper"
```

---

### Task 3: MinimapFrame component + gallery minimap dependency

**Files:**
- Create: `packages/ui/src/components/MinimapFrame.tsx`
- Modify: `packages/ui/src/styles/styles.css` (append MinimapFrame block)
- Modify: `packages/ui/src/index.ts`
- Modify: `examples/ui-gallery/package.json` (add minimap dep)
- Create: `examples/ui-gallery/src/Navigation.stories.tsx`

**Interfaces:**
- Produces: `MinimapFrame(props: MinimapFrameProps)`; `interface MinimapFrameProps { children?: ReactNode; label?: ReactNode; coords?: { x: number; z: number }; controls?: ReactNode }`.

- [ ] **Step 1: Write the component**

Create `packages/ui/src/components/MinimapFrame.tsx`:

```tsx
import type { ReactNode } from 'react'

export interface MinimapFrameProps {
  /** The map widget to frame (e.g. a `<MiniMap>` from `@overworld-engine/minimap`). */
  children?: ReactNode
  /** Region/zone name shown in the frame header. */
  label?: ReactNode
  /** Player coordinates readout; each component is rounded to an integer. */
  coords?: { x: number; z: number }
  /** Zoom / control buttons slot rendered in the header. */
  controls?: ReactNode
}

/** Themed decorative frame around a minimap: header (label + controls), body, coords. */
export function MinimapFrame({ children, label, coords, controls }: MinimapFrameProps) {
  return (
    <div className="ow-minimap-frame">
      {(label != null || controls != null) && (
        <div className="ow-minimap-frame-header">
          {label != null && <span className="ow-minimap-frame-label">{label}</span>}
          {controls != null && <span className="ow-minimap-frame-controls">{controls}</span>}
        </div>
      )}
      <div className="ow-minimap-frame-body">{children}</div>
      {coords != null && (
        <div className="ow-minimap-frame-coords">
          <span>X {Math.round(coords.x)}</span>
          <span>Z {Math.round(coords.z)}</span>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Append base CSS**

Append to `packages/ui/src/styles/styles.css`:

```css
/* ---------------- MinimapFrame ---------------- */
.ow-minimap-frame {
  display: inline-flex;
  flex-direction: column;
  gap: var(--ow-space-1);
  padding: var(--ow-space-2);
  background: var(--ow-color-surface);
  border: var(--ow-panel-border-width) solid var(--ow-color-border);
  border-image: var(--ow-panel-border-image);
  border-radius: var(--ow-radius);
  box-shadow: var(--ow-shadow);
  pointer-events: auto;
}
.ow-minimap-frame-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ow-space-2);
}
.ow-minimap-frame-label {
  font-size: 0.8em;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--ow-color-text-dim);
}
.ow-minimap-frame-body {
  position: relative;
  display: flex;
}
.ow-minimap-frame-coords {
  display: flex;
  justify-content: center;
  gap: var(--ow-space-3);
  font-size: 0.72em;
  font-variant-numeric: tabular-nums;
  color: var(--ow-color-text-dim);
}
```

- [ ] **Step 3: Export from the package index**

In `packages/ui/src/index.ts`, add (with the other component exports):

```ts
export { MinimapFrame } from './components/MinimapFrame'
export type { MinimapFrameProps } from './components/MinimapFrame'
```

- [ ] **Step 4: Add the minimap workspace dependency to the gallery**

In `examples/ui-gallery/package.json`, add to the `dependencies` object (keep alphabetical order — it goes right after `"@overworld-engine/inventory"`):

```json
    "@overworld-engine/minimap": "workspace:*",
```

- [ ] **Step 5: Install to link the workspace package**

Run from the repo root: `pnpm install`
Expected: completes; `@overworld-engine/minimap` linked into `examples/ui-gallery/node_modules`.

- [ ] **Step 6: Create the gallery story (Framed minimap)**

Create `examples/ui-gallery/src/Navigation.stories.tsx`:

```tsx
import { useRef } from 'react'
import type { Vec3 } from '@overworld-engine/core'
import { MiniMap, useMinimapStore } from '@overworld-engine/minimap'
import { MinimapFrame } from '@overworld-engine/ui'

export default { title: 'HUD / Navigation' }

const store = useMinimapStore.getState()
store.registerMarker({ id: 'shop', kind: 'shop', position: [18, 0, -10] })
store.registerMarker({ id: 'npc', kind: 'npc', position: [-14, 0, 8] })
store.registerMarker({ id: 'quest', kind: 'quest', position: [6, 0, 22] })

export const Framed = () => {
  const playerPosition = useRef<Vec3>([0, 0, 0])
  return (
    <MinimapFrame label="Verdant Hollow" coords={{ x: 0, z: 0 }}>
      <MiniMap
        worldBounds={{ minX: -50, maxX: 50, minZ: -50, maxZ: 50 }}
        playerPosition={playerPosition}
        markerColors={{ npc: '#60a5fa', shop: '#f472b6', quest: '#facc15' }}
      />
    </MinimapFrame>
  )
}
```

- [ ] **Step 7: Verify (build minimap so the gallery can resolve its types)**

Run: `pnpm --filter @overworld-engine/ui typecheck`
Expected: no errors.

Run: `pnpm --filter @overworld-engine/ui build`
Expected: build succeeds.

Run: `pnpm --filter @overworld-engine/minimap build`
Expected: build succeeds (regenerates `packages/minimap/dist` so `ui-gallery` typecheck resolves `MiniMap`/`useMinimapStore`).

Run: `pnpm --filter ui-gallery typecheck`
Expected: no errors (proves `MinimapFrame` composes with the real `<MiniMap>`).

- [ ] **Step 8: Commit**

```bash
git add packages/ui/src/components/MinimapFrame.tsx packages/ui/src/styles/styles.css packages/ui/src/index.ts examples/ui-gallery/package.json examples/ui-gallery/src/Navigation.stories.tsx pnpm-lock.yaml
git commit -m "feat(ui): add MinimapFrame component + gallery minimap composition"
```

---

### Task 4: Compass component

**Files:**
- Create: `packages/ui/src/components/Compass.tsx`
- Modify: `packages/ui/src/styles/styles.css` (append Compass block)
- Modify: `packages/ui/src/index.ts`
- Modify: `examples/ui-gallery/src/Navigation.stories.tsx` (add `CompassStrip` story)

**Interfaces:**
- Consumes: `compassOffset`, `compassTicks` (Task 1).
- Produces: `Compass(props: CompassProps)`; `interface CompassMarker { id: string; bearing: number; icon?: ReactNode; color?: string }`; `interface CompassProps { heading: number; fov?: number; markers?: readonly CompassMarker[] }`. `fov` defaults to `Math.PI`.

- [ ] **Step 1: Write the component**

Create `packages/ui/src/components/Compass.tsx`:

```tsx
import type { CSSProperties, ReactNode } from 'react'
import { compassOffset, compassTicks } from '../compassStrip'

export interface CompassMarker {
  id: string
  /** World bearing in radians (0 = north, +π/2 = east), same convention as `heading`. */
  bearing: number
  icon?: ReactNode
  color?: string
}

export interface CompassProps {
  /** Player facing heading in radians (three.js: 0 = facing −Z = north). */
  heading: number
  /** Angular field of view of the visible strip. @default Math.PI */
  fov?: number
  /** Bearing pips (quest markers, POIs) placed along the strip. */
  markers?: readonly CompassMarker[]
}

/** Horizontal cardinal compass strip that scrolls with the player's heading. */
export function Compass({ heading, fov = Math.PI, markers }: CompassProps) {
  const ticks = compassTicks(heading, fov)
  return (
    <div className="ow-compass">
      <div className="ow-compass-strip">
        {ticks.map((t) => (
          <span
            key={t.label}
            className="ow-compass-tick"
            data-ow-major={t.major ? '' : undefined}
            style={{ left: `${t.offset * 100}%` }}
          >
            {t.label}
          </span>
        ))}
        {markers?.map((m) => {
          const offset = compassOffset(m.bearing, heading, fov)
          if (offset == null) return null
          return (
            <span
              key={m.id}
              className="ow-compass-pip"
              style={{ left: `${offset * 100}%`, ...(m.color ? { color: m.color } : {}) } as CSSProperties}
            >
              {m.icon ?? '▾'}
            </span>
          )
        })}
      </div>
      <span className="ow-compass-center" aria-hidden="true" />
    </div>
  )
}
```

- [ ] **Step 2: Append base CSS**

Append to `packages/ui/src/styles/styles.css`:

```css
/* ---------------- Compass ---------------- */
.ow-compass {
  position: relative;
  width: 100%;
  height: 28px;
  overflow: hidden;
  background: var(--ow-color-surface-2);
  border: 1px solid var(--ow-color-border);
  border-radius: var(--ow-radius-sm);
  pointer-events: auto;
}
.ow-compass-strip {
  position: absolute;
  inset: 0;
}
.ow-compass-tick {
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%);
  font-size: 0.7em;
  color: var(--ow-color-text-dim);
  font-variant-numeric: tabular-nums;
}
.ow-compass-tick[data-ow-major] {
  font-size: 0.85em;
  font-weight: 700;
  color: var(--ow-color-text);
}
.ow-compass-pip {
  position: absolute;
  top: 2px;
  transform: translateX(-50%);
  font-size: 0.7em;
  line-height: 1;
}
.ow-compass-center {
  position: absolute;
  left: 50%;
  top: 0;
  bottom: 0;
  width: 1px;
  background: var(--ow-color-accent);
  transform: translateX(-50%);
}
```

- [ ] **Step 3: Export from the package index**

In `packages/ui/src/index.ts`, add:

```ts
export { Compass } from './components/Compass'
export type { CompassProps, CompassMarker } from './components/Compass'
```

- [ ] **Step 4: Extend the gallery story**

In `examples/ui-gallery/src/Navigation.stories.tsx`, change the imports:

Change the react import line to:
```tsx
import { useEffect, useRef, useState } from 'react'
```
Change the ui import line to:
```tsx
import { Compass, MinimapFrame } from '@overworld-engine/ui'
```

Then append at the end of the file:

```tsx
export const CompassStrip = () => {
  const [heading, setHeading] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setHeading((h) => (h + 0.02) % (Math.PI * 2)), 50)
    return () => clearInterval(id)
  }, [])
  return (
    <div style={{ maxWidth: 360 }}>
      <Compass
        heading={heading}
        markers={[
          { id: 'quest', bearing: 0.6, icon: '❗', color: '#facc15' },
          { id: 'shop', bearing: 2.4, icon: '🛒', color: '#f472b6' },
          { id: 'home', bearing: 4.7, icon: '🏠' },
        ]}
      />
    </div>
  )
}
```

- [ ] **Step 5: Verify**

Run: `pnpm --filter @overworld-engine/ui typecheck`
Expected: no errors.

Run: `pnpm --filter @overworld-engine/ui build`
Expected: build succeeds.

Run: `pnpm --filter ui-gallery typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/components/Compass.tsx packages/ui/src/styles/styles.css packages/ui/src/index.ts examples/ui-gallery/src/Navigation.stories.tsx
git commit -m "feat(ui): add Compass component"
```

---

### Task 5: WaypointIndicator component

**Files:**
- Create: `packages/ui/src/components/WaypointIndicator.tsx`
- Modify: `packages/ui/src/styles/styles.css` (append WaypointIndicator block)
- Modify: `packages/ui/src/index.ts`
- Modify: `examples/ui-gallery/src/Navigation.stories.tsx` (add `Waypoints` story)

**Interfaces:**
- Consumes: `edgeAnchor` (Task 2).
- Produces: `WaypointIndicator(props: WaypointIndicatorProps)`; `interface WaypointIndicatorProps { angle: number; label?: ReactNode; icon?: ReactNode; distance?: ReactNode; color?: string }`.

- [ ] **Step 1: Write the component**

Create `packages/ui/src/components/WaypointIndicator.tsx`:

```tsx
import type { CSSProperties, ReactNode } from 'react'
import { edgeAnchor } from '../edgeAnchor'

export interface WaypointIndicatorProps {
  /** Screen bearing toward the target in radians (0 = up, clockwise) — pass the
   * minimap package's `computeOffscreenIndicator().angle` directly. */
  angle: number
  label?: ReactNode
  icon?: ReactNode
  /** Distance readout, e.g. "42m". */
  distance?: ReactNode
  color?: string
}

/**
 * Screen-edge arrow pointing toward an off-screen objective. Self-positions
 * absolutely; render inside a `position: relative` container (e.g. the HUD).
 */
export function WaypointIndicator({ angle, label, icon, distance, color }: WaypointIndicatorProps) {
  const { xPct, yPct, rotationDeg } = edgeAnchor(angle)
  return (
    <div
      className="ow-waypoint"
      style={{ left: `${xPct * 100}%`, top: `${yPct * 100}%`, ...(color ? { color } : {}) } as CSSProperties}
    >
      <span
        className="ow-waypoint-arrow"
        aria-hidden="true"
        style={{ transform: `rotate(${rotationDeg}deg)` }}
      >
        ▲
      </span>
      {icon != null && (
        <span className="ow-waypoint-icon" aria-hidden="true">
          {icon}
        </span>
      )}
      {label != null && <span className="ow-waypoint-label">{label}</span>}
      {distance != null && <span className="ow-waypoint-distance">{distance}</span>}
    </div>
  )
}
```

- [ ] **Step 2: Append base CSS**

Append to `packages/ui/src/styles/styles.css`:

```css
/* ---------------- WaypointIndicator ---------------- */
.ow-waypoint {
  position: absolute;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  pointer-events: none;
  color: var(--ow-color-accent);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.9);
}
.ow-waypoint-arrow {
  font-size: 0.9em;
  line-height: 1;
}
.ow-waypoint-icon {
  font-size: 0.9em;
  line-height: 1;
}
.ow-waypoint-label {
  font-size: 0.65em;
  font-weight: 700;
  color: var(--ow-color-text);
  white-space: nowrap;
}
.ow-waypoint-distance {
  font-size: 0.6em;
  font-variant-numeric: tabular-nums;
  color: var(--ow-color-text-dim);
}
```

- [ ] **Step 3: Export from the package index**

In `packages/ui/src/index.ts`, add:

```ts
export { WaypointIndicator } from './components/WaypointIndicator'
export type { WaypointIndicatorProps } from './components/WaypointIndicator'
```

- [ ] **Step 4: Extend the gallery story**

In `examples/ui-gallery/src/Navigation.stories.tsx`, change the ui import line to:

```tsx
import { Compass, MinimapFrame, WaypointIndicator } from '@overworld-engine/ui'
```

Then append at the end of the file:

```tsx
export const Waypoints = () => (
  <div
    style={{
      position: 'relative',
      height: '70vh',
      border: '1px dashed var(--ow-color-border)',
      borderRadius: 8,
    }}
  >
    <WaypointIndicator angle={0.5} label="Objective" icon="🎯" distance="42m" color="#facc15" />
    <WaypointIndicator angle={2.5} label="Shop" icon="🛒" distance="120m" />
    <WaypointIndicator angle={-1.8} label="Ally" icon="🤝" distance="18m" color="#60a5fa" />
  </div>
)
```

- [ ] **Step 5: Verify**

Run: `pnpm --filter @overworld-engine/ui typecheck`
Expected: no errors.

Run: `pnpm --filter @overworld-engine/ui build`
Expected: build succeeds.

Run: `pnpm --filter ui-gallery typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/components/WaypointIndicator.tsx packages/ui/src/styles/styles.css packages/ui/src/index.ts examples/ui-gallery/src/Navigation.stories.tsx
git commit -m "feat(ui): add WaypointIndicator component"
```

---

### Task 6: Changeset + full module verification

**Files:**
- Create: `.changeset/p0-minimap-hud.md`

- [ ] **Step 1: Write the changeset**

Create `.changeset/p0-minimap-hud.md`:

```md
---
'@overworld-engine/ui': minor
---

Add navigation HUD components — MinimapFrame, Compass, WaypointIndicator —
plus `compassOffset` / `compassTicks` / `edgeAnchor` pure helpers. These
compose with `@overworld-engine/minimap` without the UI package importing it
(the host nests `<MiniMap>` inside `<MinimapFrame>` and feeds `Compass`/
`WaypointIndicator` the heading / off-screen bearing).
```

- [ ] **Step 2: Run the full package test suite**

Run: `pnpm --filter @overworld-engine/ui test`
Expected: all tests pass (existing suite + `compassStrip` + `edgeAnchor`).

- [ ] **Step 3: Typecheck + build the package**

Run: `pnpm --filter @overworld-engine/ui typecheck && pnpm --filter @overworld-engine/ui build`
Expected: no errors; `dist` regenerated.

- [ ] **Step 4: Typecheck the gallery (real-usage compile proof)**

Run: `pnpm --filter ui-gallery typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add .changeset/p0-minimap-hud.md
git commit -m "chore(ui): changeset for P0 minimap HUD decoration"
```

---

## Notes for the implementer

- **Story styling & positioning:** the Storybook preview decorator wraps every story in `.ow-root` + the toolbar theme, so stories render components bare. `WaypointIndicator` positions absolutely, so its story wraps the indicators in a `position: relative` container (already in the Task 5 story code).
- **Build order:** `ui-gallery` imports the built `@overworld-engine/ui` AND (new in this module) the built `@overworld-engine/minimap`. Run both package builds before `pnpm --filter ui-gallery typecheck`. Task 3 builds minimap once; later tasks only touch ui, so rebuilding ui is enough there (minimap dist persists).
- **`pnpm install` (Task 3 only):** required once after adding the workspace dep so pnpm links `@overworld-engine/minimap` into the gallery. Commit the updated `pnpm-lock.yaml`.
- **Angle conventions are intentional and differ between components** — Compass (0 = north) vs WaypointIndicator (0 = up/ahead, matching radar). Do not "unify" them; each matches its data source.
- **`data-ow-major` empty-string attribute:** `data-ow-major={t.major ? '' : undefined}` renders `data-ow-major=""` (present) for majors and omits it otherwise; the CSS targets `[data-ow-major]` by presence.
