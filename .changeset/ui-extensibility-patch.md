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
