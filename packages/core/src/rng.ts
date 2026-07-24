/**
 * A pseudo-random source in `[0, 1)`. Any factory function that needs
 * "reproducible randomness" (loot tables, world generation, cosmetic rolls,
 * a game's own battle RNG, ...) should accept this as an injectable
 * dependency rather than calling `Math.random()` directly — production code
 * can pass `{ next: Math.random }`, tests can pass {@link createSeededRng}.
 */
export interface RngSource {
  next(): number
}

/**
 * mulberry32 — a small, dependency-free, deterministic PRNG. Not
 * cryptographically strong; the only guarantee is "the same seed produces
 * the same sequence," which is exactly what reproducible tests need.
 */
export function createSeededRng(seed: number): RngSource {
  let state = seed >>> 0
  return {
    next() {
      state = (state + 0x6d2b79f5) >>> 0
      let t = state
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    },
  }
}
