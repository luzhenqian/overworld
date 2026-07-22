# @overworld-engine/ui

## 2.4.1

### Patch Changes

- c883c26: hextech theme: unify button shapes into one chamfered-tag family (replacing the
  side-pointed chevron whose clipped border made transparent ghost buttons look
  like floating brackets). Ghost buttons now get a faint translucent fill + soft
  gold edge so they read as buttons, and danger buttons get a red-tinted fill
  instead of inheriting the primary teal.

## 2.4.0

### Minor Changes

- 52be291: Add navigation HUD components — MinimapFrame, Compass, WaypointIndicator —
  plus `normalizeAngle` / `compassOffset` / `compassTicks` / `edgeAnchor` pure helpers. These
  compose with `@overworld-engine/minimap` without the UI package importing it
  (the host nests `<MiniMap>` inside `<MinimapFrame>` and feeds `Compass`/
  `WaypointIndicator` the heading / off-screen bearing).
- d65e7da: Add spatial focus navigation as an opt-in `@overworld-engine/ui/focus` subpath
  (FocusProvider, Focusable, useSpatialFocus, useGamepadFocus), backed by
  `@noriginmedia/norigin-spatial-navigation` as an OPTIONAL peer dependency — the
  core package stays dependency-free. Also: Button/IconButton/Slot now forward
  refs, and Modal gains a keyboard focus trap (Tab cycling, Escape to dismiss,
  focus restore on close).

## 2.3.0

### Minor Changes

- 848922d: Add combat HUD components — CastBar, BuffBar, TargetFrame, Nameplate — plus
  `castProgress` / `buffSweepPct` / `formatBuffTime` pure helpers, and expand the
  rarity color tokens to six tiers (poor / common / uncommon / rare / epic /
  legendary). Note: this also shifts the existing --ow-color-rarity-common token from grey (#9aa0b0) to near-white (#f0f0f0), a visible change to existing common-rarity Slot borders.

## 2.2.0

### Minor Changes

- 1689ef2: New package: headless game UI. HUD primitives (Hud, Panel, GameWindow, Bar, Slot/SlotGrid, Hotbar, Button, Tooltip, Modal), engine-bound components via duck-typed interfaces (DialogueBox, QuestTracker, QuestLogWindow, InventoryWindow, ToastViewport, AlertHost, TutorialOverlay, AchievementPopup), behavior hooks, a neutral base stylesheet, and four theme skins: xianxia, hextech, tactical, pixel.
