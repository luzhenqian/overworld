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
