# @overworld-engine/ui

## 2.3.0

### Minor Changes

- 848922d: Add combat HUD components — CastBar, BuffBar, TargetFrame, Nameplate — plus
  `castProgress` / `buffSweepPct` / `formatBuffTime` pure helpers, and expand the
  rarity color tokens to six tiers (poor / common / uncommon / rare / epic /
  legendary). Note: this also shifts the existing --ow-color-rarity-common token from grey (#9aa0b0) to near-white (#f0f0f0), a visible change to existing common-rarity Slot borders.

## 2.2.0

### Minor Changes

- 1689ef2: New package: headless game UI. HUD primitives (Hud, Panel, GameWindow, Bar, Slot/SlotGrid, Hotbar, Button, Tooltip, Modal), engine-bound components via duck-typed interfaces (DialogueBox, QuestTracker, QuestLogWindow, InventoryWindow, ToastViewport, AlertHost, TutorialOverlay, AchievementPopup), behavior hooks, a neutral base stylesheet, and four theme skins: xianxia, hextech, tactical, pixel.
