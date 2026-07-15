/**
 * Registries decouple data-driven content from code. Dialogue responses,
 * quest rewards, item use handlers etc. reference behaviors declaratively
 * (`{ type: 'wallet.addGold', params: { amount: 100 } }`); the game registers
 * the matching handler at startup. Framework engines never import game code.
 */

/** Declarative reference to a registered effect handler. */
export interface EffectRef {
  type: string
  params?: Record<string, unknown>
}

/** Declarative reference to a registered condition handler. */
export interface ConditionRef {
  type: string
  params?: Record<string, unknown>
  /** Invert the result of the condition. */
  negate?: boolean
}

export type EffectFn<Ctx = unknown> = (params: Record<string, unknown>, ctx: Ctx) => void
export type ConditionFn<Ctx = unknown> = (params: Record<string, unknown>, ctx: Ctx) => boolean

export class Registry<Fn> {
  private items = new Map<string, Fn>()

  constructor(private readonly label: string) {}

  register(type: string, fn: Fn, options?: { override?: boolean }): this {
    if (this.items.has(type) && !options?.override) {
      console.warn(
        `[overworld] ${this.label} "${type}" is already registered; pass { override: true } to replace it`
      )
      return this
    }
    this.items.set(type, fn)
    return this
  }

  registerAll(entries: Record<string, Fn>, options?: { override?: boolean }): this {
    for (const [type, fn] of Object.entries(entries)) {
      this.register(type, fn, options)
    }
    return this
  }

  get(type: string): Fn | undefined {
    return this.items.get(type)
  }

  has(type: string): boolean {
    return this.items.has(type)
  }

  unregister(type: string): void {
    this.items.delete(type)
  }

  types(): string[] {
    return [...this.items.keys()]
  }
}

export type EffectRegistry<Ctx = unknown> = Registry<EffectFn<Ctx>>
export type ConditionRegistry<Ctx = unknown> = Registry<ConditionFn<Ctx>>

export function createEffectRegistry<Ctx = unknown>(): EffectRegistry<Ctx> {
  return new Registry<EffectFn<Ctx>>('effect')
}

export function createConditionRegistry<Ctx = unknown>(): ConditionRegistry<Ctx> {
  return new Registry<ConditionFn<Ctx>>('condition')
}

/**
 * Run each effect in order. Unregistered types log a warning and are
 * skipped — content referencing a missing handler must not crash the game.
 */
export function runEffects<Ctx>(
  registry: EffectRegistry<Ctx>,
  refs: EffectRef[] | undefined,
  ctx: Ctx
): void {
  if (!refs) return
  for (const ref of refs) {
    const fn = registry.get(ref.type)
    if (!fn) {
      console.warn(`[overworld] no effect registered for "${ref.type}"`)
      continue
    }
    try {
      fn(ref.params ?? {}, ctx)
    } catch (error) {
      console.error(`[overworld] effect "${ref.type}" threw`, error)
    }
  }
}

/**
 * AND-evaluate conditions. An empty/undefined list is true. An unregistered
 * condition type logs a warning and evaluates to false (fail closed).
 */
export function evaluateConditions<Ctx>(
  registry: ConditionRegistry<Ctx>,
  refs: ConditionRef[] | undefined,
  ctx: Ctx
): boolean {
  if (!refs || refs.length === 0) return true
  for (const ref of refs) {
    const fn = registry.get(ref.type)
    if (!fn) {
      console.warn(`[overworld] no condition registered for "${ref.type}"`)
      return false
    }
    let result: boolean
    try {
      result = fn(ref.params ?? {}, ctx)
    } catch (error) {
      console.error(`[overworld] condition "${ref.type}" threw`, error)
      result = false
    }
    if (ref.negate) result = !result
    if (!result) return false
  }
  return true
}
