// DRIZZLE
import { sql } from 'drizzle-orm'
// TYPES
import type { SQL } from 'drizzle-orm'
import type { Database } from '#lib/types.js'
import type { FirstClassResource } from '#lib/enums.js'

export type UserResourceCheckpointTarget = {
  userId: string
  resourceType: `${FirstClassResource}`
  resourceId: string
  checkpointKind: string
  /** Persisted scope fence supplied by the feature after it authorizes this target. */
  guard: SQL
}

// +++ Table Of Contents
// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. PREVIOUS CHECKPOINT READ
// - readUserResourceCheckpoint
// 2. MONOTONIC PROGRESS WRITE
// - saveUserResourceCheckpoint
// ---

/********************
 *  1. PREVIOUS CHECKPOINT READ
 ************/
// +++ Previous Checkpoint Read

/** Read a private progress cutoff for one user, resource and checkpoint kind.
 * @param db Request database.
 * @param input Authenticated user, canonical identity, feature-owned kind and persisted scope fence.
 * @returns Previous cutoff, or null on a first visit or revoked scope.
 * @remarks Callers own authorization and progress semantics. The store never resolves
 * resource policies, interprets checkpoint kinds or accepts client-supplied user identities.
 */
export async function readUserResourceCheckpoint(
  db: Database,
  input: UserResourceCheckpointTarget,
): Promise<string | null> {
  const row = await db.get<{
    checkedThrough: string
  }>(sql`SELECT checkedThrough FROM userResourceCheckpoint
    WHERE userId=${input.userId} AND resourceType=${input.resourceType} AND resourceId=${input.resourceId}
      AND checkpointKind=${input.checkpointKind} AND (${input.guard})`)
  return row?.checkedThrough ?? null
}

// ---
/********************
 *  2. MONOTONIC PROGRESS WRITE
 ************/
// +++ Monotonic Progress Write

/** Save a feature's successful progress cutoff without rewinding a newer checkpoint.
 * @param db Request database.
 * @param input Authorized checkpoint target, persisted scope fence and inspected cutoff.
 * @returns Saved monotonic cutoff, or null when the feature's scope no longer matches.
 * @remarks The cutoff is capped at server time. Callers decide when progress advances;
 * this store writes only private checkpoint metadata, never resources or their history.
 */
export async function saveUserResourceCheckpoint(
  db: Database,
  input: UserResourceCheckpointTarget & { checkedThrough: string },
): Promise<string | null> {
  const checkedThrough = new Date(
    Math.min(Date.parse(input.checkedThrough), Date.now()),
  ).toISOString()
  // Re-evaluate the feature's fence inside the upsert so a post-authorization move fails closed.
  const row = await db.get<{
    checkedThrough: string
  }>(sql`INSERT INTO userResourceCheckpoint(userId,resourceType,resourceId,checkpointKind,checkedThrough)
    SELECT ${input.userId},${input.resourceType},${input.resourceId},${input.checkpointKind},${checkedThrough} WHERE ${input.guard}
    ON CONFLICT(userId,resourceType,resourceId,checkpointKind) DO UPDATE SET checkedThrough=max(userResourceCheckpoint.checkedThrough,excluded.checkedThrough)
    RETURNING checkedThrough`)
  return row?.checkedThrough ?? null
}
