import { buildReport, error } from './report'
import type { ValidationIssue, ValidationReport } from './types'
import { validateScene, type SceneValidationOptions } from './validateScene'

/** Options for {@link validateSceneProject}. */
export interface SceneProjectValidationOptions extends SceneValidationOptions {
  /**
   * Inherited from {@link SceneValidationOptions}: known GLTF/GLB model URLs,
   * applied to **every** scene in the project. See `validateScene`.
   */
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Re-attribute an inner {@link validateScene} issue to the owning scene: the
 * issue's `source` becomes the scene id, and the original per-entity source
 * (e.g. `npc:guide`) is folded into the `path` so no locality is lost.
 */
function reSource(issue: ValidationIssue, sceneId: string): ValidationIssue {
  const inner = issue.source && issue.source !== 'scene' ? issue.source : ''
  const path = [inner, issue.path].filter((part) => part !== '').join(' ')
  return { severity: issue.severity, source: sceneId, path, message: issue.message }
}

/**
 * Statically validate a `SceneProjectJson` document (the editor's
 * `exportProject()` output). Pure and non-throwing — all findings come back as
 * issues in the report. Each scene's inner `scene` document is validated with
 * {@link validateScene}, and those issues are aggregated with `source` set to
 * the owning scene id.
 *
 * Errors:
 * - the root is not an object, or `scenes` is not an array
 * - an empty project (`scenes: []` — nothing to author)
 * - a scene entry that is not an object, or missing a string `id` / `name`
 * - duplicate scene ids **and** duplicate scene names
 * - a scene entry missing its `scene` document
 * - `activeSceneId` present but not a string, or not matching any scene id
 * - every error `validateScene` reports for a scene's inner document
 *   (re-sourced to the scene id)
 *
 * Warnings:
 * - every warning `validateScene` reports for a scene's inner document
 *   (e.g. an empty scene, an unknown model path when `knownModelPaths` is set)
 */
export function validateSceneProject(
  json: unknown,
  options: SceneProjectValidationOptions = {}
): ValidationReport {
  const issues: ValidationIssue[] = []

  if (!isRecord(json)) {
    issues.push(error('scene-project', '', 'scene project JSON must be an object with a "scenes" array'))
    return buildReport(issues)
  }
  if (!Array.isArray(json.scenes)) {
    issues.push(error('scene-project', 'scenes', 'scene project is missing a required "scenes" array'))
    return buildReport(issues)
  }
  if (json.scenes.length === 0) {
    issues.push(error('scene-project', 'scenes', 'scene project has no scenes — at least one scene is required'))
  }

  const seenIds = new Set<string>()
  const seenNames = new Set<string>()
  const validIds = new Set<string>()

  json.scenes.forEach((raw, index) => {
    const hasId = isRecord(raw) && typeof raw.id === 'string' && raw.id !== ''
    const source = hasId ? `scene:${(raw as Record<string, unknown>).id as string}` : `scene[${index}]`

    if (!isRecord(raw)) {
      issues.push(error(source, `scenes[${index}]`, 'scene entry must be an object with { id, name, scene }'))
      return
    }

    // --- id (required, unique) ---
    if (typeof raw.id !== 'string' || raw.id === '') {
      issues.push(error(source, 'id', 'scene entry is missing a required string "id"'))
    } else if (seenIds.has(raw.id)) {
      issues.push(error(source, 'id', `duplicate scene id "${raw.id}"`))
    } else {
      seenIds.add(raw.id)
      validIds.add(raw.id)
    }

    // --- name (required, unique) ---
    if (typeof raw.name !== 'string' || raw.name === '') {
      issues.push(error(source, 'name', 'scene entry is missing a required string "name"'))
    } else if (seenNames.has(raw.name)) {
      issues.push(error(source, 'name', `duplicate scene name "${raw.name}"`))
    } else {
      seenNames.add(raw.name)
    }

    // --- inner scene document ---
    const sceneId = hasId ? (raw.id as string) : `scene[${index}]`
    if (raw.scene === undefined) {
      issues.push(error(source, 'scene', 'scene entry is missing a required "scene" document'))
    } else {
      for (const inner of validateScene(raw.scene, options).issues) {
        issues.push(reSource(inner, sceneId))
      }
    }
  })

  // --- activeSceneId (optional, must resolve) ---
  if (json.activeSceneId !== undefined) {
    if (typeof json.activeSceneId !== 'string') {
      issues.push(error('scene-project', 'activeSceneId', 'activeSceneId must be a string'))
    } else if (!validIds.has(json.activeSceneId)) {
      issues.push(
        error('scene-project', 'activeSceneId', `activeSceneId "${json.activeSceneId}" does not match any scene id`)
      )
    }
  }

  return buildReport(issues)
}
