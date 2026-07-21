/** Ids unlocked in `next` that were not yet unlocked in `prev`. */
export function newlyUnlocked(
  prev: Record<string, number>,
  next: Record<string, number>,
): string[] {
  return Object.keys(next).filter((id) => !(id in prev))
}
