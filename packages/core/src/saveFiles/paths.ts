/** Temp-file path used mid-write by {@link commitSlot}. */
export function tmpPath(path: string): string {
  return `${path}.tmp`
}

/** Path of the nth rotated backup (1 = most recent). */
export function backupPath(path: string, n: number): string {
  return `${path}.bak${n}`
}
