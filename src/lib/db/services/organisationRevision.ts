// DRIZZLE
import { eq, sql } from 'drizzle-orm'
// SCHEMA
import { organisation, organisationI18n } from '../schema/organisation'
import { organisationUserPolicy } from '../schema/organisationUser'
import { organisationProperty } from '../schema/property'
import {
  organisationRevision,
  organisationRevisionHead,
  organisationRevisionWrite,
} from '../schema/organisationRevision'
import { revisionChangeSet } from '../schema/featureRevision'
// REVISIONS
// SERVICES
import { prepareStaffRoleHistoryContext } from './staffRoleHistory'
import {
  hasResourceLogoStorage,
  withResourceLogoSnapshot,
} from './resourceLogoSnapshot'
import { rowSnapshot } from './revisionSnapshot'
import { prepareAggregateRevisionWindow } from './revisionEditWindow'
import { prepareRevisionCheck } from './revisionBatch'
// TYPES
import type { SQL } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import type { Database } from '#lib/types.js'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
// 1. Snapshot expressions and rollout availability
// 2. Atomic before/after capture
// 3. Authorized history reads

export type OrganisationRevisionActor = {
  actorId: string
  reason?: string
  origin?: 'user' | 'system'
}
export type OrganisationRevisionCapture = {
  before: BatchItem<'sqlite'>[]
  after: BatchItem<'sqlite'>[]
}

/**
 * Captures an organisation aggregate using the same transaction as its mutations.
 * @returns Correlated SQL expression for the outer organisation row.
 * @remarks Role grants are excluded. Property definitions have their own lifecycle;
 * only this organisation's assignment/order belongs to its profile snapshot.
 */
export function organisationSnapshotExpression(logoStorage = false): SQL {
  const baseProfile = rowSnapshot(organisation, [
    'id',
    'createdAt',
    'modifiedAt',
    'permitUserDetailsEdit',
  ])
  // Omit the default-off grant so pre-permission immutable snapshots still match.
  const profile = sql`json_patch(${baseProfile}, CASE WHEN ${organisation.permitUserDetailsEdit} = 1
    THEN '{"permitUserDetailsEdit":true}' ELSE '{}' END)`
  const translation = rowSnapshot(organisationI18n, ['organisationId', 'locale'])
  const basePolicy = rowSnapshot(organisationUserPolicy, [
    'organisationId',
    'revision',
    'contribution',
  ])
  // Keep default-off policies compatible with immutable snapshots captured before this rule existed.
  const policy = sql`json_patch(${basePolicy}, CASE WHEN ${organisationUserPolicy.contribution} = 1
    THEN '{"contribution":true}' ELSE '{}' END)`
  const content = sql`json_object(
    'record',json(${profile}),
    'i18n',json((SELECT json_group_object(locale,json(content)) FROM (
      SELECT ${organisationI18n.locale} AS locale,${translation} AS content FROM ${organisationI18n}
      WHERE ${organisationI18n.organisationId}=${organisation.id} AND COALESCE(${organisationI18n.isAutomaticOnly},0)=0 ORDER BY ${organisationI18n.locale}))),
    'userPolicy',json(COALESCE((SELECT ${policy} FROM ${organisationUserPolicy} WHERE ${organisationUserPolicy.organisationId}=${organisation.id}),'null')),
    'properties',json((SELECT json_group_object(propertyId,json_object('rank',rank)) FROM (
      SELECT ${organisationProperty.propertyId} AS propertyId,${organisationProperty.rank} AS rank FROM ${organisationProperty}
      WHERE ${organisationProperty.organisationId}=${organisation.id} ORDER BY ${organisationProperty.propertyId}))))`
  return withResourceLogoSnapshot(content, sql`${organisation.imageId}`, logoStorage)
}

/**
 * Checks whether the additive organisation-revision migration is installed.
 * @param db Request database.
 * @returns Whether all capture tables exist; partial installations fail closed.
 * @remarks No cross-request cache: installing a migration takes effect immediately.
 */
export async function hasOrganisationRevisionStorage(db: Database): Promise<boolean> {
  const row = await db
    .select({ count: sql<number>`count(*)` })
    .from(sql`sqlite_master`)
    .where(
      sql`type='table' AND name IN ('organisationRevision','organisationRevisionHead','organisationRevisionWrite')`,
    )
    .get()
  if (row?.count === 0) return false
  if (row?.count !== 3) throw new Error('Incomplete organisation revision migration')
  return true
}

/**
 * Builds an explicit one-identity capture target, including a not-yet-created identity.
 * @param id Authorised organisation ID.
 * @returns Target selection for the enclosing transaction.
 */
export function organisationRevisionTarget(id: string): SQL {
  return sql`SELECT ${id} AS id`
}

/**
 * Captures all organisations affected by a hub assignment replacement inside the batch.
 * @param hubId Hub whose current organisations may be detached.
 * @param ids Complete new assignment IDs.
 * @returns SQL target set using a single bound JSON array, independent of collection size.
 */
export function hubOrganisationRevisionTargets(
  hubId: string,
  ids: readonly string[],
): SQL {
  return sql`SELECT id FROM organisation WHERE hubId=${hubId} OR id IN (SELECT value FROM json_each(${JSON.stringify(ids)}))`
}

/**
 * Wraps an existing atomic application write with baseline and final revision capture.
 * @param db Request database.
 * @param targets Server-built SELECT returning exactly one id per target organisation.
 * @param actor Authenticated actor, absent only for legacy callers not yet migrated.
 * @param options Advance edit tokens for indirect assignment mutations.
 * @returns Before/after statements, empty before migration or for unmigrated callers.
 * @remarks Execute both halves with the original writes in one guarded batch. Enrolled
 * records reject omitted capture in SQL. Current reads stay on the existing projection;
 * the head records exactly that projection, including translations, at commit time.
 */
export async function prepareOrganisationRevisionCapture(
  db: Database,
  targets: SQL,
  actor?: OrganisationRevisionActor,
  options?: { touchModifiedAt?: boolean },
): Promise<OrganisationRevisionCapture> {
  if (!actor) return { before: [], after: [] }
  if (!actor.actorId.trim()) throw new Error('Organisation revision actor is required')
  const staff = await prepareStaffRoleHistoryContext(db, actor)
  if (!(await hasOrganisationRevisionStorage(db))) return staff
  const token = crypto.randomUUID(),
    baselineChangeId = crypto.randomUUID(),
    changeId = crypto.randomUUID(),
    now = new Date().toISOString()
  const snapshot = organisationSnapshotExpression(await hasResourceLogoStorage(db))
  const current = sql`SELECT ${snapshot} FROM organisation WHERE organisation.id=w.organisationId`
  const changed = sql`NOT EXISTS (SELECT 1 FROM organisationRevisionHead h JOIN organisationRevision r ON r.id=h.currentRevisionId WHERE h.organisationId=w.organisationId AND r.content=(${current}))`
  const hasBaseline = sql`EXISTS (SELECT 1 FROM organisationRevisionWrite w JOIN organisation o ON o.id=w.organisationId WHERE w.token=${token} AND NOT EXISTS (SELECT 1 FROM organisationRevisionHead h WHERE h.organisationId=w.organisationId))`
  const before: BatchItem<'sqlite'>[] = [
    db
      .insert(organisationRevisionWrite)
      .select(
        sql`SELECT t.id,${token},lower(hex(randomblob(16))),lower(hex(randomblob(16))) FROM (${targets}) t WHERE NOT EXISTS (SELECT 1 FROM organisationRevisionWrite active WHERE active.organisationId=t.id)`,
      ),
    db
      .insert(revisionChangeSet)
      .select(
        sql`SELECT ${baselineChangeId},'system:organisation-revision-baseline','migration','State captured before revision tracking',${now} WHERE ${hasBaseline}`,
      ),
    db
      .insert(organisationRevision)
      .select(
        sql`SELECT w.baselineRevisionId,w.organisationId,NULL,${baselineChangeId},(${current}),1 FROM organisationRevisionWrite w JOIN organisation o ON o.id=w.organisationId WHERE w.token=${token} AND NOT EXISTS (SELECT 1 FROM organisationRevisionHead h WHERE h.organisationId=w.organisationId)`,
      ),
    db
      .insert(organisationRevisionHead)
      .select(
        sql`SELECT w.organisationId,w.baselineRevisionId,0 FROM organisationRevisionWrite w JOIN organisationRevision r ON r.id=w.baselineRevisionId WHERE w.token=${token}`,
      ),
    prepareRevisionCheck(
      db,
      sql`NOT EXISTS (SELECT 1 FROM organisationRevisionWrite w JOIN organisationRevisionHead h ON h.organisationId=w.organisationId JOIN organisationRevision r ON r.id=h.currentRevisionId WHERE w.token=${token} AND r.content IS NOT (${current}))`,
    ),
  ]
  const window = await prepareAggregateRevisionWindow(db, {
    resource: 'organisation',
    revision: organisationRevision,
    head: organisationRevisionHead,
    write: organisationRevisionWrite,
    token,
    actor,
    current,
    changed,
  })
  const after: BatchItem<'sqlite'>[] = [
    ...window.before,
    prepareRevisionCheck(
      db,
      sql`NOT EXISTS (SELECT 1 FROM organisationRevisionWrite w WHERE w.token=${token} AND NOT EXISTS (SELECT 1 FROM organisation WHERE id=w.organisationId))`,
    ),
    db
      .insert(revisionChangeSet)
      .select(
        sql`SELECT ${changeId},${actor.actorId},${actor.origin ?? 'user'},${actor.reason ?? null},${now} WHERE EXISTS (SELECT 1 FROM organisationRevisionWrite w WHERE w.token=${token} AND ${changed})`,
      ),
    db
      .insert(organisationRevision)
      .select(
        sql`SELECT w.revisionId,w.organisationId,(SELECT currentRevisionId FROM organisationRevisionHead WHERE organisationId=w.organisationId),${changeId},(${current}),1 FROM organisationRevisionWrite w WHERE w.token=${token} AND ${changed}`,
      ),
    db
      .insert(organisationRevisionHead)
      .select(
        sql`SELECT w.organisationId,w.revisionId,0 FROM organisationRevisionWrite w JOIN organisationRevision r ON r.id=w.revisionId WHERE w.token=${token}`,
      )
      .onConflictDoUpdate({
        target: organisationRevisionHead.organisationId,
        set: {
          currentRevisionId: sql`excluded.currentRevisionId`,
          generation: sql`${organisationRevisionHead.generation}+1`,
        },
      }),
    ...(options?.touchModifiedAt
      ? [
          db
            .update(organisation)
            .set({
              modifiedAt: sql`CASE
      WHEN ${organisation.modifiedAt} >= strftime('%Y-%m-%dT%H:%M:%fZ','now') THEN strftime('%Y-%m-%dT%H:%M:%fZ',${organisation.modifiedAt},'+0.001 seconds')
      ELSE strftime('%Y-%m-%dT%H:%M:%fZ','now') END`,
            })
            .where(
              sql`${organisation.id} IN (SELECT w.organisationId FROM organisationRevisionWrite w JOIN organisationRevision r ON r.id=w.revisionId WHERE w.token=${token})`,
            ),
        ]
      : []),
    ...window.after,
    db
      .delete(organisationRevisionWrite)
      .where(eq(organisationRevisionWrite.token, token)),
  ]
  return { before: [...staff.before, ...before], after: [...after, ...staff.after] }
}

// HISTORY READS
export { listOrganisationHistory } from './resourceHistory'
export type { OrganisationHistoryPage } from './resourceHistory'
