// Retain Feature content through attributed revisions before removing approved low-quality Locations.
import { writeFileSync } from 'node:fs'
import { sql } from 'drizzle-orm'
import { openSqliteDomain } from '../../../scripts/locations/lib/sqlite-domain'
import {
  prepareFeatureEdit,
  readCurrentFeatureRevision,
} from '../../../src/lib/db/services/featureLifecycle'
import { getAcceptedFeatureLocation } from '../../../src/lib/db/services/location'
import { prepareRevisionCheck } from '../../../src/lib/db/services/revisionBatch'
process.umask(0o077)
const [database, output] = process.argv.slice(2)
if (!database?.startsWith('.local/') || !output?.startsWith('.local/'))
  throw Error('Explicit private working database and output required')
const d = openSqliteDomain(database),
  groups = []
const actorId = 'qJpgD5f5wBMvvvLFbUOPnFfSpRiUXdaM'
try {
  const rows = d.sqlite
    .query(
      "SELECT f.id,f.projectId,fl.locationId FROM feature f JOIN featureLocation fl ON fl.featureId=f.id JOIN location l ON l.id=fl.locationId WHERE l.ownerOrganisationId IN ('HsW1a_4LNdyA','KpeoIsOhgyP-') ORDER BY f.id",
    )
    .all() as { id: string; projectId: string; locationId: string }[]
  if (rows.length !== 444) throw Error('Removal feature scope drift')
  for (const row of rows) {
    const current = await readCurrentFeatureRevision(d.db, {
      featureId: row.id,
      guard: sql`1`,
    })
    const accepted = await getAcceptedFeatureLocation(d.db, row.id, row.projectId)
    if (!current || !accepted) throw Error('Missing current removal feature')
    const prepared = await prepareFeatureEdit(d.db, {
      featureId: row.id,
      actorId,
      guard: sql`1`,
      expectedRevisionId: current.revisionId,
      expectedVersion: current.version,
      origin: 'user',
      reason:
        'Operator removed low-quality City Recorder/EUNIC Location; retain Feature content',
      identity: { actorId },
      validate: () => [],
      derive: before => {
        const next = structuredClone(before)
        next.placement.location = null
        next.detachedBrands = accepted.effective.brands ?? []
        return next
      },
    })
    if (!prepared) throw Error('Removal Feature changed')
    const queries = [prepareRevisionCheck(d.db, prepared.guard), ...prepared.statements]
    const statements = queries
      .map(q => q.toSQL())
      .map(({ sql, params }) => ({ sql, params }))
    await d.db.batch(queries as any)
    groups.push({ label: 'remove-location/detach/' + row.id, statements })
  }
  writeFileSync(output, JSON.stringify(groups), { flag: 'wx', mode: 0o600 })
  console.log('Detached Features through attributed revisions:', groups.length)
} finally {
  d.close()
}
