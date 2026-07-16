import {
  createConditionRegistry,
  createEffectRegistry,
  evaluateConditions,
  runEffects,
} from '@overworld/core'
import { bench } from '../lib.mjs'

export function run() {
  const results = []
  const ctx = { gold: 0, level: 5 }

  // Effect registry: 20 registered handlers, run a 5-effect reward list.
  {
    const effects = createEffectRegistry()
    for (let i = 0; i < 20; i++) {
      effects.register(`effect.${i}`, (params, c) => {
        c.gold += typeof params.amount === 'number' ? params.amount : 1
      })
    }
    const refs = [0, 4, 9, 14, 19].map((i) => ({ type: `effect.${i}`, params: { amount: 1 } }))
    results.push(
      bench('runEffects, 5 refs of 20 registered', () => runEffects(effects, refs, ctx), {
        iterations: 1000,
        meta: { registered: 20, refs: 5 },
      })
    )
  }

  // Condition registry: AND-evaluate a 5-condition prerequisite list.
  {
    const conditions = createConditionRegistry()
    for (let i = 0; i < 20; i++) {
      conditions.register(`cond.${i}`, (params, c) => c.level >= (params.min ?? 0))
    }
    const refs = [1, 5, 10, 15, 19].map((i) => ({ type: `cond.${i}`, params: { min: 1 } }))
    results.push(
      bench('evaluateConditions, 5 refs (all pass)', () => evaluateConditions(conditions, refs, ctx), {
        iterations: 1000,
        meta: { registered: 20, refs: 5 },
      })
    )
    const negated = refs.map((r) => ({ ...r, negate: true }))
    results.push(
      bench('evaluateConditions, first ref fails', () => evaluateConditions(conditions, negated, ctx), {
        iterations: 1000,
        meta: { shortCircuit: true },
      })
    )
  }

  return { name: 'registry', results }
}
