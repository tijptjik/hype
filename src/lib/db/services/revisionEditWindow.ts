// DRIZZLE
import { sql } from 'drizzle-orm'
// SCHEMA
import { revisionEditWindow } from '../schema/revisionEditWindow'
// TYPES
import type { SQL } from 'drizzle-orm'
import type { SQLiteTable } from 'drizzle-orm/sqlite-core'
import type { BatchItem } from 'drizzle-orm/batch'
import type { Database } from '#lib/types.js'
import type { OrganisationRevisionActor } from './organisationRevision'

// TABLE OF CONTENTS
// 1. Shared idle-window policy
// 2. Atomic aggregate capture

export const REVISION_IDLE_WINDOW_MS = 5 * 60 * 1000
/** Database transaction clock, shared with the migration's write guards. */
export const revisionEditTime = sql`(CAST(strftime('%s','now') AS INTEGER)*1000 + CAST(substr(strftime('%f','now'),4,3) AS INTEGER))`

const revisionWindowGuards = {
  organisation: ['organisation_revision_immutable_update'],
  project: ['project_revision_immutable_update'],
  layer: ['layer_revision_immutable_update'],
  hub: ['hub_revision_immutable_update'],
  propertyCatalog: ['property_catalog_revision_update'],
  feature: ['featureRevision_immutable_update', 'feature_revision_no_update'],
  featureDraft: ['feature_review_no_update'],
  imageIntentPolicy: ['image_intent_history_no_update'],
} as const

/** Detects the additive policy migration without caching rollout state.
 * @param db Request database.
 * @param resource Optional independently installed revision family.
 * @returns Whether idle-window storage and the requested write guard are installed.
 */
export async function hasRevisionEditWindows(
  db: Database,
  resource?: keyof typeof revisionWindowGuards,
): Promise<boolean> {
  const row = await db.get<{ n: number }>(
    sql`SELECT count(*) n FROM sqlite_master WHERE type='table' AND name='revisionEditWindow'`,
  )
  if (!row?.n) return false
  if (resource) {
    const names: readonly string[] = revisionWindowGuards[resource]
    const guard = await db.get<{ n: number }>(
      sql`SELECT count(*) n FROM sqlite_master WHERE type='trigger' AND name IN (${names[0]},${names[1] ?? names[0]}) AND instr(sql,'revisionEditWindow')>0`,
    )
    return Boolean(guard?.n)
  }
  return true
}

/** Builds the strict sliding-window predicate; an idle interval of exactly five minutes is closed.
 * @param resource Revision family.
 * @param revisionId Trusted revision expression.
 * @param actor Server-authenticated editor.
 * @returns Correlated eligibility predicate, evaluated again within the write transaction.
 */
export function editableRevision(
  resource: string,
  revisionId: SQL,
  actor: OrganisationRevisionActor,
): SQL {
  return sql`EXISTS (SELECT 1 FROM revisionEditWindow ew WHERE ew.resource=${resource}
    AND ew.revisionId=${revisionId} AND ew.actorId=${actor.actorId} AND ew.origin=${actor.origin ?? 'user'}
    AND ew.origin='user' AND ew.closedAt IS NULL AND ew.lastEditedAt <= ${revisionEditTime}
    AND ew.lastEditedAt > ${revisionEditTime}-${REVISION_IDLE_WINDOW_MS})`
}

/** Coalesces changed current aggregate snapshots while retaining their independent head generations.
 * @param db Request database.
 * @param input Trusted capture tables, transaction token and correlated final snapshot.
 * @returns Statements before normal append capture and before marker cleanup.
 * @remarks Execute inside the original guarded batch. A no-op never selects an existing revision,
 * so it neither advances the head nor extends the idle window. Publication/archive changes split
 * the window. Existing revisions without window rows are never reopened.
 */
export async function prepareAggregateRevisionWindow(
  db: Database,
  input: {
    resource: 'organisation' | 'project' | 'layer' | 'hub'
    revision: SQLiteTable
    head: SQLiteTable
    write: SQLiteTable
    token: string
    actor: OrganisationRevisionActor
    current: SQL
    changed: SQL
  },
): Promise<{ before: BatchItem<'sqlite'>[]; after: BatchItem<'sqlite'>[] }> {
  if (!(await hasRevisionEditWindows(db, input.resource)))
    return { before: [], after: [] }
  const { resource, revision, head, write, token, actor, current, changed } = input
  const owner = sql.identifier(`${resource}Id`)
  const sameState = sql.join(
    ['isPublished', 'isArchived', 'localIsPublished', 'localIsArchived'].map(
      key =>
        sql`json_extract(r.content,${`$.record.${key}`}) IS json_extract((${current}),${`$.record.${key}`})`,
    ),
    sql` AND `,
  )
  const eligible = editableRevision(resource, sql`r.id`, actor)
  const before: BatchItem<'sqlite'>[] = [
    // Select the reusable identity before replacing content, while changed still compares old/new.
    db
      .update(write)
      .set({
        revisionId: sql`(SELECT h.currentRevisionId FROM ${head} h WHERE h.${owner}=${write}.${owner})`,
      })
      .where(sql`${write}.token=${token} AND EXISTS (SELECT 1 FROM ${write} w JOIN ${head} h ON h.${owner}=w.${owner}
        JOIN ${revision} r ON r.id=h.currentRevisionId WHERE w.${owner}=${write}.${owner}
        AND (${changed}) AND (${sameState}) AND (${eligible}))`),
    db
      .update(revision)
      .set({
        content: sql`(SELECT (${current}) FROM ${write} w WHERE w.revisionId=${revision}.id AND w.token=${token})`,
      })
      .where(sql`EXISTS (SELECT 1 FROM ${write} w JOIN ${head} h ON h.${owner}=w.${owner}
        WHERE w.token=${token} AND w.revisionId=${revision}.id AND h.currentRevisionId=${revision}.id)`),
  ]
  const after: BatchItem<'sqlite'>[] = [
    // Only real edits have a recorded target id; untouched markers still hold an unused UUID.
    db
      .insert(revisionEditWindow)
      .select(
        sql`SELECT ${resource},r.id,c.actorId,c.origin,${revisionEditTime},NULL
      FROM ${write} w JOIN ${revision} r ON r.id=w.revisionId JOIN revisionChangeSet c ON c.id=r.changeSetId
      WHERE w.token=${token} AND c.origin='user'
        AND NOT EXISTS (SELECT 1 FROM ${revision} previous WHERE previous.id=r.previousRevisionId AND (
          json_extract(previous.content,'$.record.isPublished') IS NOT json_extract(r.content,'$.record.isPublished')
          OR json_extract(previous.content,'$.record.isArchived') IS NOT json_extract(r.content,'$.record.isArchived')
          OR json_extract(previous.content,'$.record.localIsPublished') IS NOT json_extract(r.content,'$.record.localIsPublished')
          OR json_extract(previous.content,'$.record.localIsArchived') IS NOT json_extract(r.content,'$.record.localIsArchived')))`,
      )

      .onConflictDoUpdate({
        target: [revisionEditWindow.resource, revisionEditWindow.revisionId],
        set: { lastEditedAt: revisionEditTime },
      }),
  ]
  return { before, after }
}

/** Uses the last real edit for feeds and unread cutoffs, retaining the original attribution timestamp.
 * @param installed Whether the additive policy is available in this database.
 * @param resource Revision family.
 * @param revisionId Trusted snapshot identity expression.
 * @param createdAt Original change-set timestamp expression.
 * @returns ISO timestamp of the latest edit, including after the window has closed.
 */
export function revisionActivityTime(
  installed: boolean,
  resource: string,
  revisionId: SQL,
  createdAt: SQL,
): SQL<string> {
  return installed
    ? sql<string>`COALESCE((SELECT strftime('%Y-%m-%dT%H:%M:%fZ',ew.lastEditedAt/1000.0,'unixepoch')
    FROM revisionEditWindow ew WHERE ew.resource=${resource} AND ew.revisionId=${revisionId}),${createdAt})`
    : sql<string>`${createdAt}`
}
