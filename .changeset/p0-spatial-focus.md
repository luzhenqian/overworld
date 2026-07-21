---
'@overworld-engine/ui': minor
---

Add spatial focus navigation as an opt-in `@overworld-engine/ui/focus` subpath
(FocusProvider, Focusable, useSpatialFocus, useGamepadFocus), backed by
`@noriginmedia/norigin-spatial-navigation` as an OPTIONAL peer dependency — the
core package stays dependency-free. Also: Button/IconButton/Slot now forward
refs, and Modal gains a keyboard focus trap (Tab cycling, Escape to dismiss,
focus restore on close).
