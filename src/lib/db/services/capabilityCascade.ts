// DRIZZLE
import { and, eq, inArray, sql } from 'drizzle-orm'
// CAPABILITIES
import { CAPABILITY_KEYS, getCapabilityKeysFromDefinitions } from '#lib/capabilities.js'
// DB
import { project, projectRole } from '#lib/db/schema/index.js'
// TYPES
import type { SQL } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import type { CapabilityDefinitions } from '#lib/capabilities.types.js'
import type { Database, Id } from '#lib/types.js'

/**
 * Prepares capability restriction writes using current SQL values, never stale JS snapshots.
 * @param db Request database.
 * @param organisationId Authorised organisation whose descendants are constrained.
 * @param definitions Next organisation capability definitions; absent definitions allow none.
 * @param guard Optional parent revision guard evaluated before each write.
 * @returns Project then role statements for the caller's atomic batch.
 * @remarks Only existing JSON booleans can survive. Expanding definitions never grants
 * a capability, and unchanged rows retain their modification timestamps.
 */
export function buildOrganisationCapabilityCascade(
  db: Database,
  organisationId: Id,
  definitions: CapabilityDefinitions | null | undefined,
  guard?: SQL,
): [BatchItem<'sqlite'>, BatchItem<'sqlite'>] {
  const allowed = new Set(getCapabilityKeysFromDefinitions(definitions))
  // Normalize the three supported keys while clamping each live value to the new definitions.
  const projectCapabilities = sql`json_object(${sql.join(
    CAPABILITY_KEYS.map(key => {
      const enabled = allowed.has(key)
        ? sql`json_type(${project.capabilities}, ${`$.${key}`}) = 'true'`
        : sql`0`
      return sql`${key}, json(CASE WHEN ${enabled} THEN 'true' ELSE 'false' END)`
    }),
    sql`, `,
  )})`
  const projects = db
    .update(project)
    .set({ capabilities: projectCapabilities })
    .where(
      and(
        eq(project.organisationId, organisationId),
        guard,
        sql`${project.capabilities} IS NOT ${projectCapabilities}`,
      ),
    )

  // Roles can only retain permissions still enabled by their project after the first statement.
  const roleCapabilities = sql`json_object(${sql.join(
    CAPABILITY_KEYS.map(
      key =>
        sql`${key}, json(CASE WHEN json_type(${projectRole.capabilities}, ${`$.${key}`}) = 'true'
      AND EXISTS (SELECT 1 FROM ${project} WHERE ${project.id} = ${projectRole.projectId}
        AND json_type(${project.capabilities}, ${`$.${key}`}) = 'true')
      THEN 'true' ELSE 'false' END)`,
    ),
    sql`, `,
  )})`
  const roles = db
    .update(projectRole)
    .set({ capabilities: roleCapabilities })
    .where(
      and(
        inArray(
          projectRole.projectId,
          db
            .select({ id: project.id })
            .from(project)
            .where(eq(project.organisationId, organisationId)),
        ),
        guard,
        sql`${projectRole.capabilities} IS NOT ${roleCapabilities}`,
      ),
    )
  return [projects, roles]
}
