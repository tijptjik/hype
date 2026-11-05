// SVELTEKIT
import { error } from '@sveltejs/kit'
// DRIZZLE
import { and, eq, inArray, sql } from 'drizzle-orm'
// DB
import { feature, featureImage, image, task, user } from '#lib/db/schema/index.js'
// AUTH AND SCOPE
import { canReadAdminUserProfile } from './adminUser'
import { canBrowseUsers } from './authz/userDirectory'
import { toUserContributionFeatureScope } from './user'
// TYPES
import type { Database, SessionUser, UserRoleDisco } from '#lib/types.js'
import type { HubOptsExtended } from '#lib/db/zod/schema/hub.types.js'
import type { UserDirectoryMetrics } from '#lib/users/directoryMetrics.types.js'

/** Load compact public contribution counts for a bounded batch of visible rows.
 * @param db Request database.
 * @param params Requested users, authenticated actor, roles and server-resolved hub.
 * @returns Counts for permitted users; hidden users are omitted.
 * @remarks Uses the admin profile's published feature scope, never draft/private totals.
 * JSON membership keeps the batch to one SQL parameter per query.
 */
export async function readUserDirectoryMetrics(
  db: Database,
  params: {
    userIds: string[]
    actor: SessionUser
    userRoles: UserRoleDisco[]
    hub?: Partial<HubOptsExtended> | null
  },
): Promise<UserDirectoryMetrics[]> {
  const actor = { ...params.actor, userRoles: params.userRoles }
  if (!canReadAdminUserProfile(actor)) error(403, 'INSUFFICIENT_ROLE')
  if (!params.userIds.length || params.userIds.length > 25)
    error(400, 'INVALID_BATCH_SIZE')
  const ids = sql`(select value from json_each(${JSON.stringify([...new Set(params.userIds)])}))`
  const permitted = await db
    .select({ id: user.id })
    .from(user)
    .where(
      and(
        inArray(user.id, ids),
        canBrowseUsers({ ...actor, hubId: params.hub?.id })
          ? undefined
          : eq(user.isArchived, false),
      ),
    )
  if (!permitted.length) return []
  const allowedIds = sql`(select value from json_each(${JSON.stringify(permitted.map(row => row.id))}))`
  const scope = toUserContributionFeatureScope(db, {
    sessionUser: params.actor,
    hubOpts: params.hub,
    isAdminRequest: true,
  })

  // Aggregate independently so multiple images/tasks cannot multiply feature counts.
  const [features, photos, reports] = await Promise.all([
    db
      .select({ userId: feature.contributorId, count: sql<number>`count(*)` })
      .from(feature)
      .where(
        and(inArray(feature.contributorId, allowedIds), inArray(feature.id, scope)),
      )
      .groupBy(feature.contributorId),
    db
      .select({
        userId: image.contributorId,
        count: sql<number>`count(distinct ${image.id})`,
      })
      .from(image)
      .innerJoin(featureImage, eq(featureImage.imageId, image.id))
      .where(
        and(
          inArray(image.contributorId, allowedIds),
          eq(image.isArchived, false),
          eq(featureImage.isPublished, true),
          inArray(featureImage.featureId, scope),
        ),
      )
      .groupBy(image.contributorId),
    db
      .select({ userId: task.contributorId, count: sql<number>`count(*)` })
      .from(task)
      .where(
        and(
          inArray(task.contributorId, allowedIds),
          eq(task.type, 'reportedMissing'),
          inArray(task.featureId, scope),
        ),
      )
      .groupBy(task.contributorId),
  ])
  const featureCounts = new Map(features.map(row => [row.userId, Number(row.count)]))
  const photoCounts = new Map(photos.map(row => [row.userId, Number(row.count)]))
  const reportCounts = new Map(reports.map(row => [row.userId, Number(row.count)]))
  return permitted.map(row => ({
    userId: row.id,
    publishedFeatures: featureCounts.get(row.id) ?? 0,
    publishedPhotos: photoCounts.get(row.id) ?? 0,
    missingPlaceReports: reportCounts.get(row.id) ?? 0,
  }))
}
