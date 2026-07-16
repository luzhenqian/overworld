import { buildReport, checkRefTypes, error, warning } from './report'
import type { ItemLike, KnownTypeOptions, ValidationIssue, ValidationReport } from './types'

/**
 * Statically validate item definitions. Pure and non-throwing.
 *
 * Errors:
 * - duplicate item ids
 *
 * Warnings:
 * - `useEffects` types outside `options.effectTypes` (when provided)
 * - `maxStack < 1` (such an item can never be added to the inventory)
 */
export function validateItems(items: ItemLike[], options: KnownTypeOptions = {}): ValidationReport {
  const issues: ValidationIssue[] = []
  const seen = new Set<string>()

  for (const item of items) {
    const source = `item:${item.id}`
    if (seen.has(item.id)) {
      issues.push(error(source, 'id', `duplicate item id "${item.id}"`))
      continue
    }
    seen.add(item.id)

    if (item.maxStack !== undefined && item.maxStack < 1) {
      issues.push(
        warning(source, 'maxStack', `maxStack must be >= 1 (got ${item.maxStack}); the item can never be added`)
      )
    }
    checkRefTypes(issues, item.useEffects, options.effectTypes, 'effect', source, 'useEffects')
  }

  return buildReport(issues)
}
