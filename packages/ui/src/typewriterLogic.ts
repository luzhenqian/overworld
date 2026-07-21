/** One tick of a typewriter reveal: advance `revealed` by `step`, clamped. */
export function advanceReveal(
  revealed: number,
  textLength: number,
  step = 1,
): { revealed: number; done: boolean } {
  const next = Math.min(revealed + step, textLength)
  return { revealed: next, done: next >= textLength }
}
