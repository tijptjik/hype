// SVELTEKIT
import { error } from '@sveltejs/kit'
// DRIZZLE
import { and, eq, sql } from 'drizzle-orm'
// SCHEMA
import {
  fieldResearchImage as images,
  fieldResearchSession as sessions,
  fieldResearchStack as stacks,
} from '../schema/fieldResearch'
// DOMAIN
import { suggestResearchStacks } from '#lib/fieldResearch/model.js'
// SERVICES
import { executeRevisionBatch } from './revisionBatch'
// TYPES
import type { Database } from '#lib/types.js'
import type { BatchItem } from 'drizzle-orm/batch'
import type { ResearchSession, ResearchCoordinates } from '#lib/fieldResearch/model.js'

// TABLE OF CONTENTS
// 1. Session reads and revision guards
// 2. Initial clustering
// 3. Manual grouping and marker placement

/** Read a retained private session after the caller has checked owning-project management access.
 * @param db Request database. @param id Session identity.
 * @returns Session or a not-found error.
 */
export async function readResearchSession(
  db: Database,
  id: string,
): Promise<ResearchSession> {
  const session = await db.select().from(sessions).where(eq(sessions.id, id)).get()
  if (!session) error(404, 'Field research session not found')
  return session
}

/** Build a compare-and-swap fence for all session-local editing and conversion.
 * @param id Session identity. @param revision Last observed session revision.
 * @returns Transactional predicate that rejects completed or concurrently changed sessions.
 */
export function researchSessionGuard(id: string, revision: number) {
  return sql`EXISTS (SELECT 1 FROM fieldResearchSession WHERE id=${id} AND revision=${revision} AND status!='completed')`
}

/** Advance the session revision alongside an atomic grouping operation.
 * @param db Request database. @param id Session identity.
 * @returns Unexecuted revision update.
 */
export function touchResearchSession(db: Database, id: string) {
  return db
    .update(sessions)
    .set({ revision: sql`${sessions.revision}+1`, updatedAt: new Date().toISOString() })
    .where(eq(sessions.id, id))
}

/** Suggest groups once for newly uploaded, ungrouped images; never regroup manual edits.
 * @param db Request database. @param id Session identity. @param revision Observed revision.
 * @returns Nothing after the grouping transaction succeeds.
 */
export async function clusterResearchImages(
  db: Database,
  id: string,
  revision: number,
): Promise<void> {
  const rows = await db
    .select()
    .from(images)
    .where(
      and(
        eq(images.sessionId, id),
        eq(images.state, 'uploaded'),
        sql`${images.stackId} IS NULL`,
      ),
    )
    .orderBy(images.createdAt, images.id)
  const groups = suggestResearchStacks(rows)
  const byId = new Map(rows.map(row => [row.id, row]))
  const statements: BatchItem<'sqlite'>[] = []
  // Each insert has fixed bindings; memberships use JSON to avoid unbounded SQL variables.
  for (const group of groups) {
    const first = byId.get(group[0])!
    const stackId = crypto.randomUUID()
    statements.push(
      db.insert(stacks).values({
        id: stackId,
        sessionId: id,
        longitude: first.longitude,
        latitude: first.latitude,
        createdAt: new Date().toISOString(),
      }),
    )
    statements.push(
      db
        .update(images)
        .set({ stackId })
        .where(
          and(
            eq(images.sessionId, id),
            sql`${images.id} IN (SELECT value FROM json_each(${JSON.stringify(group)}))`,
          ),
        ),
    )
  }
  statements.push(
    db
      .update(sessions)
      .set({
        status: 'organising',
        revision: sql`${sessions.revision}+1`,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(sessions.id, id)),
  )
  const result = await executeRevisionBatch(
    db,
    sql`(${researchSessionGuard(id, revision)}) AND NOT EXISTS(SELECT 1 FROM fieldResearchImage WHERE sessionId=${id} AND state!='uploaded')`,
    statements,
  )
  if (!result) error(409, 'Uploads or grouping changed. Refresh the session and retry.')
}

/** Move one image between working stacks or extract it as its own stack.
 * @param db Request database. @param input Current session revision and source/target identities.
 * @returns Nothing after an atomic move; converted stacks cannot be modified.
 */
export async function moveResearchImage(
  db: Database,
  input: {
    sessionId: string
    revision: number
    imageId: string
    targetStackId: string | null
    coordinates?: ResearchCoordinates
  },
): Promise<void> {
  const row = await db
    .select()
    .from(images)
    .where(and(eq(images.id, input.imageId), eq(images.sessionId, input.sessionId)))
    .get()
  if (row?.state !== 'uploaded' || !row.stackId)
    error(404, 'Image is not ready for grouping')
  const target = input.targetStackId ?? crypto.randomUUID()
  if (target === row.stackId) return
  const writes: BatchItem<'sqlite'>[] = []
  if (!input.targetStackId)
    writes.push(
      db.insert(stacks).values({
        id: target,
        sessionId: input.sessionId,
        longitude: input.coordinates?.[0] ?? row.longitude,
        latitude: input.coordinates?.[1] ?? row.latitude,
        createdAt: new Date().toISOString(),
      }),
    )
  writes.push(
    db.update(images).set({ stackId: target }).where(eq(images.id, row.id)),
    touchResearchSession(db, input.sessionId),
  )
  const targetGuard = input.targetStackId
    ? sql`EXISTS(SELECT 1 FROM fieldResearchStack WHERE id=${target} AND sessionId=${input.sessionId} AND featureId IS NULL)`
    : sql`1`
  const result = await executeRevisionBatch(
    db,
    sql`(${researchSessionGuard(input.sessionId, input.revision)}) AND (${targetGuard}) AND EXISTS(SELECT 1 FROM fieldResearchStack WHERE id=${row.stackId} AND sessionId=${input.sessionId} AND featureId IS NULL)`,
    writes,
  )
  if (!result) error(409, 'The session changed. Refresh before moving this image.')
}

/** Set the working marker without overwriting original image GPS evidence.
 * @param db Request database. @param input Scoped stack, revision and chosen marker.
 * @returns Nothing after a successful optimistic update.
 */
export async function placeResearchStack(
  db: Database,
  input: {
    sessionId: string
    revision: number
    stackId: string
    coordinates: ResearchCoordinates
  },
): Promise<void> {
  const result = await executeRevisionBatch(
    db,
    sql`(${researchSessionGuard(input.sessionId, input.revision)}) AND EXISTS(SELECT 1 FROM fieldResearchStack WHERE id=${input.stackId} AND sessionId=${input.sessionId} AND featureId IS NULL)`,
    [
      db
        .update(stacks)
        .set({ longitude: input.coordinates[0], latitude: input.coordinates[1] })
        .where(eq(stacks.id, input.stackId)),
      touchResearchSession(db, input.sessionId),
    ],
  )
  if (!result) error(409, 'The session changed. Refresh before moving this marker.')
}

/** Merge whole provisional stacks atomically, preserving the destination pin and capture GPS.
 * @param db Request database. @param input Current revision and same-session stack identities.
 * @returns Nothing after all source images move together; converted stacks are immutable.
 */
export async function mergeResearchStacks(
  db: Database,
  input: {
    sessionId: string
    revision: number
    sourceStackId: string
    targetStackId: string
  },
): Promise<void> {
  if (input.sourceStackId === input.targetStackId) return
  const committed = await executeRevisionBatch(
    db,
    sql`(${researchSessionGuard(input.sessionId, input.revision)}) AND EXISTS(SELECT 1 FROM fieldResearchStack WHERE id=${input.sourceStackId} AND sessionId=${input.sessionId} AND featureId IS NULL) AND EXISTS(SELECT 1 FROM fieldResearchStack WHERE id=${input.targetStackId} AND sessionId=${input.sessionId} AND featureId IS NULL)`,
    [
      db
        .update(images)
        .set({ stackId: input.targetStackId })
        .where(
          and(
            eq(images.sessionId, input.sessionId),
            eq(images.stackId, input.sourceStackId),
          ),
        ),
      touchResearchSession(db, input.sessionId),
    ],
  )
  if (!committed)
    error(409, 'The session changed. Refresh before merging these stacks.')
}
