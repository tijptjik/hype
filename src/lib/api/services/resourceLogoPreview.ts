// DRIZZLE
import { sql, type SQL } from 'drizzle-orm'
// AUTHORIZATION
import {
  authorizeOrganisationUpdateForSubmission,
  authorizeProjectUpdateForSubmission,
  authorizeHubUpdateForSubmission,
} from './authz/index'
// SERVICES
import { probeOrganisationQuery } from '#lib/db/services/organisation.js'
import { probeProjectForUpdate } from '#lib/db/services/project.js'
import { probeHubForUpdate } from '#lib/db/services/hub.js'
import { readImageRevisionDelivery } from '#lib/db/services/imageRevisionDelivery.js'
import { hasResourceLogoStorage } from '#lib/db/services/resourceLogoSnapshot.js'
// TYPES
import type { Database, Id, UserRoleDisco, SessionUser } from '#lib/types.js'
import type { PinnedImageDelivery } from '#lib/db/services/imageRevisionDelivery.js'

/** Resolves historical logo previews under the same current editing authority as resource history.
 * @param db Request database.
 * @param revisionId Immutable image revision.
 * @param actor Current session and roles, never a historical role.
 * @returns An authorized exact logo or null.
 * @remarks Discovering an image ID does not grant history access. Each matching owner is probed and
 * ancestry is fenced again during the image read; archived image moderation is always enforced.
 */
export async function readResourceLogoPreview(
  db: Database,
  revisionId: string,
  actor?: { user: SessionUser; userRoles: UserRoleDisco[] },
): Promise<PinnedImageDelivery | null> {
  if (!actor || !(await hasResourceLogoStorage(db))) return null
  const owners = await db.all<{
    resource: 'organisation' | 'project' | 'hub'
    id: string
  }>(sql`
    SELECT 'organisation' resource,r.organisationId id FROM organisationRevisionLogo p JOIN organisationRevision r ON r.id=p.revisionId WHERE p.imageRevisionId=${revisionId}
    UNION SELECT 'project',r.projectId FROM projectRevisionLogo p JOIN projectRevision r ON r.id=p.revisionId WHERE p.imageRevisionId=${revisionId}
    UNION SELECT 'hub',r.hubId FROM hubRevisionLogo p JOIN hubRevision r ON r.id=p.revisionId WHERE p.imageRevisionId=${revisionId}`)
  const common = {
    user: actor.user,
    userRoles: actor.userRoles,
    submittedData: { i18n: true },
  }
  for (const owner of owners) {
    let guard: SQL
    if (owner.resource === 'organisation') {
      const probe = await probeOrganisationQuery(db, { ref: owner.id, refKey: 'id' })
      if (
        !probe ||
        !authorizeOrganisationUpdateForSubmission({ ...common, resource: probe })
          .allowed
      )
        continue
      guard = sql`EXISTS(SELECT 1 FROM organisation o WHERE o.id=${owner.id} AND o.hubId IS ${probe.hubId})`
    } else if (owner.resource === 'project') {
      const probe = await probeProjectForUpdate(db, owner.id as Id)
      if (
        !probe ||
        !authorizeProjectUpdateForSubmission({ ...common, resource: probe }).allowed
      )
        continue
      guard = sql`EXISTS(SELECT 1 FROM project p JOIN organisation o ON o.id=p.organisationId WHERE p.id=${owner.id} AND p.organisationId=${probe.organisationId} AND o.hubId IS ${probe.hubId})`
    } else {
      const probe = await probeHubForUpdate(db, owner.id as Id)
      if (
        !probe ||
        !authorizeHubUpdateForSubmission({ ...common, resource: probe }).allowed
      )
        continue
      guard = sql`EXISTS(SELECT 1 FROM hub WHERE id=${owner.id})`
    }
    const history = sql.identifier(`${owner.resource}Revision`),
      pins = sql.identifier(`${owner.resource}RevisionLogo`),
      column = sql.identifier(`${owner.resource}Id`)
    const result = await readImageRevisionDelivery(
      db,
      revisionId,
      sql`(${guard}) AND EXISTS(SELECT 1 FROM ${pins} p JOIN ${history} r ON r.id=p.revisionId
      WHERE r.${column}=${owner.id} AND p.imageId=i.id AND p.imageRevisionId=${revisionId})`,
    )
    if (result) return result
  }
  return null
}
