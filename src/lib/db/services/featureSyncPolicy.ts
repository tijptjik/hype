// DRIZZLE
import { and, eq } from 'drizzle-orm'
// SCHEMA
import { feature } from '../schema/feature'
import { project } from '../schema/project'
import { organisation } from '../schema/organisation'
import { layer } from '../schema/layer'
// DOMAIN
import {
  DEFAULT_PROJECT_LOCATION_POLICY,
  ProjectLocationPolicySchema,
} from '#lib/locations/model.js'
// TYPES
import type { Database } from '#lib/types.js'
import type { ProjectLocationPolicy, RelocationPolicy } from '#lib/locations/model.js'

export type FeatureSyncPolicy = {
  policy: ProjectLocationPolicy
  source: 'project' | 'organisation' | 'default'
  sourceId: string | null
  layerRelocation: RelocationPolicy | null
}

/** Read the adoption policy inherited by an already authorized Feature.
 * @param db Request-local database.
 * @param featureId Authorized Feature identity.
 * @param projectId Project from the authorization probe.
 * @returns Effective update rules and their origin, or null for a missing Feature.
 * @remarks Layer relocation settings are reported separately: the current placement
 * processor uses the source-specific Project/Organisation relocation rule.
 */
export async function getFeatureSyncPolicy(
  db: Database,
  featureId: string,
  projectId: string,
): Promise<FeatureSyncPolicy | null> {
  // Resolve inheritance through persisted ancestry, never client-supplied parent IDs.
  const row = await db
    .select({
      projectPolicy: project.locationPolicy,
      organisationSettings: organisation.settings,
      organisationId: organisation.id,
      layerRelocation: layer.relocationPolicy,
    })
    .from(feature)
    .innerJoin(project, eq(project.id, feature.projectId))
    .innerJoin(organisation, eq(organisation.id, project.organisationId))
    .innerJoin(
      layer,
      and(eq(layer.id, feature.layerId), eq(layer.projectId, project.id)),
    )
    .where(and(eq(feature.id, featureId), eq(project.id, projectId)))
    .get()
  if (!row) return null
  const inherited = row.organisationSettings?.locationPolicy
  return {
    policy: ProjectLocationPolicySchema.parse(
      row.projectPolicy ?? inherited ?? DEFAULT_PROJECT_LOCATION_POLICY,
    ),
    source: row.projectPolicy ? 'project' : inherited ? 'organisation' : 'default',
    sourceId: row.projectPolicy ? projectId : inherited ? row.organisationId : null,
    layerRelocation: row.layerRelocation,
  }
}
