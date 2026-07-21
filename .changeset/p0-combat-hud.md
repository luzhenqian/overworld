---
'@overworld-engine/ui': minor
---

Add combat HUD components — CastBar, BuffBar, TargetFrame, Nameplate — plus
`castProgress` / `buffSweepPct` / `formatBuffTime` pure helpers, and expand the
rarity color tokens to six tiers (poor / common / uncommon / rare / epic /
legendary). Note: this also shifts the existing --ow-color-rarity-common token from grey (#9aa0b0) to near-white (#f0f0f0), a visible change to existing common-rarity Slot borders.
