---
'@overworld-engine/scene': major
---

Add instanced `Decorations` renderer, runtime `Lod` + `lods` config, orbit
camera on `FollowCamera`, ref-driven moving NPCs (`AgentNPC`,
`SceneShell.npcPositionRefs`), and default input blocking via the shared
`inputLock`. `isInputBlocked` now falls back to `inputLock.isLocked()` when
omitted (no effect until a lock is acquired).
