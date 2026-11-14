// DRIZZLE
import { sql } from 'drizzle-orm'
// DOMAIN
import { FeatureRevisionContentSchema } from '#lib/revisions/featureContent.js'
import { featureTemplateValues } from '#lib/templates/featureValues.js'
import { resolveFeatureLocation } from '#lib/locations/resolve.js'
// SERVICES
import { readLocationResetSources } from './locationReset'
// TYPES
import type { Database } from '#lib/types.js'
import type { FeatureIntentScope } from './featureIntentPolicy'
import type { FeatureLocationOverrides } from '#lib/locations/model.js'
import type { TemplateScalar } from '#lib/templates/displayTemplate.js'

export type FeatureNamingExample = {
  id: string
  title: string
  values: Record<string, TemplateScalar>
  missing: string[]
}

/** Select complete and incomplete examples from real accepted records in an authorized scope.
 * @param db Request database. @param input Authorized owner, selected inputs and language.
 * @returns Up to two distinct records; values from different records are never combined.
 * @remarks The scan is bounded to 64 active records. Missing values remain missing, including absent translations.
 */
export async function readFeatureNamingExamples(
  db: Database,
  input: {
    scope: FeatureIntentScope
    paths: string[]
    locale: string
    featureType?: string
  },
): Promise<FeatureNamingExample[]> {
  const { scope } = input
  const predicate =
    scope.type === 'layer'
      ? sql`f.layerId=${scope.id}`
      : scope.type === 'project'
        ? sql`f.projectId=${scope.id}`
        : scope.type === 'organisation'
          ? sql`f.organisationId=${scope.id}`
          : sql`coalesce(o.hubId,(SELECT id FROM hub WHERE code='core'))=${scope.id}`
  // A single JSON parameter bounds SQL bindings regardless of the number of selected properties.
  const rows = await db.all<{
    id: string
    projectId: string
    content: string
    title: string | null
  }>(sql`
    SELECT f.id,f.projectId,r.content,
      (SELECT title FROM featureI18n WHERE featureId=f.id AND lower(replace(locale,'-',''))=lower(replace(${input.locale},'-','')) LIMIT 1) title
    FROM feature f JOIN organisation o ON o.id=f.organisationId
    JOIN featureRevision r ON r.id=f.currentRevisionId AND r.featureId=f.id
    WHERE ${predicate} AND f.isArchived=0 AND (${input.featureType ?? null} IS NULL OR f.featureType=${input.featureType ?? null} OR f.featureType IS NULL)
      AND NOT EXISTS(SELECT 1 FROM featureIdentityOperationMember i WHERE i.featureId=f.id AND i.role='input' AND NOT EXISTS(SELECT 1 FROM featureIdentityOperationMember m WHERE m.operationId=i.operationId AND m.featureId=f.id AND m.role='output'))
    ORDER BY (SELECT count(*) FROM json_each(r.content,'$.properties') p JOIN json_each(${JSON.stringify(input.paths)}) requested ON requested.value='properties.'||p.key) DESC,f.id
    LIMIT 64
  `)
  const needsLocation = input.paths.some(
    path =>
      !path.startsWith('properties.') &&
      !['feature.name', 'address', 'accessHint'].includes(path),
  )
  const examples: FeatureNamingExample[] = []
  for (const row of rows) {
    const parsed = FeatureRevisionContentSchema.safeParse(JSON.parse(row.content))
    if (!parsed.success) continue
    const content = parsed.data
    if (
      input.featureType &&
      content.profile.featureType &&
      content.profile.featureType !== input.featureType
    )
      continue
    const association = content.placement.location
    // Preview the same accepted Location facts used when generating the saved Feature name.
    const sources =
      association && needsLocation
        ? await readLocationResetSources(db, {
            ...association,
            projectId: row.projectId,
          })
        : null
    if (association && needsLocation && !sources) continue
    const location =
      sources && association
        ? resolveFeatureLocation(
            sources.facts,
            sources.locationFacts.location,
            association.acceptedOverrides as FeatureLocationOverrides,
          )
        : undefined
    const allValues = featureTemplateValues(content, input.locale, location)
    const values = Object.fromEntries(
      input.paths.map(path => [
        path,
        Object.hasOwn(allValues, path) ? (allValues[path] ?? null) : null,
      ]),
    )
    const missing = input.paths.filter(
      path =>
        values[path] == null ||
        (typeof values[path] === 'string' && !values[path].trim()),
    )
    examples.push({
      id: row.id,
      title: row.title || 'Untitled feature',
      values,
      missing,
    })
  }
  // Prefer the most complete record, then a genuinely incomplete record to explain missing-value behavior.
  examples.sort(
    (a, b) => a.missing.length - b.missing.length || a.id.localeCompare(b.id),
  )
  const first = examples[0]
  if (!first) return []
  const incomplete = [...examples]
    .reverse()
    .find(example => example.id !== first.id && example.missing.length > 0)
  return incomplete ? [first, incomplete] : [first]
}
