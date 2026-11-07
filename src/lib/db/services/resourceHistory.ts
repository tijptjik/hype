// DRIZZLE
import { sql } from 'drizzle-orm'
// REVISIONS
import { diffRevisionValues } from '#lib/revisions/diff.js'
// SERVICES
import { hasRevisionEditWindows, revisionActivityTime } from './revisionEditWindow'
import { readResourceLogoChanges } from './resourceLogoChanges'
// TYPES
import type { SQL } from 'drizzle-orm'
import type { Database } from '#lib/types.js'

// ═══════════════════════
// TABLE OF CONTENTS
// 1. Read-side storage availability and contracts
// 2. Organisation history
// 3. Hub, project and layer history
// 4. Field-definition history

export type AdminRevisionResource = 'project' | 'layer' | 'hub'
type PropertyCatalogScope = { scope: 'organisation' | 'project' | 'hub'; id: string }

/** Checks the persisted history contract without coupling reads to unfinished writers.
 * @param db Request database.
 * @param resource Server-selected history owner.
 * @returns Whether all three required storage tables exist.
 * @remarks An absent rollout is unavailable; a partial installation fails closed.
 */
async function hasHistoryStorage(
  db: Database,
  resource: AdminRevisionResource | 'organisation' | 'propertyCatalog',
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

/** Immutable logo identity and optional exact image version retained with a snapshot. */
export type HistoricalLogo = { imageId: string; imageRevisionId: string | null }

/** Extracts only recorded logo evidence, never substitutes current image data.
 * @param content Immutable resource snapshot.
 * @returns Recorded identity and optional exact revision.
 */
export function historicalLogo(content: string | null): HistoricalLogo | null {
  if (!content) return null
  const snapshot = JSON.parse(content)
  const imageId = snapshot?.record?.imageId
  if (typeof imageId !== 'string' || !imageId) return null
  const pin = snapshot.logo
  return {
    imageId,
    imageRevisionId:
      pin?.imageId === imageId && typeof pin.imageRevisionId === 'string'
        ? pin.imageRevisionId
        : null,
  }
}

/** Compare authorized snapshots and their pinned logo display metadata.
 * @param db Request database.
 * @param previous Previous immutable snapshot, if available.
 * @param content Current immutable snapshot.
 * @returns Field differences including historically recorded display modes.
 */
async function profileChanges(
  db: Database,
  previous: string | null,
  content: string,
): Promise<OrganisationHistoryPage['entries'][number]['changes']> {
  if (previous === null) return []
  const before = JSON.parse(previous)
  const after = JSON.parse(content)
  const changes = diffRevisionValues(
    { present: true, value: before },
    { present: true, value: after },
  )
  // Legacy installations without exact logo storage keep their original comparison.
  if (before.logo && after.logo) {
    const storage = await db.get<{ n: number }>(
      sql`SELECT count(*) n FROM sqlite_master WHERE type='table' AND name='imageRevision'`,
    )
    if (storage?.n) changes.push(...(await readResourceLogoChanges(db, before, after)))
  }
  return changes
}

/** A bounded history page containing immutable attribution and comparison evidence. */
export type OrganisationHistoryPage = {
  available: boolean
  recordingEnabled?: boolean
  entries: {
    id: string
    actorId: string
    /** Current profile presentation; actorId remains the immutable attribution. */
    actor: {
      name: string | null
      username: string | null
      displayUsername: string | null
      image: string | null
    } | null
    origin: string
    reason: string | null
    createdAt: string
    initial: boolean
    logo?: { before: HistoricalLogo | null; after: HistoricalLogo | null }
    fieldLabels?: Record<string, string>
    previousCreatedAt?: string | null
    changes: import('#lib/revisions/diff.js').RevisionDifference[]
  }[]
  nextCursor: number | null
}

/**
 * Reads history only while the persisted organisation remains in its authorized scope.
 * @param db Request database.
 * @param input Server-authorized identity/hub and optional pagination cursor.
 * @returns Ten newest entries and an opaque continuation cursor.
 * @remarks Callers must authorize editing first. The final query repeats scope checks;
 * public resource-read permission alone never authorizes these configuration snapshots.
 */
export async function listOrganisationHistory(
  db: Database,
  input: { organisationId: string; hubId: string | null; before?: number },
): Promise<OrganisationHistoryPage> {
  const idleWindows = await hasRevisionEditWindows(db)
  if (!(await hasHistoryStorage(db, 'organisation')))
    return { available: false, entries: [], nextCursor: null }
  const rows = await db
    .select({
      cursor: sql<number>`r.rowid`,
      id: sql<string>`r.id`,
      actorId: sql<string>`c.actorId`,
      actorProfileId: sql<string | null>`actor.id`.as('actorProfileId'),
      actorName: sql<string | null>`actor.name`.as('actorName'),
      actorUsername: sql<string | null>`actor.username`.as('actorUsername'),
      actorDisplayUsername: sql<string | null>`actor.displayUsername`.as(
        'actorDisplayUsername',
      ),
      actorImage: sql<string | null>`actor.image`.as('actorImage'),
      origin: sql<string>`c.origin`,
      reason: sql<string | null>`c.reason`,
      createdAt: revisionActivityTime(
        idleWindows,
        'organisation',
        sql`r.id`,
        sql`c.createdAt`,
      ).as('createdAt'),
      previousCreatedAt: revisionActivityTime(
        idleWindows,
        'organisation',
        sql`p.id`,
        sql`pc.createdAt`,
      ).as('previousCreatedAt'),
      content: sql<string>`r.content`,
      previous: sql<string | null>`p.content`.as('previous'),
    })
    .from(sql`organisationRevision r
    JOIN organisation o ON o.id=r.organisationId
    JOIN revisionChangeSet c ON c.id=r.changeSetId
    LEFT JOIN user actor ON actor.id=c.actorId AND c.origin='user'
    LEFT JOIN organisationRevision p ON p.id=r.previousRevisionId AND p.organisationId=r.organisationId
    LEFT JOIN revisionChangeSet pc ON pc.id=p.changeSetId`)
    .where(sql`o.id=${input.organisationId} AND o.hubId IS ${input.hubId}
      AND (${input.before ?? null} IS NULL OR r.rowid<${input.before ?? null})`)
    .orderBy(sql`r.rowid DESC`)
    .limit(11)
  return {
    available: true,
    entries: await Promise.all(
      rows.slice(0, 10).map(async row => ({
        id: row.id,
        actorId: row.actorId,
        actor:
          row.actorProfileId === null
            ? null
            : {
                name: row.actorName,
                username: row.actorUsername,
                displayUsername: row.actorDisplayUsername,
                image: row.actorImage,
              },
        origin: row.origin,
        reason: row.reason,
        createdAt: row.createdAt,
        initial: row.previous === null,
        previousCreatedAt: row.previousCreatedAt,
        logo: {
          before: historicalLogo(row.previous),
          after: historicalLogo(row.content),
        },
        changes: await profileChanges(db, row.previous, row.content),
      })),
    ),
    nextCursor: rows.length > 10 ? rows[9].cursor : null,
  }
}

/**
 * Reads immutable history inside the ancestry authorized by the remote handler.
 * @param db Request database.
 * @param input Persisted scope and bounded continuation cursor.
 * @returns Ten newest revisions with predecessor comparisons.
 * @remarks Public read access is insufficient; callers must authorize editing first.
 */
export async function listAdminResourceHistory(
  db: Database,
  input: {
    resource: AdminRevisionResource
    id: string
    hubId?: string | null
    organisationId?: string
    projectId?: string
    before?: number
  },
): Promise<OrganisationHistoryPage> {
  const idleWindows = await hasRevisionEditWindows(db)
  if (!(await hasHistoryStorage(db, input.resource)))
    return { available: false, entries: [], nextCursor: null }
  const rollout = await db
    .select({ enabled: sql<number>`enabled` })
    .from(sql`adminResourceRevisionRollout`)
    .where(sql`resource=${input.resource}`)
    .get()
  const table = sql.identifier(input.resource)
  const revision = sql.identifier(`${input.resource}Revision`)
  const owner = sql.identifier(`${input.resource}Id`)
  // Repeat ancestry in the final query so a move after authorization cannot disclose history.
  const scope =
    input.resource === 'hub'
      ? sql`o.id=${input.id}`
      : input.resource === 'project'
        ? sql`o.id=${input.id} AND o.organisationId=${input.organisationId} AND EXISTS (SELECT 1 FROM organisation a WHERE a.id=o.organisationId AND a.hubId IS ${input.hubId})`
        : sql`o.id=${input.id} AND o.organisationId=${input.organisationId} AND o.projectId=${input.projectId} AND EXISTS (SELECT 1 FROM project p JOIN organisation a ON a.id=p.organisationId WHERE p.id=o.projectId AND p.organisationId=o.organisationId AND a.hubId IS ${input.hubId})`
  const rows = await db
    .select({
      cursor: sql<number>`r.rowid`,
      id: sql<string>`r.id`,
      actorId: sql<string>`c.actorId`,
      actorProfileId: sql<string | null>`actor.id`.as('actorProfileId'),
      actorName: sql<string | null>`actor.name`.as('actorName'),
      actorUsername: sql<string | null>`actor.username`.as('actorUsername'),
      actorDisplayUsername: sql<string | null>`actor.displayUsername`.as(
        'actorDisplayUsername',
      ),
      actorImage: sql<string | null>`actor.image`.as('actorImage'),
      origin: sql<string>`c.origin`,
      reason: sql<string | null>`c.reason`,
      createdAt: revisionActivityTime(
        idleWindows,
        input.resource,
        sql`r.id`,
        sql`c.createdAt`,
      ).as('createdAt'),
      previousCreatedAt: revisionActivityTime(
        idleWindows,
        input.resource,
        sql`p.id`,
        sql`pc.createdAt`,
      ).as('previousCreatedAt'),
      content: sql<string>`r.content`,
      previous: sql<string | null>`p.content`.as('previous'),
    })
    .from(sql`${revision} r JOIN ${table} o ON o.id=r.${owner}
    JOIN revisionChangeSet c ON c.id=r.changeSetId
    LEFT JOIN user actor ON actor.id=c.actorId AND c.origin='user'
    LEFT JOIN ${revision} p ON p.id=r.previousRevisionId AND p.${owner}=r.${owner}
    LEFT JOIN revisionChangeSet pc ON pc.id=p.changeSetId`)
    .where(
      sql`${scope} AND (${input.before ?? null} IS NULL OR r.rowid<${input.before ?? null})`,
    )
    .orderBy(sql`r.rowid DESC`)
    .limit(11)
  return {
    available: true,
    recordingEnabled: Boolean(rollout?.enabled),
    entries: await Promise.all(
      rows.slice(0, 10).map(async row => ({
        id: row.id,
        actorId: row.actorId,
        actor:
          row.actorProfileId === null
            ? null
            : {
                name: row.actorName,
                username: row.actorUsername,
                displayUsername: row.actorDisplayUsername,
                image: row.actorImage,
              },
        origin: row.origin,
        reason: row.reason,
        createdAt: row.createdAt,
        previousCreatedAt: row.previousCreatedAt,
        logo: {
          before: historicalLogo(row.previous),
          after: historicalLogo(row.content),
        },
        initial: row.previous === null,
        changes: await profileChanges(db, row.previous, row.content),
      })),
    ),
    nextCursor: rows.length > 10 ? rows[9].cursor : null,
  }
}

/**
 * Keeps removed fields recognizable without changing their immutable identity paths.
 * @param before Previous snapshot.
 * @param after Current snapshot.
 * @returns Display labels keyed by stable property ID; current wording takes precedence.
 */
function catalogFieldLabels(
  before: string | null,
  after: string,
): Record<string, string> {
  const previous = before ? JSON.parse(before) : {}
  const current = JSON.parse(after)
  return Object.fromEntries(
    Object.entries({ ...previous, ...current }).map(([id, value]) => {
      const field = value as {
        record?: { key?: string }
        i18n?: Record<string, { label?: string }>
      }
      return [id, field.i18n?.en?.label || field.record?.key || id]
    }),
  )
}

/**
 * Reads organisation-owned catalogue history after editor authorization.
 * @param db Request database.
 * @param input Authorized organisation/hub and optional cursor.
 * @returns Ten revisions with exact predecessor comparisons, retaining removed definitions.
 * @remarks The query repeats current hub scope; inherited hub/project catalogues are excluded.
 */
export async function listOrganisationPropertyHistory(
  db: Database,
  input: { organisationId: string; hubId: string | null; before?: number },
): Promise<OrganisationHistoryPage> {
  return listPropertyCatalogHistory(
    db,
    { scope: 'organisation', id: input.organisationId },
    sql`EXISTS(SELECT 1 FROM organisation WHERE id=${input.organisationId} AND hubId IS ${input.hubId})`,
    input.before,
  )
}

/**
 * Reads one catalogue using a server-built current-ancestry predicate.
 * @param db Request database.
 * @param target Authorized property owner.
 * @param guard SQL scope fence derived from persisted authorization probes.
 * @param before Optional bounded cursor.
 * @returns Attributed field changes and readable labels, retaining deleted definitions.
 */
export async function listPropertyCatalogHistory(
  db: Database,
  target: PropertyCatalogScope,
  guard: SQL,
  before?: number,
): Promise<OrganisationHistoryPage> {
  const idleWindows = await hasRevisionEditWindows(db)
  if (!(await hasHistoryStorage(db, 'propertyCatalog')))
    return { available: false, entries: [], nextCursor: null }
  const rows = await db
    .select({
      cursor: sql<number>`r.rowid`,
      id: sql<string>`r.id`,
      actorId: sql<string>`c.actorId`,
      actorProfileId: sql<string | null>`actor.id`.as('actorProfileId'),
      actorName: sql<string | null>`actor.name`.as('actorName'),
      actorUsername: sql<string | null>`actor.username`.as('actorUsername'),
      actorDisplayUsername: sql<string | null>`actor.displayUsername`.as(
        'actorDisplayUsername',
      ),
      actorImage: sql<string | null>`actor.image`.as('actorImage'),
      origin: sql<string>`c.origin`,
      reason: sql<string | null>`c.reason`,
      createdAt: revisionActivityTime(
        idleWindows,
        'propertyCatalog',
        sql`r.id`,
        sql`c.createdAt`,
      ).as('createdAt'),
      previousCreatedAt: revisionActivityTime(
        idleWindows,
        'propertyCatalog',
        sql`p.id`,
        sql`pc.createdAt`,
      ).as('previousCreatedAt'),
      content: sql<string>`r.content`,
      previous: sql<string | null>`p.content`.as('previous'),
    })
    .from(sql`propertyCatalogRevision r
    JOIN revisionChangeSet c ON c.id=r.changeSetId
    LEFT JOIN user actor ON actor.id=c.actorId AND c.origin='user'
    LEFT JOIN propertyCatalogRevision p ON p.id=r.previousRevisionId AND p.scope=r.scope AND p.resourceId=r.resourceId
    LEFT JOIN revisionChangeSet pc ON pc.id=p.changeSetId`)
    .where(sql`r.scope=${target.scope} AND r.resourceId=${target.id} AND (${guard})
      AND (${before ?? null} IS NULL OR r.rowid<${before ?? null})`)
    .orderBy(sql`r.rowid DESC`)
    .limit(11)
  return {
    available: true,
    entries: rows.slice(0, 10).map(row => ({
      id: row.id,
      fieldLabels: catalogFieldLabels(row.previous, row.content),
      actorId: row.actorId,
      actor:
        row.actorProfileId === null
          ? null
          : {
              name: row.actorName,
              username: row.actorUsername,
              displayUsername: row.actorDisplayUsername,
              image: row.actorImage,
            },
      origin: row.origin,
      reason: row.reason,
      createdAt: row.createdAt,
      previousCreatedAt: row.previousCreatedAt,
      initial: row.previous === null,
      changes:
        row.previous === null
          ? []
          : diffRevisionValues(
              { present: true, value: JSON.parse(row.previous) },
              { present: true, value: JSON.parse(row.content) },
            ),
    })),
    nextCursor: rows.length > 10 ? rows[9].cursor : null,
  }
}
