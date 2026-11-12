// DRIZZLE
import { sql, type SQL } from 'drizzle-orm'
// DOMAIN
import { parseDisplayTemplate } from '#lib/templates/displayTemplate.js'
// TYPES
import type { DisplayTemplateDefinition } from '#lib/templates/registry.js'
import type { Database } from '#lib/types.js'

// TABLE OF CONTENTS
// 1. Dependency extraction
// 2. Consumer scope predicates and validation

/** A consumer context, resolved from persisted ownership before use. */
export type DisplayTemplateContext = {
  organisationId: string | null
  projectId?: string | null
  hubId?: string | null
}

/** Collect prerequisites across every language, including fallback branches.
 * @param definition Validated expression set. @returns Unique property identities.
 */
export function displayTemplateDependencies(
  definition: DisplayTemplateDefinition,
): string[] {
  return [
    ...new Set(
      Object.values(definition.locales).flatMap(source =>
        parseDisplayTemplate(source)
          .dependencies.filter(path => path.startsWith('properties.'))
          .map(path => path.slice(11)),
      ),
    ),
  ]
}

/** Build a transaction-safe prerequisite check matching inherited property catalogues.
 * @param definition Validated template. @param context Persisted consumer scope.
 * @returns Predicate rejecting missing, foreign-project or unavailable properties.
 * @remarks Project-owned fields always constrain use to their project, even when catalogued elsewhere.
 */
export function displayTemplateDependencyGuard(
  definition: DisplayTemplateDefinition,
  context: DisplayTemplateContext,
): SQL {
  const ids = displayTemplateDependencies(definition)
  return ids.length
    ? displayTemplatePropertyGuard(sql`${JSON.stringify(ids)}`, context)
    : sql`1`
}

/** Check a JSON dependency array, including a correlated catalogue row.
 * @param dependencies Bound JSON or a trusted SQL expression. @param context Consumer scope.
 * @returns Constant-size property prerequisite predicate.
 */
export function displayTemplatePropertyGuard(
  dependencies: SQL,
  context: DisplayTemplateContext,
): SQL {
  const project = context.projectId ?? null
  const owner = context.organisationId
  const hub = context.hubId ?? null
  // JSON expansion keeps the parameter count constant for all dependency counts.
  return sql`NOT EXISTS (
    SELECT 1 FROM json_each(${dependencies}) dependency
    WHERE NOT EXISTS (
      SELECT 1 FROM property p WHERE p.id=dependency.value
      AND (
        (p.scope='project' AND p.projectId=${project}) OR
        (p.scope!='project' AND (
          (p.scope='organisation' AND p.organisationId=${owner}) OR
          (p.scope='hub' AND (p.hubId=${hub} OR p.hubId IN (SELECT id FROM hub WHERE code='core') OR p.hubId IN (SELECT hubId FROM organisation WHERE id=${owner}))) OR
          p.id IN (SELECT propertyId FROM organisationProperty WHERE organisationId=${owner}) OR
          p.id IN (SELECT propertyId FROM hubProperty WHERE hubId=${hub} OR hubId IN (SELECT id FROM hub WHERE code='core') OR hubId IN (SELECT hubId FROM organisation WHERE id=${owner}))
        ))
      )
    )
  )`
}

/** Check prerequisites before displaying or accepting a definition.
 * @param db Request database. @param definition Template. @param context Consumer context.
 * @returns Whether every referenced property belongs to the available catalogue.
 */
export async function isDisplayTemplateAvailable(
  db: Database,
  definition: DisplayTemplateDefinition,
  context: DisplayTemplateContext,
): Promise<boolean> {
  const guard = displayTemplateDependencyGuard(definition, context)
  if (!displayTemplateDependencies(definition).length) return true
  return Boolean((await db.get<{ ok: number }>(sql`SELECT ${guard} ok`))?.ok)
}
