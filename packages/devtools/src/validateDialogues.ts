import { buildReport, checkRefTypes, error, warning } from './report'
import type {
  DialogueNodeLike,
  DialogueTreeLike,
  KnownTypeOptions,
  ValidationIssue,
  ValidationReport,
} from './types'

/**
 * Statically validate dialogue trees. Pure and non-throwing — all findings
 * come back as issues in the report.
 *
 * Errors:
 * - duplicate tree ids (duplicates are reported and skipped)
 * - duplicate node ids within a tree (the engine resolves the first match,
 *   so later duplicates are dead content)
 * - `startNodeId` referencing a missing node
 * - `node.next` / `response.next` referencing a missing node
 *
 * Warnings:
 * - nodes unreachable from `startNodeId` (BFS over `next` edges; `next` on an
 *   `endsDialogue` node is not an edge — see below)
 * - `responses: []` (the engine treats it as a linear node; omit it instead)
 * - `next` set on an `endsDialogue` node (`advance()` checks `endsDialogue`
 *   first, so that `next` is never followed)
 * - effect/condition `type` not in `options.effectTypes` /
 *   `options.conditionTypes` (each check only runs when its list is provided)
 *
 * Terminal-node semantics (verified against the dialogue engine): a node with
 * no `responses` and no `next` **is** a valid terminal node — `advance()`
 * ends the dialogue there and counts it as completed, exactly like
 * `endsDialogue: true`. Such nodes therefore produce no issue.
 */
export function validateDialogues(
  trees: DialogueTreeLike[],
  options: KnownTypeOptions = {}
): ValidationReport {
  const issues: ValidationIssue[] = []
  const seenTreeIds = new Set<string>()

  for (const tree of trees) {
    const source = `dialogue:${tree.id}`
    if (seenTreeIds.has(tree.id)) {
      issues.push(error(source, 'id', `duplicate dialogue tree id "${tree.id}"`))
      continue
    }
    seenTreeIds.add(tree.id)
    validateTree(tree, source, options, issues)
  }

  return buildReport(issues)
}

function validateTree(
  tree: DialogueTreeLike,
  source: string,
  options: KnownTypeOptions,
  issues: ValidationIssue[]
): void {
  // First occurrence wins, matching the engine's `nodes.find(...)` lookup.
  const nodesById = new Map<string, DialogueNodeLike>()
  for (const node of tree.nodes) {
    if (nodesById.has(node.id)) {
      issues.push(
        error(source, `nodes.${node.id}`, `duplicate node id "${node.id}" (first occurrence wins)`)
      )
      continue
    }
    nodesById.set(node.id, node)
  }

  if (!nodesById.has(tree.startNodeId)) {
    issues.push(error(source, 'startNodeId', `start node "${tree.startNodeId}" does not exist`))
  }

  for (const node of nodesById.values()) {
    const base = `nodes.${node.id}`

    if (node.next !== undefined && !nodesById.has(node.next)) {
      issues.push(error(source, `${base}.next`, `references missing node "${node.next}"`))
    }
    if (node.endsDialogue && node.next !== undefined) {
      issues.push(
        warning(
          source,
          `${base}.next`,
          '"next" is never followed because "endsDialogue" is set (advance() ends the dialogue first)'
        )
      )
    }
    if (node.responses !== undefined && node.responses.length === 0) {
      issues.push(
        warning(
          source,
          `${base}.responses`,
          'empty responses array; the engine treats this as a linear node — omit "responses" instead'
        )
      )
    }
    checkRefTypes(issues, node.effects, options.effectTypes, 'effect', source, `${base}.effects`)

    for (const response of node.responses ?? []) {
      const responseBase = `${base}.responses.${response.id}`
      if (response.next !== undefined && !nodesById.has(response.next)) {
        issues.push(
          error(source, `${responseBase}.next`, `references missing node "${response.next}"`)
        )
      }
      checkRefTypes(
        issues,
        response.conditions,
        options.conditionTypes,
        'condition',
        source,
        `${responseBase}.conditions`
      )
      checkRefTypes(
        issues,
        response.effects,
        options.effectTypes,
        'effect',
        source,
        `${responseBase}.effects`
      )
    }
  }

  // Reachability: BFS from startNodeId. Edges are `response.next` (always
  // followable via choose()) and `node.next` unless the node ends the
  // dialogue (advance() checks endsDialogue before next).
  if (nodesById.has(tree.startNodeId)) {
    const reachable = new Set<string>([tree.startNodeId])
    const queue = [tree.startNodeId]
    while (queue.length > 0) {
      const node = nodesById.get(queue.shift() as string)
      if (!node) continue
      const targets: string[] = []
      if (node.next !== undefined && !node.endsDialogue) targets.push(node.next)
      for (const response of node.responses ?? []) {
        if (response.next !== undefined) targets.push(response.next)
      }
      for (const target of targets) {
        if (nodesById.has(target) && !reachable.has(target)) {
          reachable.add(target)
          queue.push(target)
        }
      }
    }
    for (const id of nodesById.keys()) {
      if (!reachable.has(id)) {
        issues.push(warning(source, `nodes.${id}`, `node is unreachable from start node "${tree.startNodeId}"`))
      }
    }
  }
}
