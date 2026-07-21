/** Selector matching the tabbable elements inside a focus trap. */
export const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Next index when cycling focus with Tab (`forward`) / Shift+Tab (`!forward`),
 * wrapping around the ends. `current < 0` means the active element is not in the
 * set, so start at the first (forward) or last (backward). Empty set → -1.
 */
export function nextTrapIndex(count: number, current: number, forward: boolean): number {
  if (count <= 0) return -1
  if (current < 0) return forward ? 0 : count - 1
  return forward ? (current + 1) % count : (current - 1 + count) % count
}
