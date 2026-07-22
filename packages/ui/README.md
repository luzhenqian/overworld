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
