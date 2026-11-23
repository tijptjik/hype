// NODE
import { createHash } from 'node:crypto'
import { readFileSync, realpathSync, writeFileSync } from 'node:fs'
// DOMAIN
import { openSqliteDomain } from '../locations/lib/sqlite-domain'
import { linkInitialFeatureLocation } from '../../src/lib/db/services/locationLink'
import { relinkFeatureLocation } from '../../src/lib/db/services/locationRelink'
import { retainCanonicalAddress } from '../../src/lib/db/services/addressCanonical'
import { createLocalLocationAddress } from '../../src/lib/addresses/localLocationAddress'
import { appendLocationRelationship } from '../../src/lib/db/services/locationRelationships'
import {
  proposeLocationPlacement,
  decideLocationPlacement,
} from '../../src/lib/db/services/locationPlacement'
// TYPES
import type { Point } from 'geojson'

type Match = {
  locationId: string
  revisionId: string
  unitRef: string
  unitLocationId: string
  unitCode: string
  geometry: Point
  sourceUrl: string
  floor: { names: Record<string, string> }
  section: { names: Record<string, string> }
}
type Row = {
  sourceId: string
  featureId: string
  projectId: string
  modifiedAt: string
  currentRevisionId: string
  locationId: string | null
  associationVersion: string | null
  status: string
  method?: string
  station: string
  match?: Match
  source: { name_en: string }
  distancesMetres?: unknown
  exitEntries?: unknown
}
type Plan = { inputs: Record<string, string>; rows: Row[] }

/** Apply explicit reviewed matches through immutable association and placement services.
 * @returns A per-Feature receipt, with failures rolled back to their savepoint.
 * @remarks Local only, rollback unless --apply. Rehearsal and live runs use the same
 * source hashes and Feature/Location revision guards. No source identities are merged.
 */
async function main(): Promise<void> {
  const [database, planPath, receiptPath, flag] = process.argv.slice(2)
  if (!database || !planPath || !receiptPath || (flag && flag !== '--apply'))
    throw Error('DATABASE PLAN RECEIPT [--apply]')
  const path = realpathSync(database)
  if (
    !path.startsWith(realpathSync('.local/places') + '/') &&
    !path.startsWith(realpathSync('.wrangler/state/v3/d1') + '/')
  )
    throw Error('Local database only')
  const plan = JSON.parse(readFileSync(planPath, 'utf8')) as Plan
  for (const [file, hash] of Object.entries(plan.inputs)) {
    if (createHash('sha256').update(readFileSync(file)).digest('hex') !== hash)
      throw Error('Source changed: ' + file)
  }
  const domain = openSqliteDomain(path)
  const { sqlite, db } = domain
  const actorId = 'hype-local-agent-admin'
  const now = new Date().toISOString()
  const receipt: Record<string, unknown>[] = []
  sqlite.exec('BEGIN IMMEDIATE')
  try {
    // Preserve an exact before-image under the same write lock as the batch.
    if (flag === '--apply')
      writeFileSync(receiptPath + '.before.sqlite', sqlite.serialize(), {
        flag: 'wx',
        mode: 0o600,
      })
    for (const row of plan.rows.filter(row => row.status === 'matched')) {
      const match = row.match!
      sqlite.exec('SAVEPOINT feature_match')
      try {
        const parent = sqlite
          .query(
            `SELECT f.id,f.projectId,f.modifiedAt,f.currentRevisionId,b.locationId,b.version FROM feature f LEFT JOIN featureLocation b ON b.featureId=f.id WHERE f.id=?`,
          )
          .get(row.featureId) as {
          id: string
          projectId: string
          modifiedAt: string
          currentRevisionId: string
          locationId: string | null
          version: string | null
        }
        if (
          !parent ||
          parent.projectId !== row.projectId ||
          parent.modifiedAt !== row.modifiedAt ||
          parent.currentRevisionId !== row.currentRevisionId ||
          parent.locationId !== row.locationId ||
          parent.version !== row.associationVersion
        )
          throw Error('Feature changed since matching plan')
        const revision = sqlite
          .query(
            'SELECT id FROM locationRevisionContent WHERE locationId=? ORDER BY version DESC LIMIT 1',
          )
          .get(match.locationId) as { id: string } | null
        if (revision?.id !== match.revisionId)
          throw Error('Establishment changed since matching plan')
        if (parent.locationId !== match.locationId) {
          const input = {
            featureId: row.featureId,
            projectId: row.projectId,
            locationId: match.locationId,
            revisionId: match.revisionId,
            expectedFeatureModifiedAt: parent.modifiedAt,
            actorId,
          }
          const linked = parent.version
            ? await relinkFeatureLocation(db, {
                ...input,
                expectedRevision: parent.version,
              })
            : await linkInitialFeatureLocation(db, input)
          if (linked.status !== 'linked')
            throw Error('Association: ' + JSON.stringify(linked))
        }
        const unit = sqlite
          .query(
            'SELECT r.id,r.rawSource FROM locationRevisionContent r JOIN locationCanonicalDraft d ON d.locationId=r.locationId WHERE d.sourceKey=? AND d.locationId=? ORDER BY r.version DESC LIMIT 1',
          )
          .get(match.unitRef, match.unitLocationId) as {
          id: string
          rawSource: string
        } | null
        if (!unit) throw Error('Exact unit source identity missing')
        const existing = sqlite
          .query(
            "SELECT * FROM locationOccupancyHead WHERE establishmentLocationId=? AND assertionState='asserted' AND occupancyState='current'",
          )
          .all(match.locationId) as {
          id: string
          relationshipId: string
          containerLocationId: string
          scopeOrganisationId: string | null
          observedAt: string | null
        }[]
        if (
          existing.length > 1 ||
          (existing[0] && existing[0].containerLocationId !== match.unitLocationId)
        )
          throw Error('Conflicting existing occupancy; needs review')
        const components = createLocalLocationAddress()
        components.scope = 'unknown'
        components.i18n.en = {
          formattedAddress: [
            match.unitCode,
            match.floor.names.en,
            match.section.names.en,
            row.station + ' MTR Station',
          ]
            .filter(Boolean)
            .join(', '),
        }
        const address = await retainCanonicalAddress(db, {
          sourceKey: {
            provider: 'hype-reviewed-landsd',
            family: 'mtr-unit-address',
            id: match.unitRef,
          },
          components,
          geometry: match.geometry,
          sourceVersion: unit.id,
          sourceReferences: [
            {
              provider: 'landsd',
              dataset: '3d-indoor-mtr-station-map',
              apiVersion: null,
              releaseId: null,
              snapshotId: null,
            },
          ],
          rawSource: {
            unitRef: match.unitRef,
            unitRevisionId: unit.id,
            description:
              'Display address assembled from reviewed source kiosk, floor and station labels; no upstream publication claimed.',
          },
        })
        const occupancyId = crypto.randomUUID()
        const reason = `User-authorized Breadline MTR placement: donor ${row.sourceId}, ${match.unitCode}, ${row.method}. Source labels and occupancy reviewed; not an on-site survey.`
        await appendLocationRelationship(
          db,
          {
            table: 'locationOccupancy',
            id: occupancyId,
            relationshipId: existing[0]?.relationshipId ?? occupancyId,
            previousRevisionId: existing[0]?.id ?? null,
            scopeOrganisationId: existing[0]?.scopeOrganisationId ?? null,
            assertionState: 'asserted',
            observedAt: existing[0]?.observedAt ?? now,
            verifiedAt: now,
            effectiveFrom: null,
            effectiveTo: null,
            establishmentLocationId: match.locationId,
            containerLocationId: match.unitLocationId,
            addressRevisionId: address.id,
            occupancyState: 'current',
            evidence: [
              {
                source: {
                  kind: 'record',
                  resourceType: 'locationRevision',
                  revisionId: unit.id,
                },
                supports: ['containerLocationId', 'occupancyState'],
                quotedText: match.unitCode,
                description: reason,
                sourceDate: null,
              },
              {
                source: { kind: 'url', url: match.sourceUrl, accessedAt: now },
                supports: ['establishmentLocationId', 'occupancyState'],
                quotedText: row.source.name_en,
                description: reason,
                sourceDate: null,
              },
            ],
          },
          actorId,
        )
        const proposal = await proposeLocationPlacement(db, {
          featureId: row.featureId,
          projectId: row.projectId,
          occupancyRevisionId: occupancyId,
        })
        if (!proposal) throw Error('No proposal: policy or target requires review')
        const result = await decideLocationPlacement(db, {
          featureId: row.featureId,
          projectId: row.projectId,
          proposalId: proposal.id,
          expectedRevision: proposal.associationRevision,
          expectedFeatureModifiedAt: proposal.featureModifiedAt,
          actorId,
          reason,
          decision: {
            action: 'move',
            addressChoice: 'accept',
            unitDetails: 'clear',
            directions: 'keep',
            useDestinationPin: true,
          },
        })
        if (result.status !== 'applied')
          throw Error('Placement: ' + JSON.stringify(result))
        const accepted = sqlite
          .query(
            'SELECT locationId,occupancyRevisionId,addressRevisionId,membershipRevisionIds FROM featureLocation WHERE featureId=?',
          )
          .get(row.featureId) as Record<string, unknown>
        if (
          accepted.locationId !== match.locationId ||
          accepted.occupancyRevisionId !== occupancyId ||
          accepted.addressRevisionId !== address.id
        )
          throw Error('Accepted chain mismatch')
        sqlite.exec('RELEASE feature_match')
        receipt.push({
          featureId: row.featureId,
          sourceId: row.sourceId,
          unit: match.unitCode,
          status: 'applied',
          method: row.method,
          accepted,
        })
      } catch (error) {
        sqlite.exec('ROLLBACK TO feature_match')
        sqlite.exec('RELEASE feature_match')
        receipt.push({
          featureId: row.featureId,
          sourceId: row.sourceId,
          unit: match.unitCode,
          status: 'review',
          reason: error instanceof Error ? error.stack : String(error),
        })
      }
    }
    const failures = sqlite.query('PRAGMA foreign_key_check').all()
    if (failures.length) throw Error('Foreign key violations')
    sqlite.exec(flag === '--apply' ? 'COMMIT' : 'ROLLBACK')
    writeFileSync(
      receiptPath,
      JSON.stringify({ applied: flag === '--apply', receipt }, null, 2) + '\n',
      { mode: 0o600 },
    )
    console.log(
      JSON.stringify(
        receipt.reduce(
          (counts, r) => {
            const key = String(r.status)
            counts[key] = (counts[key] ?? 0) + 1
            return counts
          },
          {} as Record<string, number>,
        ),
      ),
    )
    for (const r of receipt.filter(r => r.status !== 'applied'))
      console.log(JSON.stringify(r))
  } catch (error) {
    if (sqlite.inTransaction) sqlite.exec('ROLLBACK')
    throw error
  } finally {
    domain.close()
  }
}
await main()
