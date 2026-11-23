// DRIZZLE
import { and, eq } from 'drizzle-orm'
// SCHEMA
import { feature } from '../schema/feature'
import { project, projectI18n } from '../schema/project'
import { organisation, organisationI18n } from '../schema/organisation'
import { layer, layerI18n } from '../schema/layer'
// DOMAIN
import {
  DEFAULT_PROJECT_LOCATION_POLICY,
  ProjectLocationPolicySchema,
} from '#lib/locations/model.js'
// TYPES
import type { Database } from '#lib/types.js'
import type { ProjectLocationPolicy, RelocationPolicy } from '#lib/locations/model.js'

export type PolicyDefinition = {
  kind: 'project' | 'organisation' | 'layer'
  id: string
  i18n: Record<string, { name: string; nameGen: boolean; isAutomaticOnly: boolean }>
}

export type FeatureSyncPolicy = {
  policy: ProjectLocationPolicy
  source: 'project' | 'organisation' | 'default'
  sourceId: string | null
  layerRelocation: RelocationPolicy | null
  definition: PolicyDefinition | null
  layerDefinition: PolicyDefinition
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
      layerId: layer.id,
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
  const source = row.projectPolicy ? 'project' : inherited ? 'organisation' : 'default'
  // Read only names for the authorized Feature's persisted policy ancestors.
  const [sourceNames, layerNames] = await Promise.all([
    source === 'project'
      ? db
          .select({
            locale: projectI18n.locale,
            name: projectI18n.name,
            nameGen: projectI18n.nameGen,
            isAutomaticOnly: projectI18n.isAutomaticOnly,
          })
          .from(projectI18n)
          .where(eq(projectI18n.projectId, projectId))
          .all()
      : source === 'organisation'
        ? db
            .select({
              locale: organisationI18n.locale,
              name: organisationI18n.name,
              nameGen: organisationI18n.nameGen,
              isAutomaticOnly: organisationI18n.isAutomaticOnly,
            })
            .from(organisationI18n)
            .where(eq(organisationI18n.organisationId, row.organisationId))
            .all()
        : Promise.resolve([]),
    db
      .select({
        locale: layerI18n.locale,
        name: layerI18n.name,
        nameGen: layerI18n.nameGen,
        isAutomaticOnly: layerI18n.isAutomaticOnly,
      })
      .from(layerI18n)
      .where(eq(layerI18n.layerId, row.layerId))
      .all(),
  ])
  return {
    policy: ProjectLocationPolicySchema.parse(
      row.projectPolicy ?? inherited ?? DEFAULT_PROJECT_LOCATION_POLICY,
    ),
    source,
    definition:
      source === 'default'
        ? null
        : {
            kind: source,
            id: source === 'project' ? projectId : row.organisationId,
            i18n: Object.fromEntries(
              sourceNames.map(({ locale, ...name }) => [locale, name]),
            ),
          },
    layerDefinition: {
      kind: 'layer',
      id: row.layerId,
      i18n: Object.fromEntries(layerNames.map(({ locale, ...name }) => [locale, name])),
    },
    sourceId: row.projectPolicy ? projectId : inherited ? row.organisationId : null,
    layerRelocation: row.layerRelocation,
  }
}
