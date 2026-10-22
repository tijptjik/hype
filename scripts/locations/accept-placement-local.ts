// Refs #194 — operational decisions on an isolated copy of development D1.
// NODE
import { mkdirSync, writeFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
// DATABASE
import { getPlatformProxy } from 'wrangler'
import { drizzle } from 'drizzle-orm/d1'
import { sql } from 'drizzle-orm'
// DOMAIN
import { createLocalLocationAddress } from '../../src/lib/addresses/localLocationAddress'
import { retainCanonicalAddress } from '../../src/lib/db/services/addressCanonical'
import { appendLocationRelationship } from '../../src/lib/db/services/locationRelationships'
import {
  proposeLocationPlacement,
  decideLocationPlacement,
  reconcileLocationPlacements,
} from '../../src/lib/db/services/locationPlacement'
import {
  readRelationshipPage,
  reorderLocationAddresses,
} from '../../src/lib/db/services/locationRelationshipReview'
// TYPES
import type { Database } from '../../src/lib/types'

/** Fail rather than issue a misleading successful receipt.
 * @param value Required invariant. @param message Failure context. @returns Nothing.
 */
function ensure(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message)
}

/** Exercise synthetic starting fixtures using real domain writes on an isolated local binding.
 * @returns Private before-image and persisted decision receipts.
 * @remarks Never writes to the normal development database or uses remote bindings. Each run copies
 * fresh starting fixtures into private state; failed runs retain their copy and receipt.
 */
async function main(): Promise<void> {
  ensure(
    process.argv.includes('--apply'),
    'Pass --apply to exercise development fixture decisions',
  )
  ensure(
    !process.env.HYPE_DEV_STATE && !process.env.CLOUDFLARE_ENV,
    'Use normal local development only',
  )
  process.umask(0o077)
  const stamp = new Date().toISOString().replaceAll(':', '-')
  const output = resolve('.local/locations/operational-acceptance', stamp)
  mkdirSync(output, { recursive: true })
  const database = resolve(
    '.wrangler/state/v3/d1/miniflare-D1DatabaseObject/d3080fe932e72db09a66987b4bc33e3301f57365daef263894a0551146999c8f.sqlite',
  )
  const backup = spawnSync('python3', [
    '-c',
    'import sqlite3,sys; s=sqlite3.connect("file:"+sys.argv[1]+"?mode=ro",uri=True); d=sqlite3.connect(sys.argv[2]); s.backup(d); d.close(); s.close()',
    database,
    resolve(output, 'before.sqlite'),
  ])
  ensure(backup.status === 0, `Backup failed: ${backup.stderr}`)
  // Keep synthetic policy layers out of the application database, including on failure.
  const state = resolve(output, 'state/v3')
  const isolatedDatabase = resolve(
    state,
    'd1/miniflare-D1DatabaseObject',
    basename(database),
  )
  mkdirSync(resolve(isolatedDatabase, '..'), { recursive: true })
  const copy = spawnSync('python3', [
    '-c',
    'import sqlite3,sys; s=sqlite3.connect(sys.argv[1]); d=sqlite3.connect(sys.argv[2]); s.backup(d); d.close(); s.close()',
    resolve(output, 'before.sqlite'),
    isolatedDatabase,
  ])
  ensure(copy.status === 0, `Isolated copy failed: ${copy.stderr}`)
  const platform = await getPlatformProxy<{ DB: D1Database }>({
    configPath: './wrangler.local.toml',
    remoteBindings: false,
    persist: { path: state },
  })
  const receipts: unknown[] = []
  try {
    const db = drizzle(platform.env.DB) as Database
    const projectId = 'vGBvWfSZNELM'
    const organisationId = 'KpeoIsOhgyP-'
    const actorId = 'hype-local-agent-admin'
    const untouched = () =>
      db.all(
        sql`SELECT id,modifiedAt,geometry,layerId FROM feature WHERE id NOT LIKE 'lifecycle-demo-%' ORDER BY id`,
      )
    const before = JSON.stringify(await untouched())
    // Reject an already exercised or unexpectedly published fixture set before any writes.
    for (const letter of ['o', 'p', 'q']) {
      const id = `lifecycle-demo-${letter}-feature`
      const row = await db.get<{
        version: string
        isPublished: number
        projectId: string
      }>(
        sql`SELECT fl.version,f.isPublished,f.projectId FROM feature f JOIN featureLocation fl ON fl.featureId=f.id WHERE f.id=${id}`,
      )
      ensure(
        row?.version === `lifecycle-demo-${letter}-accepted` &&
          row.isPublished === 0 &&
          row.projectId === projectId,
        `${letter}: requires fresh unpublished starting fixture`,
      )
    }
    for (const [letter, policy] of [
      ['o', 'fixed'],
      ['p', 'review'],
      ['q', 'follow'],
    ] as const) {
      const prefix = `lifecycle-demo-${letter}`
      const featureId = `${prefix}-feature`
      const initial = await db.get<{ version: string }>(
        sql`SELECT version FROM featureLocation WHERE featureId=${featureId}`,
      )
      ensure(
        initial?.version === `${prefix}-accepted`,
        `${letter}: requires fresh starting fixture`,
      )
      // Only the synthetic Feature moves to a synthetic unpublished policy Layer.
      const layerId = `${prefix}-acceptance-layer`
      await db.run(
        sql`INSERT INTO layer(id,organisationId,projectId,relocationPolicy) VALUES(${layerId},${organisationId},${projectId},${policy}) ON CONFLICT(id) DO NOTHING`,
      )
      await db.run(
        sql`INSERT INTO layerI18n(layerId,locale,name,nameShort) VALUES(${layerId},'en',${`Acceptance: ${policy}`},${`Acceptance: ${policy}`}) ON CONFLICT(layerId,locale) DO NOTHING`,
      )
      await db.run(
        sql`UPDATE feature SET layerId=${layerId} WHERE id=${featureId} AND projectId=${projectId} AND isPublished=0`,
      )
      const components = createLocalLocationAddress()
      components.scope = 'building'
      components.i18n.en = {
        formattedAddress: '1 Synthetic Acceptance Street',
        streetName: 'Synthetic Acceptance Street',
        buildingNumberExpression: '1',
      }
      const address = await retainCanonicalAddress(db, {
        sourceKey: {
          provider: 'saanseoi',
          family: 'addresses',
          id: `${prefix}-acceptance-address`,
        },
        components,
        geometry: { type: 'Point', coordinates: [114.17, 22.31] },
        sourceVersion: 'synthetic-v1',
        sourceReferences: [
          {
            provider: 'saanseoi',
            dataset: 'addresses',
            apiVersion: 'v1',
            releaseId: 'synthetic-acceptance',
            snapshotId: 'synthetic-acceptance',
          },
        ],
        rawSource: { synthetic: true, purpose: 'operational acceptance' },
      })
      const occupancyRevisionId = `${prefix}-evidenced-episode`
      await appendLocationRelationship(
        db,
        {
          table: 'locationOccupancy',
          id: occupancyRevisionId,
          relationshipId: `${prefix}-new-episode`,
          previousRevisionId: `${prefix}-new-episode`,
          scopeOrganisationId: null,
          assertionState: 'asserted',
          observedAt: new Date().toISOString(),
          verifiedAt: new Date().toISOString(),
          effectiveFrom: null,
          effectiveTo: null,
          establishmentLocationId: `${prefix}-shop`,
          containerLocationId: `${prefix}-destination`,
          addressRevisionId: address.id,
          occupancyState: 'current',
          evidence: [
            {
              source: {
                kind: 'record',
                resourceType: 'addressRevision',
                revisionId: address.id,
              },
              supports: ['occupancyState'],
              quotedText: null,
              description:
                'Synthetic occupancy evidence for operational acceptance; not a real-world claim.',
              sourceDate: null,
            },
          ],
        },
        actorId,
      )
      const proposal = await proposeLocationPlacement(db, {
        featureId,
        projectId,
        occupancyRevisionId,
      })
      if (policy === 'fixed') {
        ensure(proposal === null, 'Fixed generated a relocation proposal')
      } else if (policy === 'review') {
        ensure(proposal, 'Review did not generate a proposal')
        const input = {
          featureId,
          projectId,
          proposalId: proposal.id,
          expectedRevision: proposal.associationRevision,
          expectedFeatureModifiedAt: proposal.featureModifiedAt,
          actorId,
          reason: 'Synthetic acceptance',
        }
        const later = await decideLocationPlacement(db, {
          ...input,
          decision: { action: 'later' },
        })
        ensure(later.status === 'deferred', 'Review later failed')
        const keep = await decideLocationPlacement(db, {
          ...input,
          decision: { action: 'keep' },
        })
        ensure(keep.status === 'rejected', 'Keep here failed')
        const replay = await reconcileLocationPlacements(db, {
          locationId: `${prefix}-shop`,
          actorId,
        })
        ensure(replay.applied === 0, 'Rejected placement moved on reconciliation')
        receipts.push({ scenario: letter, later, keep, replay })
      } else {
        const applied = await reconcileLocationPlacements(db, {
          locationId: `${prefix}-shop`,
          actorId,
        })
        ensure(
          applied.applied === 1,
          `Follow failed: ${JSON.stringify({ applied, proposal })}`,
        )
        const binding = await db.get<{ occupancyRevisionId: string }>(
          sql`SELECT * FROM featureLocation WHERE featureId=${featureId}`,
        )
        ensure(
          binding?.occupancyRevisionId === occupancyRevisionId,
          'Accepted occupancy not persisted',
        )
        const history = await db.all(
          sql`SELECT * FROM featureLocationHistory WHERE featureId=${featureId} AND adoptionProposalId IS NOT NULL`,
        )
        ensure(history.length > 0, 'Move did not preserve accepted history')
        const replay = await reconcileLocationPlacements(db, {
          locationId: `${prefix}-shop`,
          actorId,
        })
        ensure(replay.applied === 0, 'Follow replay wrote again')
        receipts.push({ scenario: letter, applied, replay, binding, history })
      }
      if (policy !== 'follow') {
        const binding = await db.get<{ version: string }>(
          sql`SELECT version FROM featureLocation WHERE featureId=${featureId}`,
        )
        ensure(
          binding?.version === initial.version,
          `${policy} changed accepted placement`,
        )
      }
      receipts.push({
        scenario: letter,
        check: 'placement policy and persisted binding',
        passed: true,
      })
    }
    // Reorder through the atomic writer, then prove retry and stale-set handling.
    const locationId = 'lifecycle-demo-l-building'
    const page = await readRelationshipPage(db, {
      locationId,
      scope: organisationId,
      table: 'locationAddress',
    })
    const ids = page.rows.map(r => String(r.id))
    ensure(ids.length === 2, 'L requires two address starting heads')
    const input = {
      locationId,
      scope: organisationId,
      expectedIds: ids,
      orderedIds: [...ids].reverse(),
      operationId: `acceptance-${stamp}`,
    }
    const order = await reorderLocationAddresses(db, input, actorId)
    ensure(order.status === 'applied', 'Atomic ordering failed')
    ensure(
      (await reorderLocationAddresses(db, input, actorId)).status === 'replayed',
      'Ordering replay failed',
    )
    ensure(
      (
        await reorderLocationAddresses(
          db,
          { ...input, operationId: input.operationId + '-stale' },
          actorId,
        )
      ).status === 'conflict',
      'Stale ordering accepted',
    )
    receipts.push({ scenario: 'l', order, replay: true, staleRejected: true })
    ensure(
      JSON.stringify(await untouched()) === before,
      'A non-fixture Feature changed',
    )
    receipts.push({ check: 'non-fixture Feature rows unchanged', passed: true })
  } catch (error) {
    receipts.push({ failed: String(error) })
    throw error
  } finally {
    writeFileSync(
      resolve(output, 'receipt.json'),
      JSON.stringify({ target: isolatedDatabase, receipts }, null, 2) + '\n',
    )
    console.log(output)
    await platform.dispose()
  }
}
await main()
