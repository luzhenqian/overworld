/**
 * Pure clip-name resolution shared by Player and NPCs: prefer an explicitly
 * requested clip name when it exists in the model's `names`; otherwise fall
 * back to the source game's index convention. Returns `undefined` when
 * neither resolves (caller renders without that clip).
 */
export function resolveClip(
  names: string[],
  requested: string | undefined,
  fallbackIndex: number,
): string | undefined {
  if (requested && names.includes(requested)) return requested
  return names[fallbackIndex]
}

export interface NPCAnimationMap {
  idle: string
  walk?: string
  run?: string
}

/**
 * Resolve the clip name an NPC should play for a movement state. Requested
 * clips fall back to `idle` (mapped or index-0) so a single authored idle is
 * always enough. Mirrors the Player idle/walk/run contract.
 */
export function pickNpcClipName(
  names: string[],
  animationMap: NPCAnimationMap | undefined,
  state: 'idle' | 'walk' | 'run',
): string | undefined {
  const idle = resolveClip(names, animationMap?.idle, 0)
  if (state === 'idle') return idle
  const requested = state === 'walk' ? animationMap?.walk : animationMap?.run
  return resolveClip(names, requested, -1) ?? idle
}

/** Derive an NPC animation state from a locomotion status (e.g. ai AgentStatus). */
export function deriveNpcAnimState(status: {
  isMoving: boolean
  running?: boolean
}): 'idle' | 'walk' | 'run' {
  if (!status.isMoving) return 'idle'
  return status.running ? 'run' : 'walk'
}
