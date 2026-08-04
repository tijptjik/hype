// DRIZZLE
import { and, eq, lt, sql } from 'drizzle-orm'
// DB SCHEMA
import { session, user, userFeature, userLayer } from '$lib/db/schema'
// TYPES
import type { Database } from '$lib/types'

export const ANONYMOUS_RETENTION_DAYS = 45

type AnonymousLinkUser = {
  id: string
}

/**
 * Returns the most recent valid ISO timestamp from two persisted visit values.
 *
 * @param left - First possible visit timestamp.
 * @param right - Second possible visit timestamp.
 * @returns The newest valid timestamp, or `null` when neither value is valid.
 */
function latestVisitTimestamp(
  left: string | null,
  right: string | null,
): string | null {
  const valid = [left, right]
    .filter((value): value is string => Boolean(value))
    .map(value => ({ value, time: Date.parse(value) }))
    .filter(candidate => Number.isFinite(candidate.time))
    .sort((a, b) => b.time - a.time)

  return valid[0]?.value ?? null
}

/**
 * Atomically merges D1-backed guest state into the durable account selected by
 * Better Auth.
 *
 * @param db - Active D1 Drizzle client.
 * @param anonymousUser - Source guest user selected by Better Auth.
 * @param newUser - Destination account user selected by Better Auth.
 * @returns Nothing after the transactional D1 batch succeeds.
 * @remarks Account identity, roles, provider data, and security state are never copied.
 */
export async function migrateAnonymousUserState(
  db: Database,
  anonymousUser: AnonymousLinkUser,
  newUser: AnonymousLinkUser,
): Promise<void> {
  if (anonymousUser.id === newUser.id) return

  const [sourceUser, sourceFeatures, targetFeatures, sourceLayers] = await Promise.all([
    db.query.user.findFirst({ where: eq(user.id, anonymousUser.id) }),
    db.select().from(userFeature).where(eq(userFeature.userId, anonymousUser.id)),
    db.select().from(userFeature).where(eq(userFeature.userId, newUser.id)),
    db.select().from(userLayer).where(eq(userLayer.userId, anonymousUser.id)),
  ])

  if (!sourceUser?.isAnonymous) {
    throw new Error('Anonymous account migration source is missing or invalid')
  }

  const targetFeaturesById = new Map(
    targetFeatures.map(record => [record.featureId, record]),
  )

  // A single D1 batch makes preferences and conflict-safe interaction merges atomic.
  const statements = [
    db
      .update(user)
      .set({
        locale: sourceUser.locale,
        preferences: sourceUser.preferences,
        experimental: sourceUser.experimental,
      })
      .where(eq(user.id, newUser.id)),
    ...sourceFeatures.map(source => {
      const target = targetFeaturesById.get(source.featureId)
      const isVisited = source.isVisited || Boolean(target?.isVisited)
      const isWishlisted = source.isWishlisted || Boolean(target?.isWishlisted)
      const visitedAt = isVisited
        ? latestVisitTimestamp(source.visitedAt, target?.visitedAt ?? null)
        : null

      return db
        .insert(userFeature)
        .values({
          userId: newUser.id,
          featureId: source.featureId,
          isVisited,
          isWishlisted,
          visitedAt,
        })
        .onConflictDoUpdate({
          target: [userFeature.userId, userFeature.featureId],
          set: { isVisited, isWishlisted, visitedAt },
        })
    }),
    ...sourceLayers.map(source =>
      db
        .insert(userLayer)
        .values({
          userId: newUser.id,
          hubId: source.hubId,
          layerId: source.layerId,
          isDefaultVisible: source.isDefaultVisible,
        })
        .onConflictDoUpdate({
          target: [userLayer.layerId, userLayer.userId, userLayer.hubId],
          set: { isDefaultVisible: source.isDefaultVisible },
        }),
    ),
  ]

  await db.batch(statements as unknown as Parameters<Database['batch']>[0])

  console.info('[auth][anonymous-link]', {
    outcome: 'migrated',
    featureCount: sourceFeatures.length,
    layerCount: sourceLayers.length,
  })
}

/**
 * Deletes expired guest users after the documented inactivity grace period.
 *
 * @param db - Active D1 Drizzle client.
 * @param now - Clock value used to make cleanup deterministic in tests.
 * @returns Aggregate number of deleted guest users.
 * @remarks Users with any unexpired session and all upgraded users are excluded.
 */
export async function cleanupExpiredAnonymousUsers(
  db: Database,
  now: Date = new Date(),
): Promise<number> {
  const cutoff = new Date(
    now.getTime() - ANONYMOUS_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  )

  const deleted = await db
    .delete(user)
    .where(
      and(
        eq(user.isAnonymous, true),
        lt(user.updatedAt, cutoff),
        sql`not exists (
          select 1 from ${session}
          where ${session.userId} = ${user.id}
            and ${session.expiresAt} > ${now.getTime()}
        )`,
      ),
    )
    .returning({ id: user.id })

  console.info('[auth][anonymous-cleanup]', { deletedCount: deleted.length })
  return deleted.length
}
