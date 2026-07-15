import { describe, expect, it, vi } from 'vitest'
import {
  createConditionRegistry,
  createEffectRegistry,
  evaluateConditions,
  runEffects,
} from '../registry'

describe('EffectRegistry', () => {
  it('runs effects in order with params and context', () => {
    const registry = createEffectRegistry<{ log: string[] }>()
    const ctx = { log: [] as string[] }
    registry.register('a', (params, c) => c.log.push(`a:${params.x}`))
    registry.register('b', (_params, c) => c.log.push('b'))
    runEffects(registry, [{ type: 'a', params: { x: 1 } }, { type: 'b' }], ctx)
    expect(ctx.log).toEqual(['a:1', 'b'])
  })

  it('skips unregistered effects with a warning', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const registry = createEffectRegistry()
    expect(() => runEffects(registry, [{ type: 'missing' }], undefined)).not.toThrow()
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('warns on duplicate registration unless override is set', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const registry = createEffectRegistry<string[]>()
    const first = vi.fn()
    const second = vi.fn()
    registry.register('dup', first)
    registry.register('dup', second)
    expect(registry.get('dup')).toBe(first)
    expect(spy).toHaveBeenCalled()
    registry.register('dup', second, { override: true })
    expect(registry.get('dup')).toBe(second)
    spy.mockRestore()
  })
})

describe('ConditionRegistry', () => {
  it('AND-evaluates, treating an empty list as true', () => {
    const registry = createConditionRegistry<{ gold: number }>()
    registry.register('hasGold', (params, ctx) => ctx.gold >= (params.amount as number))
    const ctx = { gold: 50 }
    expect(evaluateConditions(registry, undefined, ctx)).toBe(true)
    expect(evaluateConditions(registry, [], ctx)).toBe(true)
    expect(evaluateConditions(registry, [{ type: 'hasGold', params: { amount: 10 } }], ctx)).toBe(true)
    expect(evaluateConditions(registry, [{ type: 'hasGold', params: { amount: 100 } }], ctx)).toBe(false)
  })

  it('supports negate', () => {
    const registry = createConditionRegistry()
    registry.register('yes', () => true)
    expect(evaluateConditions(registry, [{ type: 'yes', negate: true }], undefined)).toBe(false)
  })

  it('fails closed on unregistered conditions', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const registry = createConditionRegistry()
    expect(evaluateConditions(registry, [{ type: 'missing' }], undefined)).toBe(false)
    spy.mockRestore()
  })
})
