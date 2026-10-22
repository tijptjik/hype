// Refs #194 — canonical address decisions on the normal development database.
// NODE
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
// DATABASE
import { getPlatformProxy } from 'wrangler'
import { drizzle } from 'drizzle-orm/d1'
import { sql } from 'drizzle-orm'
// DOMAIN
import {
  CanonicalAddressInputSchema,
  retainCanonicalAddress,
} from '../../src/lib/db/services/addressCanonical'
import { saveLinkedFeatureForm } from '../../src/lib/db/services/locationEdit'
import {
  proposeLocationPlacement,
  decideLocationPlacement,
} from '../../src/lib/db/services/locationPlacement'
// TYPES
import type { Database } from '../../src/lib/types'
import type { PlacementDecision } from '../../src/lib/locations/placement'
import type { D1Database } from '@cloudflare/workers-types'

/** Require a persisted invariant; never convert failures to successful acceptance.
 * @param value Invariant. @param message Failure description. @returns Nothing.
 */
function ensure(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message)
}

/** Exercise overrides, canonical convergence and directions without touching real Features.
 * @returns Private operation receipts and before-image.
 * @remarks Requires Q to have followed its synthetic occupancy first. Every run uses a new
 * canonical source version and records its decisions; it never deletes immutable history.
 */
async function main(): Promise<void> {
  ensure(process.argv.includes('--apply'), 'Pass --apply for local synthetic decisions')
  ensure(
    !process.env.HYPE_DEV_STATE && !process.env.CLOUDFLARE_ENV,
    'Normal development only',
  )
  process.umask(0o077)
  const runId = crypto.randomUUID()
  const root = resolve('.local/locations/operational-acceptance', `address-${runId}`)
  mkdirSync(root, { recursive: true })
  const source = resolve(
    '.wrangler/state/v3/d1/miniflare-D1DatabaseObject/d3080fe932e72db09a66987b4bc33e3301f57365daef263894a0551146999c8f.sqlite',
  )
  const backup = spawnSync('python3', [
    '-c',
    'import sqlite3,sys; s=sqlite3.connect("file:"+sys.argv[1]+"?mode=ro",uri=True); d=sqlite3.connect(sys.argv[2]); s.backup(d); d.close(); s.close()',
    source,
    resolve(root, 'before.sqlite'),
  ])
  ensure(backup.status === 0, 'Could not back up development database')
  const proxy = await getPlatformProxy<{ DB: D1Database }>({
    configPath: 'wrangler.local.toml',
    remoteBindings: false,
  })
  const receipts: unknown[] = []
  try {
    const db = drizzle(proxy.env.DB) as Database
    const featureId = 'lifecycle-demo-q-feature',
      projectId = 'vGBvWfSZNELM',
      actorId = 'hype-local-agent-admin'
    const current = () =>
      db.get<{ modifiedAt: string; addressMeta: string; geometry: string }>(
        sql`SELECT modifiedAt,addressMeta,geometry FROM feature WHERE id=${featureId} AND projectId=${projectId} AND isPublished=0`,
      )
    const initial = await current()
    ensure(initial, 'Missing unpublished Q fixture')
    const canonical = await db.get<{
      id: string
      components: string
      geometry: string
      sourceReferences: string
    }>(
      sql`SELECT ar.* FROM featureLocation fl JOIN addressRevision ar ON ar.id=fl.addressRevisionId WHERE fl.featureId=${featureId}`,
    )
    ensure(
      canonical,
      'Run placement acceptance first: Q needs an accepted canonical address',
    )
    const untouched = () =>
      db.all(
        sql`SELECT id,modifiedAt,geometry,addressMeta FROM feature WHERE id NOT LIKE 'lifecycle-demo-%' ORDER BY id`,
      )
    const before = JSON.stringify(await untouched())
    const meta = JSON.parse(initial.addressMeta)
    meta.address.overrides = {
      en: { buildingName: `Local ${runId}`, streetName: 'Synthetic Acceptance Street' },
    }
    meta.address.accessHints = { en: 'Use the side entrance', 'zh-hant': '使用側門' }
    const edited = await saveLinkedFeatureForm(db, {
      featureId,
      projectId,
      actorId,
      updatedAt: initial.modifiedAt,
      data: { addressMeta: meta },
      i18n: {},
    })
    ensure(
      edited.status === 'saved',
      'Could not save explicit local address and directions',
    )
    const originalCanonical = JSON.stringify(
      await db.get(sql`SELECT * FROM addressRevision WHERE id=${canonical.id}`),
    )
    let previous = canonical.id
    // Each decision uses a real proposal and the latest optimistic binding fence.
    for (const [phase, name, choice] of [
      ['keep', `Canonical ${runId}`, 'keep'],
      ['converge', `Local ${runId}`, 'keep'],
      ['accept', `Final ${runId}`, 'accept'],
    ] as const) {
      const components = JSON.parse(canonical.components)
      components.i18n.en.buildingName = name
      const target = await retainCanonicalAddress(
        db,
        {
          sourceKey: {
            provider: 'saanseoi',
            family: 'addresses',
            id: 'lifecycle-demo-q-acceptance-address',
          },
          components,
          geometry: CanonicalAddressInputSchema.shape.geometry.parse(
            JSON.parse(canonical.geometry),
          ),
          sourceVersion: `${runId}-${phase}`,
          sourceReferences: JSON.parse(canonical.sourceReferences),
          rawSource: { synthetic: true, runId, phase },
        },
        sql`1`,
        previous,
      )
      const proposal = await proposeLocationPlacement(db, {
        featureId,
        projectId,
        addressRevisionId: target.id,
      })
      ensure(proposal, `${phase}: missing address proposal`)
      const decision: PlacementDecision = {
        action: 'move',
        addressChoice: choice,
        directions: 'keep',
      }
      const input = {
        featureId,
        projectId,
        actorId,
        proposalId: proposal.id,
        expectedRevision: proposal.associationRevision,
        expectedFeatureModifiedAt: proposal.featureModifiedAt,
        reason: `Synthetic canonical acceptance: ${phase}`,
        decision,
      }
      const result = await decideLocationPlacement(db, input)
      ensure(result.status === 'applied', `${phase}: ${JSON.stringify(result)}`)
      const binding = await db.get<{
        addressRevisionId: string
        placementOverrides: string
      }>(
        sql`SELECT addressRevisionId,placementOverrides FROM featureLocation WHERE featureId=${featureId}`,
      )
      ensure(
        binding?.addressRevisionId === target.id,
        `${phase}: canonical version not accepted`,
      )
      const saved = await current()
      const address = JSON.parse(saved!.addressMeta).address
      ensure(
        address.accessHints?.en === meta.address.accessHints.en &&
          address.accessHints?.['zh-hant'] === meta.address.accessHints['zh-hant'],
        `${phase}: directions lost`,
      )
      ensure(
        saved?.geometry === initial.geometry,
        `${phase}: same-address update moved the pin`,
      )
      if (phase === 'keep')
        ensure(
          address.overrides?.en?.buildingName === `Local ${runId}`,
          'Keep did not preserve differing name',
        )
      else
        ensure(
          !address.overrides?.en?.buildingName,
          `${phase}: obsolete override not retired`,
        )
      const retry = await decideLocationPlacement(db, input)
      ensure(retry.status !== 'applied', 'Old decision applied twice')
      receipts.push({ phase, result, retry, addressRevisionId: target.id, binding })
      previous = target.id
    }
    ensure(
      JSON.stringify(
        await db.get(sql`SELECT * FROM addressRevision WHERE id=${canonical.id}`),
      ) === originalCanonical,
      'Canonical source revision changed',
    )
    const saved = await current()
    ensure(
      (
        await saveLinkedFeatureForm(db, {
          featureId,
          projectId,
          actorId,
          updatedAt: saved!.modifiedAt,
          data: {},
          i18n: {},
        })
      ).status === 'saved',
      'Unrelated save failed',
    )
    ensure(
      (await current())?.addressMeta === saved?.addressMeta,
      'Unrelated save changed accepted directions/address',
    )
    ensure(JSON.stringify(await untouched()) === before, 'Non-fixture Features changed')
    receipts.push({
      check: 'immutable source, unrelated save and non-fixture retention',
      passed: true,
    })
  } catch (error) {
    receipts.push({ failed: String(error) })
    throw error
  } finally {
    writeFileSync(
      resolve(root, 'receipt.json'),
      JSON.stringify({ target: 'hype-db-local', receipts }, null, 2) + '\n',
    )
    console.log(root)
    await proxy.dispose()
  }
}
await main()
