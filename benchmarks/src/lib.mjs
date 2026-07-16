/**
 * Tiny benchmark harness. No dependencies.
 *
 * `bench(name, fn, { iterations, warmup, runs })` calls `fn(i)` `iterations`
 * times per run, repeats `runs` times, and reports the **median** run
 * (ops/sec + mean ms per op) so a single GC pause or JIT tier-up does not
 * skew the number.
 */

/** Deterministic 32-bit PRNG (mulberry32). Returns a () => number in [0, 1). */
export function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Run one benchmark.
 * @param {string} name
 * @param {(i: number) => void} fn - one operation; receives the iteration index.
 * @param {{ iterations?: number, warmup?: number, runs?: number, meta?: object }} [options]
 * @returns {{ name: string, opsPerSec: number, meanMs: number, meta?: object }}
 */
export function bench(name, fn, options = {}) {
  const iterations = options.iterations ?? 1000
  const warmup = options.warmup ?? Math.min(iterations, 100)
  const runs = options.runs ?? 5

  for (let i = 0; i < warmup; i++) fn(i)

  const durations = []
  for (let r = 0; r < runs; r++) {
    const start = performance.now()
    for (let i = 0; i < iterations; i++) fn(i)
    durations.push(performance.now() - start)
  }
  durations.sort((a, b) => a - b)
  const median = durations[Math.floor(durations.length / 2)]
  const meanMs = median / iterations
  const opsPerSec = meanMs > 0 ? 1000 / meanMs : Infinity

  const result = { name, opsPerSec, meanMs }
  if (options.meta) result.meta = options.meta
  return result
}

/** Silence console.warn/console.error while `fn` runs (noisy fail-soft paths). */
export function quiet(fn) {
  const warn = console.warn
  const error = console.error
  console.warn = () => {}
  console.error = () => {}
  try {
    return fn()
  } finally {
    console.warn = warn
    console.error = error
  }
}
