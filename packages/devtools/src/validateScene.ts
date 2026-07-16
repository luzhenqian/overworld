import { buildReport, error, warning } from './report'
import type { ValidationIssue, ValidationReport } from './types'

/** Options for {@link validateScene}. */
export interface SceneValidationOptions {
  /**
   * Known GLTF/GLB model URLs. When provided, any NPC/building `modelPath`
   * outside this list produces a warning (opt-in, mirroring the effect/
   * condition type lists in `validateDialogues`). The empty string `''` — the
   * marker for the themed fallback primitive — is never flagged.
   */
  knownModelPaths?: string[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** A `[x, y, z]` number triple (`Vec3`). */
function isVec3(value: unknown): boolean {
  return Array.isArray(value) && value.length === 3 && value.every((n) => typeof n === 'number')
}

/** @internal Opt-in warning for a `modelPath` not in the known list. */
function checkModelPath(
  issues: ValidationIssue[],
  known: string[] | undefined,
  modelPath: unknown,
  source: string,
  path: string
): void {
  if (!known) return
  if (typeof modelPath !== 'string' || modelPath === '') return
  if (!known.includes(modelPath)) {
    issues.push(
      warning(source, path, `unknown model path "${modelPath}" (not in the provided known model list)`)
    )
  }
}

/**
 * Statically validate a `SceneJson` document (the editor's `exportScene()`
 * output / `<SceneFromJson>` input). Pure and non-throwing — all findings come
 * back as issues in the report.
 *
 * Errors:
 * - the root is not an object
 * - an NPC / building missing a required `id` / `modelPath` / `position`
 *   (the fields `<SceneShell>` needs to place and render it)
 * - duplicate NPC ids / duplicate building ids
 * - negative `scale` (NPC / building / decoration instance) or
 *   `collisionRadius` / decoration group `radius`
 * - a malformed decoration group (not an object, or missing `instances` /
 *   `radius`)
 *
 * Warnings:
 * - an empty scene (no NPCs and no buildings — nothing will render)
 * - an NPC / building `modelPath` outside `options.knownModelPaths` (only when
 *   that list is provided)
 */
export function validateScene(
  json: unknown,
  options: SceneValidationOptions = {}
): ValidationReport {
  const issues: ValidationIssue[] = []

  if (!isRecord(json)) {
    issues.push(error('scene', '', 'scene JSON must be an object with npcs/buildings/decorations'))
    return buildReport(issues)
  }

  const knownModels = options.knownModelPaths
  const npcs: unknown[] = Array.isArray(json.npcs) ? json.npcs : []
  const buildings: unknown[] = Array.isArray(json.buildings) ? json.buildings : []

  // --- NPCs ---
  const seenNpcIds = new Set<string>()
  npcs.forEach((raw, index) => {
    const source = isRecord(raw) && typeof raw.id === 'string' ? `npc:${raw.id}` : `npc[${index}]`
    if (!isRecord(raw)) {
      issues.push(error(source, `npcs[${index}]`, 'npc must be an object'))
      return
    }
    if (typeof raw.id !== 'string' || raw.id === '') {
      issues.push(error(source, 'id', 'npc is missing a required string "id"'))
    } else if (seenNpcIds.has(raw.id)) {
      issues.push(error(source, 'id', `duplicate npc id "${raw.id}"`))
    } else {
      seenNpcIds.add(raw.id)
    }
    if (typeof raw.modelPath !== 'string') {
      issues.push(
        error(source, 'modelPath', 'npc is missing a required string "modelPath" (use "" for the fallback capsule)')
      )
    }
    if (!isVec3(raw.position)) {
      issues.push(error(source, 'position', 'npc "position" must be a [x, y, z] number triple'))
    }
    if (typeof raw.scale === 'number' && raw.scale < 0) {
      issues.push(error(source, 'scale', `npc scale must be >= 0 (got ${raw.scale})`))
    }
    checkModelPath(issues, knownModels, raw.modelPath, source, 'modelPath')
  })

  // --- buildings ---
  const seenBuildingIds = new Set<string>()
  buildings.forEach((raw, index) => {
    const source =
      isRecord(raw) && typeof raw.id === 'string' ? `building:${raw.id}` : `building[${index}]`
    if (!isRecord(raw)) {
      issues.push(error(source, `buildings[${index}]`, 'building must be an object'))
      return
    }
    if (typeof raw.id !== 'string' || raw.id === '') {
      issues.push(error(source, 'id', 'building is missing a required string "id"'))
    } else if (seenBuildingIds.has(raw.id)) {
      issues.push(error(source, 'id', `duplicate building id "${raw.id}"`))
    } else {
      seenBuildingIds.add(raw.id)
    }
    if (typeof raw.modelPath !== 'string') {
      issues.push(
        error(source, 'modelPath', 'building is missing a required string "modelPath" (use "" for the fallback box)')
      )
    }
    if (!isVec3(raw.position)) {
      issues.push(error(source, 'position', 'building "position" must be a [x, y, z] number triple'))
    }
    if (typeof raw.scale === 'number' && raw.scale < 0) {
      issues.push(error(source, 'scale', `building scale must be >= 0 (got ${raw.scale})`))
    }
    if (typeof raw.collisionRadius === 'number' && raw.collisionRadius < 0) {
      issues.push(
        error(source, 'collisionRadius', `building collisionRadius must be >= 0 (got ${raw.collisionRadius})`)
      )
    }
    checkModelPath(issues, knownModels, raw.modelPath, source, 'modelPath')
  })

  // --- decorations ---
  if (json.decorations !== undefined) {
    if (!isRecord(json.decorations)) {
      issues.push(error('scene', 'decorations', 'decorations must be an object keyed by group name'))
    } else {
      for (const [name, rawGroup] of Object.entries(json.decorations)) {
        const source = `decoration:${name}`
        if (!isRecord(rawGroup)) {
          issues.push(
            error(source, `decorations.${name}`, 'decoration group must be an object with { instances, radius }')
          )
          continue
        }
        if (!Array.isArray(rawGroup.instances)) {
          issues.push(error(source, 'instances', 'decoration group is missing a required "instances" array'))
        }
        if (typeof rawGroup.radius !== 'number') {
          issues.push(error(source, 'radius', 'decoration group is missing a required numeric "radius"'))
        } else if (rawGroup.radius < 0) {
          issues.push(error(source, 'radius', `decoration group radius must be >= 0 (got ${rawGroup.radius})`))
        }
        if (Array.isArray(rawGroup.instances)) {
          rawGroup.instances.forEach((inst, i) => {
            if (isRecord(inst) && typeof inst.scale === 'number' && inst.scale < 0) {
              issues.push(
                error(source, `instances[${i}].scale`, `decoration instance scale must be >= 0 (got ${inst.scale})`)
              )
            }
          })
        }
      }
    }
  }

  // --- warnings ---
  if (npcs.length === 0 && buildings.length === 0) {
    issues.push(warning('scene', '', 'scene has no npcs and no buildings — nothing will render'))
  }

  return buildReport(issues)
}
