// DRIZZLE
import { eq, sql } from 'drizzle-orm'
// SCHEMA
import { staffRoleHistoryContext } from '../schema/staffRoleHistory'
// REVISIONS
import { diffRevisionValues } from '#lib/revisions/diff.js'
// TYPES
import type { RevisionValue } from '#lib/revisions/value.js'
import type { SQL } from 'drizzle-orm'
import type { Database } from '#lib/types.js'
import type {
  OrganisationRevisionActor,
  OrganisationRevisionCapture,
} from './organisationRevision'
import type { OrganisationHistoryPage } from './resourceHistory'

// TABLE OF CONTENTS
// 1. Storage and transaction attribution
// 2. Authorized history reads

/** Detect the additive role audit installation without caching rollout state.
 * @param db Request database.
 * @returns Whether the complete storage exists; partial installations fail closed.
 */
async function hasStaffRoleHistory(db: Database): Promise<boolean> {
  const row = await db
    .select({ count: sql<number>`count(*)` })
    .from(sql`sqlite_master`)
    .where(sql`type='table' AND name IN ('staffRoleHistory','staffRoleHistoryContext')`)
    .get()
  if (row?.count === 0) return false
  if (row?.count !== 2) throw new Error('Incomplete staff role history migration')
  return true
}

/** Attach server attribution to every role mutation in the enclosing atomic save.
 * @param db Request database.
 * @param actor Authenticated server actor; unconverted callers remain explicitly unattributed.
 * @returns Statements enclosing the save, independently of profile history activation.
 * @remarks Nested captures share the oldest active context. Failed batches roll back
 * both the context and audit rows. SQL/legacy writes still produce unattributed evidence.
 */
export async function prepareStaffRoleHistoryContext(
  db: Database,
  actor?: OrganisationRevisionActor,
): Promise<OrganisationRevisionCapture> {
  if (!actor || !(await hasStaffRoleHistory(db))) return { before: [], after: [] }
  if (!actor.actorId.trim()) throw new Error('Staff history actor is required')
  const token = crypto.randomUUID()
  return {
    before: [
      db.insert(staffRoleHistoryContext).values({
        token,
        actorId: actor.actorId,
        origin: actor.origin ?? 'user',
        reason: actor.reason ?? null,
        createdAt: new Date().toISOString(),
      }),
    ],
    after: [
      db
        .delete(staffRoleHistoryContext)
        .where(eq(staffRoleHistoryContext.token, token)),
    ],
  }
}

/** Read staff changes under the current authorized ancestry, combining replacement writes.
 * @param db Request database.
 * @param input Server-authorized resource and optional exclusive sequence cursor.
 * @param guard Persisted ancestry predicate repeated in the data query.
 * @returns Attributed before/after evidence; baseline rows never imply historical grants.
 * @remarks Pagination is by complete transaction groups, never individual role rows.
 * Subjects retain their recorded display label if their account is renamed or removed.
 */
export async function listStaffRoleHistory(
  db: Database,
  input: { resource: 'hub' | 'organisation' | 'project'; id: string; before?: number },
  guard: SQL,
): Promise<OrganisationHistoryPage> {
  if (!(await hasStaffRoleHistory(db)))
    return { available: false, entries: [], nextCursor: null }
  // Collapse each subject to its first before and final after, then discard net no-ops.
  const rows = await db.all<{
    seq: number
    batchId: string
    actorId: string
    origin: string
    reason: string | null
    createdAt: string
    baseline: number
    changes: string
    actorProfileId: string | null
    actorName: string | null
    actorUsername: string | null
    actorDisplayUsername: string | null
    actorImage: string | null
  }>(sql`WITH subjects AS (
    SELECT batchId,userId,min(seq) firstSeq,max(seq) lastSeq FROM staffRoleHistory
    WHERE resource=${input.resource} AND resourceId=${input.id} AND ${guard}
    GROUP BY batchId,userId
  ), net AS (
    SELECT f.batchId,f.userId,l.subjectLabel,f.beforeValue,l.afterValue,l.seq,
      f.actorId,f.origin,f.reason,f.createdAt,f.baseline
    FROM subjects s JOIN staffRoleHistory f ON f.seq=s.firstSeq
      JOIN staffRoleHistory l ON l.seq=s.lastSeq
    WHERE f.beforeValue IS NOT l.afterValue
  ), groups AS (
    SELECT batchId,max(seq) seq,actorId,origin,reason,createdAt,baseline,
      json_group_array(json_object('userId',userId,'label',subjectLabel,
        'before',json(beforeValue),'after',json(afterValue),
        'username',(SELECT username FROM user WHERE id=net.userId))) changes
    FROM net GROUP BY batchId
  ) SELECT g.*,u.id actorProfileId,u.name actorName,u.username actorUsername,
    u.displayUsername actorDisplayUsername,u.image actorImage
    FROM groups g LEFT JOIN user u ON u.id=g.actorId
    WHERE (${input.before ?? null} IS NULL OR g.seq < ${input.before ?? null})
    ORDER BY g.seq DESC LIMIT 31`)
  const page = rows.slice(0, 30)
  return {
    available: true,
    recordingEnabled: true,
    nextCursor: rows.length > 30 ? page[page.length - 1].seq : null,
    entries: page.map(row => {
      const subjects = JSON.parse(row.changes) as Array<{
        userId: string
        label: string
        username: string | null
        before: RevisionValue
        after: RevisionValue
      }>
      const before = Object.fromEntries(
        subjects.filter(s => s.before !== null).map(s => [s.userId, s.before]),
      )
      const after = Object.fromEntries(
        subjects.filter(s => s.after !== null).map(s => [s.userId, s.after]),
      )
      return {
        id: row.batchId,
        actorId: row.actorId,
        actor: row.actorProfileId
          ? {
              name: row.actorName,
              username: row.actorUsername,
              displayUsername: row.actorDisplayUsername,
              image: row.actorImage,
            }
          : null,
        origin: row.origin,
        reason: row.reason ?? 'Staff roles updated',
        createdAt: row.createdAt,
        initial: row.baseline === 1,
        staffProfiles: Object.fromEntries(
          subjects.map(s => [s.userId, { username: s.username }]),
        ),
        fieldLabels: Object.fromEntries(subjects.map(s => [s.userId, s.label])),
        changes: diffRevisionValues(
          { present: true, value: before },
          { present: true, value: after },
        ),
      }
    }),
  }
}
