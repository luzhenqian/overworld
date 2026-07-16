import type { RefLike, ValidationIssue, ValidationReport } from './types'

/** @internal Create an error issue. */
export function error(source: string, path: string, message: string): ValidationIssue {
  return { severity: 'error', source, path, message }
}

/** @internal Create a warning issue. */
export function warning(source: string, path: string, message: string): ValidationIssue {
  return { severity: 'warning', source, path, message }
}

/** @internal Aggregate a flat issue list into a {@link ValidationReport}. */
export function buildReport(issues: ValidationIssue[]): ValidationReport {
  const errors = issues.filter((issue) => issue.severity === 'error')
  const warnings = issues.filter((issue) => issue.severity === 'warning')
  return { issues, errors, warnings, ok: errors.length === 0 }
}

/**
 * @internal Warn for each ref whose `type` is not in the known-type list.
 * No-op when `known` is not provided (checks are opt-in).
 */
export function checkRefTypes(
  issues: ValidationIssue[],
  refs: RefLike[] | undefined,
  known: string[] | undefined,
  kind: 'effect' | 'condition',
  source: string,
  basePath: string
): void {
  if (!known || !refs) return
  refs.forEach((ref, index) => {
    if (!known.includes(ref.type)) {
      issues.push(
        warning(
          source,
          `${basePath}[${index}].type`,
          `unknown ${kind} type "${ref.type}" (not in the provided ${kind} type list)`
        )
      )
    }
  })
}

/**
 * Format a report as a human-readable multi-line string for the console.
 *
 * ```
 * [overworld] content validation: 1 error(s), 2 warning(s)
 *   error dialogue:guide-intro nodes.hello.next — references missing node "gone"
 *   warn  quest:welcome rewards[0].type — unknown effect type "gold.add" ...
 * ```
 */
export function formatReport(report: ValidationReport): string {
  if (report.issues.length === 0) {
    return '[overworld] content validation passed (0 issues)'
  }
  const lines = [
    `[overworld] content validation: ${report.errors.length} error(s), ${report.warnings.length} warning(s)`,
  ]
  for (const issue of report.issues) {
    const tag = issue.severity === 'error' ? 'error' : 'warn '
    lines.push(`  ${tag} ${issue.source} ${issue.path} — ${issue.message}`)
  }
  return lines.join('\n')
}
