// SCHEMA
import { featureDisplayTemplateOutput as output } from '../schema/displayTemplate'
// DRIZZLE
import { eq, sql } from 'drizzle-orm'
// DOMAIN
import { DisplayTemplateDefinitionSchema } from '#lib/templates/registry.js'
import { featureTemplateTitles } from '#lib/templates/featureValues.js'
import {
  resolveFeatureLocation,
  type EffectiveLocationFacts,
} from '#lib/locations/resolve.js'
// SERVICES
import { readLocationResetSources } from './locationReset'
import { prepareRevisionCheck } from './revisionBatch'
import {
  displayTemplateDependencyGuard,
  isDisplayTemplateAvailable,
} from './displayTemplateScope'
// TYPES
import type { Database } from '#lib/types.js'
import type { BatchItem } from 'drizzle-orm/batch'
import type { FeatureRevisionContent } from '#lib/revisions/featureContent.js'
import type { FeatureLocationOverrides } from '#lib/locations/model.js'

/** Prepare generated titles in the same transaction as an accepted Feature revision.
 * @param db Request database. @param input Feature identity and accepted before/after content.
 * @returns Atomic output replacement statements, or no work for legacy naming.
 * @remarks Reads only immutable accepted Location revisions. Registry versions are immutable;
 * owner ancestry is fenced before storing private template output on a Feature.
 */
export async function prepareFeatureDisplayTemplate(
  db: Database,
  input: {
    featureId: string
    previous: FeatureRevisionContent
    content: FeatureRevisionContent
    acceptedLocation?: EffectiveLocationFacts
    creationScope?: { organisationId: string; projectId: string }
  },
): Promise<BatchItem<'sqlite'>[]> {
  const reference = input.content.profile.nameTemplate?.rule.registry
  if (!reference && !input.previous.profile.nameTemplate?.rule.registry) return []
  if (!reference)
    return [db.delete(output).where(eq(output.featureId, input.featureId))]
  const row = await db.get<{
    definition: string
    projectId: string
    organisationId: string
  }>(
    input.creationScope
      ? sql`SELECT r.definition,p.id projectId,p.organisationId FROM project p
      JOIN displayTemplate t ON t.id=${reference.id}
      JOIN displayTemplateRevision r ON r.templateId=t.id AND r.version=${reference.version}
      WHERE p.id=${input.creationScope.projectId} AND p.organisationId=${input.creationScope.organisationId}
        AND (t.organisationId IS NULL OR t.organisationId=p.organisationId)`
      : sql`SELECT r.definition,f.projectId,f.organisationId FROM feature f
      JOIN displayTemplate t ON t.id=${reference.id}
      JOIN displayTemplateRevision r ON r.templateId=t.id AND r.version=${reference.version}
      WHERE f.id=${input.featureId} AND (t.organisationId IS NULL OR t.organisationId=f.organisationId)`,
  )
  if (!row) throw new Error('TEMPLATE_UNAVAILABLE_FOR_FEATURE')
  const definition = DisplayTemplateDefinitionSchema.parse(JSON.parse(row.definition))
  if (
    definition.target !== 'feature' ||
    !(await isDisplayTemplateAvailable(db, definition, row))
  )
    throw new Error('TEMPLATE_PROPERTIES_UNAVAILABLE')
  const association = input.content.placement.location
  const sources =
    association && !input.acceptedLocation
      ? await readLocationResetSources(db, { ...association, projectId: row.projectId })
      : undefined
  if (association && !sources && !input.acceptedLocation)
    throw new Error('ACCEPTED_TEMPLATE_LOCATION_UNAVAILABLE')
  const location =
    input.acceptedLocation ??
    (sources && association
      ? resolveFeatureLocation(
          sources.facts,
          sources.locationFacts.location,
          association.acceptedOverrides as FeatureLocationOverrides,
        )
      : undefined)
  const titles = featureTemplateTitles(input.content, definition, location)
  // Scope and output writes are enclosed by the caller's accepted-revision concurrency fence.
  return [
    prepareRevisionCheck(db, displayTemplateDependencyGuard(definition, row)),
    prepareRevisionCheck(
      db,
      sql`EXISTS(SELECT 1 FROM feature WHERE id=${input.featureId} AND organisationId=${row.organisationId} AND projectId=${row.projectId})`,
    ),
    db.delete(output).where(eq(output.featureId, input.featureId)),
    ...Object.entries(titles).map(([locale, title]) =>
      db.insert(output).values({
        featureId: input.featureId,
        locale,
        templateId: reference.id,
        templateVersion: reference.version,
        title,
      }),
    ),
  ]
}
