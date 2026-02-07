// DB
import { upsert } from '$lib/db/crud'
import { userFeature } from '$lib/db/schema/index'
// DRIZZLE
import { eq } from 'drizzle-orm'
// TYPES
import type {
  Database,
  UserFeature,
  UserFeatureDBNew,
  UserFeaturePartial,
} from '$lib/types'

// ═══════════════════════
// 1. LIST :: USER FEATURES
// ═══════════════════════

export async function listUserFeatures(
  db: Database,
  userId: string,
): Promise<UserFeature[]> {
  // Use direct query instead of readMany to return empty array for new users
  const userFeatures = await db
    .select()
    .from(userFeature)
    .where(eq(userFeature.userId, userId))

  return userFeatures as UserFeature[]
}

// ═══════════════════════
// 2. UPSERT :: USER FEATURE
// ═══════════════════════

export async function upsertUserFeature(
  db: Database,
  targetUserId: string, // ID of the user whose feature is being upserted
  data: UserFeaturePartial,
): Promise<UserFeature> {
  const recordToUpsert: UserFeatureDBNew = {
    userId: targetUserId,
    featureId: data.featureId!,
    isVisited: data.isVisited,
    isWishlisted: data.isWishlisted,
    visitedAt: data.visitedAt,
  }

  // The conflict columns are 'userId' and 'featureId' as these form the unique key for a userFeature
  return await upsert(db, userFeature, recordToUpsert, [
    userFeature.userId,
    userFeature.featureId,
  ])
}
