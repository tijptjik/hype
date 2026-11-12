// NODE
import { existsSync, renameSync } from 'node:fs'
import { resolve } from 'node:path'
// DRIZZLE
import { sql } from 'drizzle-orm'
// REVISIONS
import { cacheRevisionMedia } from '../revisions/cache-media'
import { enrollLegacyRevisions } from '../revisions/enroll'
import { rehearseFeatureLifecycle } from './feature-lifecycle/rehearse'
import { openSqliteDomain } from '../locations/lib/sqlite-domain'
import { prepareOrganisationRevisionCapture } from '../../src/lib/db/services/organisationRevision'
import { prepareAdminResourceRevisionCapture } from '../../src/lib/db/services/adminResourceRevision'
import { preparePropertyCatalogCapture } from '../../src/lib/db/services/propertyCatalogRevision'
import { enrollResourceLogo } from '../../src/lib/db/services/resourceLogoRevision'

/** Initialize revision baselines in a private local rebuild, then convert its Feature lifecycle.
 * @param database Prepared local SQLite file; never a remote binding.
 * @param directory Private rebuild receipt directory.
 * @returns Aggregate media, enrollment and lifecycle receipts.
 * @remarks Media reads verify exact source bytes; missing evidence prevents installation.
 */
export async function prepareLocalRevisions(
  database: string,
  directory: string,
): Promise<Record<string, unknown>> {
  const media = resolve('.local/revision-media-cache')
  const cached = await cacheRevisionMedia(database, media, { baselineOnly: true })
  if (cached.blocked)
    throw new Error(
      `${cached.blocked} revision media sources need repair; see ${media}/receipt.json`,
    )
  const enrollment = await enrollLegacyRevisions(
    database,
    media,
    resolve(directory, 'revision-enrollment.json'),
    undefined,
    { baselineOnly: true },
  )
  if (enrollment.blocked)
    throw new Error('Revision enrollment incomplete; inspect revision-enrollment.json')
  const domain = openSqliteDomain(database)
  try {
    domain.sqlite.exec('UPDATE adminResourceRevisionRollout SET enabled=1')
    // Logos share verified immutable image evidence, while resource history owns their selection.
    const logos = domain.sqlite
      .query(
        'SELECT DISTINCT imageId id FROM organisation WHERE imageId IS NOT NULL UNION SELECT imageId FROM project WHERE imageId IS NOT NULL UNION SELECT imageId FROM hub WHERE imageId IS NOT NULL',
      )
      .all() as { id: string }[]
    for (const { id } of logos) {
      const revisions = domain.sqlite
        .query(
          'SELECT r.id FROM imageRevision r WHERE imageId=? AND NOT EXISTS(SELECT 1 FROM imageRevision n WHERE n.previousRevisionId=r.id)',
        )
        .all(id) as { id: string }[]
      if (
        revisions.length !== 1 ||
        !(await enrollResourceLogo(domain.db, {
          imageId: id,
          imageRevisionId: revisions[0].id,
          guard: sql`1`,
          actorId: 'system:local-rebuild',
        }))
      )
        throw new Error('Local resource logo baseline unavailable')
    }
    const actor = {
      actorId: 'system:local-rebuild',
      origin: 'system' as const,
      reason: 'Initial local revision baseline from production export',
    }
    for (const resource of ['organisation', 'project', 'layer', 'hub'] as const) {
      const rows = domain.sqlite
        .query(`SELECT id FROM ${resource} ORDER BY id`)
        .all() as { id: string }[]
      for (const { id } of rows) {
        const scope = sql`SELECT id FROM ${sql.identifier(resource)} WHERE id=${id}`
        const capture =
          resource === 'organisation'
            ? await prepareOrganisationRevisionCapture(domain.db, scope, actor)
            : await prepareAdminResourceRevisionCapture(
                domain.db,
                resource,
                scope,
                actor,
              )
        if (capture.before.length)
          await domain.db.batch([...capture.before, ...capture.after] as never)
        if (resource !== 'layer') {
          const catalog = await preparePropertyCatalogCapture(
            domain.db,
            { scope: resource, id },
            actor,
          )
          if (catalog.before.length)
            await domain.db.batch([...catalog.before, ...catalog.after] as never)
        }
      }
    }
  } finally {
    domain.close()
  }
  const converted = resolve(directory, 'revision-lifecycle.sqlite')
  // Preserve failed rehearsals as evidence while allowing a fresh isolated retry.
  if (existsSync(converted)) renameSync(converted, `${converted}.failed-${Date.now()}`)
  const lifecycle = await rehearseFeatureLifecycle(database, converted)
  renameSync(database, resolve(directory, 'before-revision-lifecycle.sqlite'))
  renameSync(converted, database)
  return { cached, enrollment, lifecycle }
}
