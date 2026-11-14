// RUNTIME
import assert from 'node:assert/strict'
import { realpathSync } from 'node:fs'
import { resolve } from 'node:path'
// DOMAIN
import { openSqliteDomain } from '../locations/lib/sqlite-domain'
import {
  createCanonicalLocationDraft,
  publishCanonicalLocationDraft,
} from '../../src/lib/db/services/locationCanonicalDraft'
import { appendLocationRelationship } from '../../src/lib/db/services/locationRelationships'
import { persistSaanSeoiPlace } from '../../src/lib/db/services/locationSource'
import { isCanonicalLocationDraft } from '../../src/lib/locations/canonicalDraft'
// TYPES
import type { LocationFacts } from '../../src/lib/locations/model'

/** Rehearse creation, occupancy, promotion and conflict handling using the actual migrated schema.
 * @returns Nothing; every fixture mutation is rolled back, including on failure.
 * @remarks Requires an offline copy; never opens the live application database.
 */
async function main(): Promise<void> {
  const path = realpathSync(process.argv[2])
  if (path.startsWith(`${resolve('.wrangler')}/`))
    throw new Error('Use an offline copy')
  const domain = openSqliteDomain(path)
  domain.sqlite.exec('BEGIN IMMEDIATE')
  try {
    const facts: LocationFacts = {
      names: { en: 'Draft shop fixture' },
      brands: [],
      phoneNumber: [],
      location: {
        geometry: { type: 'Point', coordinates: [114.128, 22.281] },
        address: {
          status: 'unresolved',
          address2dId: null,
          address3dId: null,
          address3dUnitId: null,
          snapshotId: null,
          rawSource: {},
          fallbackDisplay: {},
        },
      },
    }
    const input = {
      sourceKey: 'test:canonical-draft:shop',
      kind: 'establishment' as const,
      facts,
      rawSource: { fixture: true },
      actorId: 'hype-local-agent-admin',
    }
    const created = await createCanonicalLocationDraft(domain.db, input)
    assert.equal(created.existing, false)
    assert.deepEqual(await createCanonicalLocationDraft(domain.db, input), {
      ...created,
      existing: true,
    })
    const row = domain.sqlite
      .query('SELECT state,ssId,ownerOrganisationId FROM location WHERE id=?')
      .get(created.locationId) as {
      state: string
      ssId: string | null
      ownerOrganisationId: string | null
    }
    assert.equal(isCanonicalLocationDraft(row), true)
    assert.equal(
      isCanonicalLocationDraft({ ...row, ownerOrganisationId: 'organisation' }),
      false,
    )
    assert.equal(isCanonicalLocationDraft({ ...row, state: 'manual' }), false)
    const unit = domain.sqlite
      .query(
        "SELECT l.id FROM location l JOIN locationCanonicalDraft d ON d.locationId=l.id WHERE l.matchingType='building_part' LIMIT 1",
      )
      .get() as { id: string }
    assert.ok(unit)
    await appendLocationRelationship(
      domain.db,
      {
        table: 'locationOccupancy',
        id: 'draft-fixture-occupancy',
        relationshipId: 'draft-fixture-occupancy',
        previousRevisionId: null,
        scopeOrganisationId: null,
        assertionState: 'asserted',
        evidence: [],
        observedAt: null,
        verifiedAt: null,
        effectiveFrom: null,
        effectiveTo: null,
        establishmentLocationId: created.locationId,
        containerLocationId: unit.id,
        addressRevisionId: null,
        occupancyState: 'current',
      },
      input.actorId,
    )
    const publish = {
      sourceKey: input.sourceKey,
      expectedRevisionId: `${created.locationId}_draft`,
      kind: input.kind,
      actorId: input.actorId,
      projection: {
        ssId: 'test-published-draft-id',
        apiVersion: 'test-api',
        releaseId: 'test-release',
        snapshotId: 'test-snapshot',
        facts,
        rawSource: { fixture: true },
        issues: [],
      },
    }
    await assert.rejects(
      publishCanonicalLocationDraft(domain.db, {
        ...publish,
        expectedRevisionId: 'stale-revision',
      }),
      /conflict/,
    )
    assert.equal(
      (
        domain.sqlite
          .query('SELECT count(*) n FROM locationIdentityHistory WHERE locationId=?')
          .get(created.locationId) as { n: number }
      ).n,
      0,
    )
    assert.equal(
      await publishCanonicalLocationDraft(domain.db, publish),
      created.locationId,
    )
    assert.deepEqual(
      domain.sqlite
        .query('SELECT state,ssId,ownerOrganisationId FROM location WHERE id=?')
        .get(created.locationId),
      { state: 'linked', ssId: publish.projection.ssId, ownerOrganisationId: null },
    )
    assert.equal(
      (
        domain.sqlite
          .query(
            "SELECT establishmentLocationId FROM locationOccupancy WHERE id='draft-fixture-occupancy'",
          )
          .get() as { establishmentLocationId: string }
      ).establishmentLocationId,
      created.locationId,
    )
    assert.equal(
      (
        domain.sqlite
          .query('SELECT count(*) n FROM locationRevisionContent WHERE locationId=?')
          .get(created.locationId) as { n: number }
      ).n,
      2,
    )
    const other = await createCanonicalLocationDraft(domain.db, {
      ...input,
      sourceKey: `${input.sourceKey}:other`,
    })
    await assert.rejects(
      publishCanonicalLocationDraft(domain.db, {
        ...publish,
        sourceKey: `${input.sourceKey}:other`,
        expectedRevisionId: `${other.locationId}_draft`,
      }),
      /conflict/,
    )
    // A unit cannot acquire another root owner or lose its established station ownership.
    const membership = domain.sqlite
      .query('SELECT * FROM locationMembershipHead WHERE childLocationId=? LIMIT 1')
      .get(unit.id) as { id: string; relationshipId: string; parentLocationId: string }
    await assert.rejects(
      appendLocationRelationship(
        domain.db,
        {
          table: 'locationMembership',
          id: 'draft-fixture-remove-owner',
          relationshipId: membership.relationshipId,
          previousRevisionId: membership.id,
          scopeOrganisationId: null,
          assertionState: 'suppressed',
          evidence: [],
          observedAt: null,
          verifiedAt: null,
          effectiveFrom: null,
          effectiveTo: null,
          childLocationId: unit.id,
          parentLocationId: membership.parentLocationId,
          membershipState: 'current',
        },
        input.actorId,
      ),
    )
    const premises = await createCanonicalLocationDraft(domain.db, {
      ...input,
      sourceKey: 'test:canonical-draft:premises',
      kind: 'premises',
    })
    const premisesProjection = {
      ...publish.projection,
      ssId: 'test-published-premises-id',
    }
    await publishCanonicalLocationDraft(domain.db, {
      ...publish,
      sourceKey: 'test:canonical-draft:premises',
      kind: 'premises',
      expectedRevisionId: `${premises.locationId}_draft`,
      projection: premisesProjection,
    })
    await persistSaanSeoiPlace(domain.db, {
      ...premisesProjection,
      snapshotId: 'test-snapshot-2',
      rawSource: { fixture: true, revision: 2 },
    })
    assert.equal(
      (
        domain.sqlite
          .query('SELECT matchingType FROM location WHERE id=?')
          .get(premises.locationId) as { matchingType: string }
      ).matchingType,
      'premises',
    )
    assert.equal(
      (
        domain.sqlite
          .query(
            "SELECT json_extract(facts,'$.kind') kind FROM locationRevision WHERE locationId=? ORDER BY version DESC LIMIT 1",
          )
          .get(premises.locationId) as { kind: string }
      ).kind,
      'premises',
    )
    console.log(
      'PASS: idempotent shared drafts; occupancy; stale/reused-ID rejection; same-ID publication; retained history and containment guards',
    )
  } finally {
    domain.sqlite.exec('ROLLBACK')
    domain.close()
  }
}
await main()
