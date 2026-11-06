// DRIZZLE
import { sql } from 'drizzle-orm'
// TYPES
import type { SQL } from 'drizzle-orm'
import type { Database } from '#lib/types.js'

/** Server-owned identity pair; clients never supply the viewer. */
export type UserChangelogScope = { resource: 'user'; id: string; viewerId: string }

/** Check the subject's current, explicit admin entitlement without exposing their roles.
 * @param id Profile subject identity.
 * @returns A predicate which also rejects archived and anonymous subjects.
 */
function subjectGuard(id: string): SQL {
  return sql`EXISTS(SELECT 1 FROM user subject WHERE subject.id=${id}
    AND COALESCE(subject.isAnonymous,0)=0 AND COALESCE(subject.isArchived,0)=0 AND (
      EXISTS(SELECT 1 FROM hubRole WHERE userId=subject.id AND role='admin')
      OR EXISTS(SELECT 1 FROM organisationRole WHERE userId=subject.id AND role IN ('owner','member'))
      OR EXISTS(SELECT 1 FROM projectRole WHERE userId=subject.id AND role IN ('owner','maintainer','translator','member'))))`
}

/** Check whether the viewer has any history-management scope.
 * @param scope Authenticated viewer and profile subject.
 * @returns A live predicate; membership and capabilities alone confer no history access.
 */
function eligibilityGuard(scope: UserChangelogScope): SQL {
  return sql`${subjectGuard(scope.id)} AND EXISTS(SELECT 1 FROM user viewer
    WHERE viewer.id=${scope.viewerId} AND COALESCE(viewer.isAnonymous,0)=0
    AND COALESCE(viewer.isArchived,0)=0 AND (EXISTS(SELECT 1 FROM hubRole WHERE userId=viewer.id AND role='admin')
      OR EXISTS(SELECT 1 FROM organisationRole WHERE userId=viewer.id AND role='owner')
      OR EXISTS(SELECT 1 FROM projectRole WHERE userId=viewer.id AND role IN ('owner','maintainer'))))`
}

/** Resolve tab visibility from live roles, without returning hidden assignments.
 * @param db Request database.
 * @param scope Authenticated viewer and profile subject.
 * @returns Whether the viewer may request this subject's scoped history.
 */
export async function canReadUserChangelog(
  db: Database,
  scope: UserChangelogScope,
): Promise<boolean> {
  const row = await db.get<{ allowed: number }>(
    sql`SELECT (${eligibilityGuard(scope)}) AS allowed`,
  )
  return row?.allowed === 1
}

/** Restrict a feed branch before pagination, metadata aggregation and value hydration.
 * @param scope Server-owned viewer and subject identities.
 * @param resource Resource represented by x, with canonical o/p/l ancestry aliases.
 * @returns Live role and ancestry predicate, also reused for Feature detail reads.
 * @remarks Core hub administration retains its existing global semantics. Project
 * maintainers cannot see archived resources; members and users never inherit history.
 */
export function userChangelogGuard(
  scope: UserChangelogScope,
  resource: 'hub' | 'organisation' | 'project' | 'layer' | 'feature',
): SQL {
  const hubId = resource === 'hub' ? sql`x.id` : sql`o.hubId`
  const organisation =
    resource === 'hub'
      ? sql`0`
      : sql`EXISTS(SELECT 1 FROM organisationRole
    WHERE userId=viewer.id AND organisationId=o.id AND role='owner')`
  const project =
    resource === 'hub' || resource === 'organisation'
      ? sql`0`
      : sql`EXISTS(SELECT 1 FROM projectRole
    WHERE userId=viewer.id AND projectId=p.id AND (role='owner' OR (role='maintainer' AND x.isArchived=0)))`
  return sql`${subjectGuard(scope.id)} AND EXISTS(SELECT 1 FROM user viewer
    WHERE viewer.id=${scope.viewerId} AND COALESCE(viewer.isAnonymous,0)=0 AND COALESCE(viewer.isArchived,0)=0
    AND (EXISTS(SELECT 1 FROM hubRole hr JOIN hub h ON h.id=hr.hubId
        WHERE hr.userId=viewer.id AND hr.role='admin' AND (h.code='core' OR h.id=${hubId}))
      OR ${organisation} OR ${project}))`
}
