// DRIZZLE
import { and, eq, sql } from 'drizzle-orm'
// SCHEMA
import {
  property,
  propertyI18n,
  propertyValue,
  propertyValueI18n,
} from '../schema/property'
import { revisionChangeSet } from '../schema/featureRevision'
import {
  propertyCatalogRevision as revision,
  propertyCatalogRevisionHead as head,
  propertyCatalogRevisionWrite as marker,
} from '../schema/propertyCatalogRevision'
// SERVICES
import { isAdminResourceRevisionRecordingEnabled } from './adminResourceRevision'
import { rowSnapshot } from './revisionSnapshot'
import { prepareRevisionCheck } from './revisionBatch'
// TYPES
import type { SQL } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import type { Database } from '#lib/types.js'
import type {
  OrganisationRevisionActor,
  OrganisationHistoryPage,
} from './organisationRevision'

// ═══════════════════════
// TABLE OF CONTENTS
// 1. Snapshot and availability
// 2. Atomic catalogue capture
// 3. Scoped organisation history

export type PropertyCatalogScope = {
  scope: 'organisation' | 'project' | 'hub'
  id: string
}

/**
 * Checks the additive catalogue migration without caching deployment state.
 * @param db Request database.
 * @returns Whether the complete storage is present; partial installation fails closed.
 */
export async function hasPropertyCatalogRevisionStorage(
  db: Database,
): Promise<boolean> {
  const row = await db
    .select({ count: sql<number>`count(*)` })
    .from(sql`sqlite_master`)
    .where(
      sql`type='table' AND name IN ('propertyCatalogRevision','propertyCatalogRevisionHead','propertyCatalogRevisionWrite')`,
    )
    .get()
  if (row?.count === 0) return false
  if (row?.count !== 3)
    throw new Error('Incomplete property catalog revision migration')
  return true
}

/**
 * Captures all owned definitions with stable ordering and typed values.
 * @param target Trusted resource scope, not inherited field assignments.
 * @returns Single-row SQL expression; deleted fields disappear from the next snapshot.
 */
export function propertyCatalogSnapshot(target: PropertyCatalogScope): SQL {
  const owner =
    target.scope === 'organisation'
      ? property.organisationId
      : target.scope === 'hub'
        ? property.hubId
        : property.projectId
  const record = rowSnapshot(property, ['id', 'createdAt', 'modifiedAt'])
  const translation = rowSnapshot(propertyI18n, ['propertyId', 'locale'])
  const option = rowSnapshot(propertyValue, [
    'id',
    'propertyId',
    'createdAt',
    'modifiedAt',
  ])
  const optionTranslation = rowSnapshot(propertyValueI18n, [
    'propertyValueId',
    'locale',
  ])
  return sql`(SELECT json_group_object(id,json(content)) FROM (
    SELECT ${property.id} AS id,json_object(
      'record',json(${record}),
      'i18n',json((SELECT json_group_object(locale,json(content)) FROM (
        SELECT ${propertyI18n.locale} AS locale,${translation} AS content FROM ${propertyI18n}
        WHERE ${propertyI18n.propertyId}=${property.id} ORDER BY ${propertyI18n.locale}))),
      'values',json((SELECT json_group_object(id,json(content)) FROM (
        SELECT ${propertyValue.id} AS id,json_object('record',json(${option}),'i18n',
          json((SELECT json_group_object(locale,json(content)) FROM (
            SELECT ${propertyValueI18n.locale} AS locale,${optionTranslation} AS content FROM ${propertyValueI18n}
            WHERE ${propertyValueI18n.propertyValueId}=${propertyValue.id} ORDER BY ${propertyValueI18n.locale})))) AS content
        FROM ${propertyValue} WHERE ${propertyValue.propertyId}=${property.id} ORDER BY ${propertyValue.id})))
    ) AS content FROM ${property}
    WHERE ${property.scope}=${target.scope} AND ${owner}=${target.id} ORDER BY ${property.id}))`
}

/**
 * Wraps the existing catalogue replacement in immutable before/after evidence.
 * @param db Request database.
 * @param target Server-authorized owner.
 * @param actor Trusted editor; legacy unconverted writers omit it and fail on enrolled scopes.
 * @returns Statements to execute on either side of the existing writes in one transaction.
 * @remarks The enclosing parent form owns concurrency and authorization. Marker insertion
 * serializes captures; snapshot comparison detects an untracked projection change.
 */
export async function preparePropertyCatalogCapture(
  db: Database,
  target: PropertyCatalogScope,
  actor?: OrganisationRevisionActor,
): Promise<{ before: BatchItem<'sqlite'>[]; after: BatchItem<'sqlite'>[] }> {
  if (!actor) return { before: [], after: [] }
  if (
    target.scope !== 'organisation' &&
    !(await isAdminResourceRevisionRecordingEnabled(db, target.scope))
  )
    return { before: [], after: [] }
  if (!actor.actorId.trim()) throw new Error('Catalog revision actor is required')
  if (!(await hasPropertyCatalogRevisionStorage(db))) return { before: [], after: [] }
  const baseline = crypto.randomUUID(),
    baselineChange = crypto.randomUUID(),
    id = crypto.randomUUID(),
    change = crypto.randomUUID(),
    token = crypto.randomUUID(),
    now = new Date().toISOString()
  const scope = and(eq(head.scope, target.scope), eq(head.resourceId, target.id))
  const snapshot = propertyCatalogSnapshot(target)
  const noHead = sql`NOT EXISTS (SELECT 1 FROM propertyCatalogRevisionHead WHERE scope=${target.scope} AND resourceId=${target.id})`
  const same = sql`EXISTS (SELECT 1 FROM propertyCatalogRevisionHead h JOIN propertyCatalogRevision r ON r.id=h.currentRevisionId
    WHERE h.scope=${target.scope} AND h.resourceId=${target.id} AND r.content=${snapshot})`
  return {
    before: [
      db.insert(marker).values({ scope: target.scope, resourceId: target.id, token }),
      db
        .insert(revisionChangeSet)
        .select(
          sql`SELECT ${baselineChange},'system:property-catalog-baseline','migration','Field definitions captured before revision tracking',${now} WHERE ${noHead}`,
        ),
      db
        .insert(revision)
        .select(
          sql`SELECT ${baseline},${target.scope},${target.id},NULL,${baselineChange},${snapshot} WHERE ${noHead}`,
        ),
      db
        .insert(head)
        .select(sql`SELECT ${target.scope},${target.id},${baseline},0 WHERE ${noHead}`),
      prepareRevisionCheck(db, same),
    ],
    after: [
      db
        .insert(revisionChangeSet)
        .select(
          sql`SELECT ${change},${actor.actorId},${actor.origin ?? 'user'},${actor.reason ?? 'Field definitions updated'},${now} WHERE NOT ${same}`,
        ),
      db
        .insert(revision)
        .select(sql`SELECT ${id},${target.scope},${target.id},h.currentRevisionId,${change},${snapshot}
        FROM propertyCatalogRevisionHead h WHERE h.scope=${target.scope} AND h.resourceId=${target.id} AND NOT ${same}`),
      db
        .update(head)
        .set({ currentRevisionId: id, generation: sql`${head.generation}+1` })
        .where(
          and(
            scope,
            sql`EXISTS (SELECT 1 FROM propertyCatalogRevision WHERE id=${id})`,
          ),
        ),
      db
        .delete(marker)
        .where(
          and(
            eq(marker.scope, target.scope),
            eq(marker.resourceId, target.id),
            eq(marker.token, token),
          ),
        ),
    ],
  }
}

// HISTORY READS
export {
  listOrganisationPropertyHistory,
  listPropertyCatalogHistory,
} from './resourceHistory'
