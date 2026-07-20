---
'@overworld-engine/scene': major
---

Add instanced `Decorations` renderer, runtime `Lod` + `lods` config, orbit
camera on `FollowCamera`, and ref-driven moving NPCs: `SceneShell.npcPositionRefs`
now drives an NPC's `BaseNPC` visual, collider, proximity, and selection ring
from a live position ref (`BaseNPC.positionRef`), plus `AgentNPC` for standalone
moving NPCs. Default input blocking via the shared `inputLock`: `isInputBlocked`
falls back to `inputLock.isLocked()` when omitted (no effect until a lock is
acquired).
