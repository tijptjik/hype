// DRIZZLE
import { and, eq } from 'drizzle-orm'
// SCHEMA
import { layer } from '../schema/layer'
import { project } from '../schema/project'
// DOMAIN
import {
  DEFAULT_PROJECT_LOCATION_POLICY,
  ProjectLocationPolicySchema,
  RelocationPolicySchema,
  resolveRelocationPolicy,
} from '#lib/locations/model.js'
// TYPES
import type { Database } from '#lib/types.js'
import type { RelocationPolicy } from '#lib/locations/model.js'

export type LayerRelocationSettings = {
  projectId: string
  organisationId: string
  policy: RelocationPolicy | null
  revision: number
  projectPolicy: RelocationPolicy
  projectRevision: number
  effectivePolicy: RelocationPolicy
}

/**
 * Read a Layer override with its persisted Project ancestry and effective default.
 * @param db Request-local database.
 * @param layerId Layer already authorized for settings management.
 * @returns Settings, or null when the Layer or its parent does not exist.
 * @remarks Caller authorization precedes this read; resolving settings never adopts a move.
 */
export async function getLayerRelocationSettings(
  db: Database,
  layerId: string,
): Promise<LayerRelocationSettings | null> {
  // Resolve both counters and ancestry from one joined read, without caller-supplied parents.
  const row = await db
    .select({
      projectId: layer.projectId,
      organisationId: layer.organisationId,
      policy: layer.relocationPolicy,
      revision: layer.relocationPolicyRevision,
      projectPolicy: project.locationPolicy,
      projectRevision: project.locationPolicyRevision,
    })
    .from(layer)
    .innerJoin(
      project,
      and(
        eq(project.id, layer.projectId),
        eq(project.organisationId, layer.organisationId),
      ),
    )
    .where(eq(layer.id, layerId))
    .get()
  if (!row) return null
  const policy = RelocationPolicySchema.nullable().parse(row.policy)
  const parent = ProjectLocationPolicySchema.parse(
    row.projectPolicy ?? DEFAULT_PROJECT_LOCATION_POLICY,
  )
  return {
    ...row,
    policy,
    projectPolicy: parent.relocation,
    effectivePolicy: resolveRelocationPolicy(parent, policy),
  }
}
