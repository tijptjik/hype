// DRIZZLE
import { getTableColumns, sql } from 'drizzle-orm'
// SCHEMA
import { adminResourceRevisionRollout } from '../schema/adminResourceRevisionRollout'
import { project, projectI18n } from '../schema/project'
import { layer, layerI18n, layerProperty } from '../schema/layer'
import { hub, hubI18n, hubLayer } from '../schema/hub'
import { projectProperty, hubProperty } from '../schema/property'
import { projectMapStyles } from '../schema/map'
import * as projectHistory from '../schema/projectRevision'
import * as layerHistory from '../schema/layerRevision'
import * as hubHistory from '../schema/hubRevision'
import { revisionChangeSet } from '../schema/featureRevision'
// REVISIONS
// SERVICES
import { hasResourceLogoStorage, withResourceLogoSnapshot } from './resourceLogoSnapshot'
import { rowSnapshot } from './revisionSnapshot'
import { prepareRevisionCheck } from './revisionBatch'
// TYPES
import type { SQL } from 'drizzle-orm'
import type { SQLiteTable } from 'drizzle-orm/sqlite-core'
import type { BatchItem } from 'drizzle-orm/batch'
import type { Database } from '#lib/types.js'
import type {
  OrganisationRevisionActor,
  OrganisationRevisionCapture,
} from './organisationRevision'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
// 1. Owned snapshot contracts
// 2. Rollout detection and atomic capture
// 3. Authorized history reads

export type AdminRevisionResource = 'project' | 'layer' | 'hub'
const contracts = {
  project: {
    table: project,
    i18n: projectI18n,
    property: projectProperty,
    revision: projectHistory.projectRevision,
    head: projectHistory.projectRevisionHead,
    write: projectHistory.projectRevisionWrite,
  },
  layer: {
    table: layer,
    i18n: layerI18n,
    property: layerProperty,
    revision: layerHistory.layerRevision,
    head: layerHistory.layerRevisionHead,
    write: layerHistory.layerRevisionWrite,
  },
  hub: {
    table: hub,
    i18n: hubI18n,
    property: hubProperty,
    revision: hubHistory.hubRevision,
    head: hubHistory.hubRevisionHead,
    write: hubHistory.hubRevisionWrite,
  },
} as const

/**
 * Captures a stable-keyed owned collection without turning order into identity.
 * @param table Owned relation table.
 * @param owner Owner column name.
 * @param key Stable child identity column.
 * @param parent Outer parent identity.
 * @returns Deterministic JSON object retaining typed child values.
 */
function collection(table: SQLiteTable, owner: string, key: string, parent: SQL): SQL {
  const columns = getTableColumns(table)
  const content = rowSnapshot(table, [owner, key])
  return sql`json((SELECT json_group_object(childKey,json(content)) FROM (
    SELECT ${columns[key]} AS childKey,${content} AS content FROM ${table}
    WHERE ${columns[owner]}=${parent} ORDER BY ${columns[key]})))`
}

/**
 * Defines the aggregate captured by immediate admin edits.
 * @param resource Admin resource type.
 * @returns Correlated expression evaluated within the mutation transaction.
 * @remarks Roles and membership grants are excluded. Subscription credentials never
 * enter revision payloads. Effective visibility is retained for now, so hierarchy
 * writers must join capture before this staged migration can be enabled.
 */
export function adminResourceSnapshot(resource: AdminRevisionResource, logoStorage = false): SQL {
  const { table, i18n, property } = contracts[resource]
  const owner = `${resource}Id`
  const id = sql`${table.id}`
  const record = rowSnapshot(table, [
    'id',
    'createdAt',
    'modifiedAt',
    'subscriptionSessionCookie',
  ])
  const extra =
    resource === 'hub'
      ? sql`,'layers',${collection(hubLayer, owner, 'layerId', id)}`
      : resource === 'project'
        ? sql`,'mapStyle',json(COALESCE((SELECT ${rowSnapshot(projectMapStyles, ['projectId', 'createdAt', 'modifiedAt'])}
          FROM ${projectMapStyles} WHERE ${projectMapStyles.projectId}=${id}),'null'))`
        : sql``
  const content = sql`json_object('record',json(${record}),
    'i18n',${collection(i18n, owner, 'locale', id)},
    'properties',${collection(property, owner, 'propertyId', id)}${extra})`
  return resource === 'layer' ? content : withResourceLogoSnapshot(content, sql`${contracts[resource].table.imageId}`, logoStorage)
}

/**
 * Detects the additive storage without caching migration state across requests.
 * @param db Request database.
 * @param resource Resource storage to inspect.
 * @returns False for absent storage; partial installation throws.
 */
export async function hasAdminResourceRevisionStorage(
  db: Database,
  resource: AdminRevisionResource,
): Promise<boolean> {
  const row = await db
    .select({ count: sql<number>`count(*)` })
    .from(sql`sqlite_master`)
    .where(
      sql`type='table' AND name IN (${`${resource}Revision`},${`${resource}RevisionHead`},${`${resource}RevisionWrite`})`,
    )
    .get()
  if (row?.count === 0) return false
  if (row?.count !== 3) throw new Error(`Incomplete ${resource} revision migration`)
  return true
}

/**
 * Checks explicit activation separately from read-side storage availability.
 * @param db Request database.
 * @param resource Resource whose application writers are being activated.
 * @returns Whether complete storage and an enabled rollout gate exist.
 */
export async function isAdminResourceRevisionRecordingEnabled(
  db: Database,
  resource: AdminRevisionResource,
): Promise<boolean> {
  if (!(await hasAdminResourceRevisionStorage(db, resource))) return false
  const row = await db
    .select({ enabled: adminResourceRevisionRollout.enabled })
    .from(adminResourceRevisionRollout)
    .where(sql`${adminResourceRevisionRollout.resource}=${resource}`)
    .get()
  return row?.enabled ?? false
}

/**
 * Prepares baseline and final capture around an existing atomic command.
 * @param db Request database.
 * @param resource Server-selected resource type.
 * @param targets Server-built SELECT returning unique ids, including new identities.
 * @param actor Authenticated actor; omitted only for unconverted callers.
 * @param options Advance edit tokens for indirect assignment mutations.
 * @returns Statements to execute before and after all projection writes in one batch.
 * @remarks Baselines explicitly have unknown authors. No-op saves preserve the head;
 * enrolled rows reject uncaptured writes. Storage installation does not enable capture;
 * rollout is explicit and is not a rollback switch for already-enrolled rows.
 * This adapter does not authorize targets.
 */
export async function prepareAdminResourceRevisionCapture(
  db: Database,
  resource: AdminRevisionResource,
  targets: SQL,
  actor?: OrganisationRevisionActor,
  options?: { touchModifiedAt?: boolean },
): Promise<OrganisationRevisionCapture> {
  if (!actor) return { before: [], after: [] }
  if (!actor.actorId.trim()) throw new Error('Revision actor is required')
  if (!(await isAdminResourceRevisionRecordingEnabled(db, resource)))
    return { before: [], after: [] }
  const { table, revision, head, write } = contracts[resource]
  const owner = sql.identifier(`${resource}Id`)
  const token = crypto.randomUUID(),
    baselineChangeId = crypto.randomUUID(),
    changeId = crypto.randomUUID(),
    now = new Date().toISOString()
  const snapshot = adminResourceSnapshot(resource, await hasResourceLogoStorage(db))
  const current = sql`SELECT ${snapshot} FROM ${table} WHERE ${table.id}=w.${owner}`
  const changed = sql`NOT EXISTS (SELECT 1 FROM ${head} h JOIN ${revision} r ON r.id=h.currentRevisionId WHERE h.${owner}=w.${owner} AND r.content=(${current}))`
  const missingHead = sql`NOT EXISTS (SELECT 1 FROM ${head} h WHERE h.${owner}=w.${owner})`
  const before: BatchItem<'sqlite'>[] = [
    db
      .insert(write)
      .select(
        sql`SELECT t.id,${token},lower(hex(randomblob(16))),lower(hex(randomblob(16))) FROM (${targets}) t WHERE NOT EXISTS (SELECT 1 FROM ${write} active WHERE active.${owner}=t.id)`,
      ),
    db
      .insert(revisionChangeSet)
      .select(sql`SELECT ${baselineChangeId},${`system:${resource}-revision-baseline`},'migration','State captured before revision tracking',${now}
      WHERE EXISTS (SELECT 1 FROM ${write} w JOIN ${table} o ON o.id=w.${owner} WHERE w.token=${token} AND ${missingHead})`),
    db
      .insert(revision)
      .select(
        sql`SELECT w.baselineRevisionId,w.${owner},NULL,${baselineChangeId},(${current}),1 FROM ${write} w JOIN ${table} o ON o.id=w.${owner} WHERE w.token=${token} AND ${missingHead}`,
      ),
    db
      .insert(head)
      .select(
        sql`SELECT w.${owner},w.baselineRevisionId,0 FROM ${write} w JOIN ${revision} r ON r.id=w.baselineRevisionId WHERE w.token=${token}`,
      ),
    prepareRevisionCheck(
      db,
      sql`NOT EXISTS (SELECT 1 FROM ${write} w JOIN ${head} h ON h.${owner}=w.${owner} JOIN ${revision} r ON r.id=h.currentRevisionId WHERE w.token=${token} AND r.content IS NOT (${current}))`,
    ),
  ]
  const after: BatchItem<'sqlite'>[] = [
    prepareRevisionCheck(
      db,
      sql`NOT EXISTS (SELECT 1 FROM ${write} w WHERE w.token=${token} AND NOT EXISTS (SELECT 1 FROM ${table} WHERE id=w.${owner}))`,
    ),
    db
      .insert(revisionChangeSet)
      .select(
        sql`SELECT ${changeId},${actor.actorId},${actor.origin ?? 'user'},${actor.reason ?? null},${now} WHERE EXISTS (SELECT 1 FROM ${write} w WHERE w.token=${token} AND ${changed})`,
      ),
    db
      .insert(revision)
      .select(
        sql`SELECT w.revisionId,w.${owner},(SELECT currentRevisionId FROM ${head} WHERE ${owner}=w.${owner}),${changeId},(${current}),1 FROM ${write} w WHERE w.token=${token} AND ${changed}`,
      ),
    db
      .insert(head)
      .select(
        sql`SELECT w.${owner},w.revisionId,0 FROM ${write} w JOIN ${revision} r ON r.id=w.revisionId WHERE w.token=${token}`,
      )
      .onConflictDoUpdate({
        target: getTableColumns(head as SQLiteTable)[`${resource}Id`],
        set: {
          currentRevisionId: sql`excluded.currentRevisionId`,
          generation: sql`${head.generation}+1`,
        },
      }),
    ...(options?.touchModifiedAt
      ? [
          db
            .update(table)
            .set({
              modifiedAt: sql`CASE
      WHEN ${table.modifiedAt} >= strftime('%Y-%m-%dT%H:%M:%fZ','now') THEN strftime('%Y-%m-%dT%H:%M:%fZ',${table.modifiedAt},'+0.001 seconds')
      ELSE strftime('%Y-%m-%dT%H:%M:%fZ','now') END`,
            })
            .where(
              sql`${table.id} IN (SELECT w.${owner} FROM ${write} w JOIN ${revision} r ON r.id=w.revisionId WHERE w.token=${token})`,
            ),
        ]
      : []),
    db.delete(write).where(sql`${write.token}=${token}`),
  ]
  return { before, after }
}

// HISTORY READS
export { listAdminResourceHistory } from './resourceHistory'
