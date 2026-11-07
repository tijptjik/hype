// DRIZZLE
import { eq, sql, type SQL } from 'drizzle-orm'
// SCHEMA
import { layer } from '../schema/layer'
import { project } from '../schema/project'
// DOMAIN
import { resolveFeaturePresentationPolicy } from '#lib/features/presentationPolicy.js'
// TYPES
import type { Database } from '#lib/types.js'

// TABLE OF CONTENTS
// 1. Persisted parent policy
// 2. Initial editor projection

/** Read authoring policy from persisted parents, never client-supplied flags.
 * @param db Request database. @param layerId Authorized Feature parent.
 * @returns Effective policy; missing parents retain legacy defaults.
 */
export async function readFeaturePresentationPolicy(db: Database, layerId: string): Promise<ReturnType<typeof resolveFeaturePresentationPolicy>> {
  const row = await db.select({ flags: project.flags, metadata: layer.metadata }).from(layer).innerJoin(project, eq(project.id, layer.projectId)).where(eq(layer.id, layerId)).get()
  return resolveFeaturePresentationPolicy(row?.flags, row?.metadata)
}

/** Project the two editor policy flags in the authorized single-Feature read.
 * @returns JSON policy snapshot from the current Layer and Project, without parent graphs.
 * @remarks Parent records own policy. This small read projection lets the first editable
 * frame obey policy while their independently cached cards and settings are still loading.
 */
export function featurePresentationPolicySQL(): SQL<string> {
  return sql<string>`(SELECT json_object(
    'allowDescriptions', coalesce(json_extract(l.metadata, '$.allowFeatureDescriptions'), json_extract(p.flags, '$.allowFeatureDescriptions'), 1),
    'locationBasedNames', coalesce(json_extract(l.metadata, '$.locationBasedFeatureNames'), json_extract(p.flags, '$.locationBasedFeatureNames'), 0))
    FROM layer l JOIN project p ON p.id=l.projectId WHERE l.id="feature"."layerId")`
}
