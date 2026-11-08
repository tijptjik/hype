// FIXTURE ASSERTIONS
import { required } from './fixtures/required'
import { getAcceptedFeatureLocation } from '#lib/db/services/location.js'
import { saveLinkedFeatureForm } from '#lib/db/services/locationEdit.js'
// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { getTableColumns, sql } from 'drizzle-orm'
import { feature } from '#lib/db/schema/feature.js'
import { setupLifecycleDatabase } from './fixtures/locationLifecycleDatabase'
import { createLocalLocationAddress } from '#lib/addresses/localLocationAddress.js'
import { emptyFeatureAddress } from '#lib/addresses/featureAddress.js'
import { serializeLocationFacts } from '#lib/locations/factsSnapshot.js'
import { DEFAULT_PROJECT_LOCATION_POLICY } from '#lib/locations/model.js'
import {
  CanonicalAddressInputSchema,
  retainCanonicalAddress,
} from '#lib/db/services/addressCanonical.js'
import { appendLocationRelationship } from '#lib/db/services/locationRelationships.js'
import {
  proposeLocationPlacement,
  decideLocationPlacement,
  reconcileLocationPlacements,
} from '#lib/db/services/locationPlacement.js'

const stores: ReturnType<typeof setupLifecycleDatabase>[] = []
afterEach(() => {
  for (const s of stores.splice(0)) s.sqlite.close()
})
async function setup(policy: 'follow' | 'fixed' | 'review' = 'review', hints = false) {
  const s = setupLifecycleDatabase(true)
  stores.push(s)
  const columns = new Set(
    s.sqlite
      .prepare('PRAGMA table_info(feature)')
      .all()
      .map(r => r.name),
  )
  for (const col of Object.values(getTableColumns(feature)))
    if (!columns.has(col.name))
      s.sqlite.exec(
        `ALTER TABLE feature ADD COLUMN "${col.name}" ${col.dataType === 'number' ? 'REAL' : 'TEXT'}`,
      )
  s.sqlite.exec(
    `CREATE TABLE layer(id TEXT PRIMARY KEY,projectId TEXT,organisationId TEXT); INSERT INTO layer VALUES('layer','p','p');`,
  )
  s.sqlite.exec(readFileSync('migrations/0143_layer_relocation_policy.sql', 'utf8'))
  s.sqlite.prepare("UPDATE project SET locationPolicy=? WHERE id='p'").run(
    JSON.stringify({
      ...DEFAULT_PROJECT_LOCATION_POLICY,
      relocation: policy,
      address: 'follow',
    }),
  )
  s.sqlite.exec(
    `INSERT INTO location(id,kind,state,ownerOrganisationId) VALUES('shop','establishment','unresolved','p'),('old','building','unresolved','p'),('new','building','unresolved','p');`,
  )
  const facts = {
    names: { en: 'Shop' },
    phoneNumber: [],
    brands: [],
    location: {
      geometry: { type: 'Point' as const, coordinates: [114, 22] as [number, number] },
      address: emptyFeatureAddress().source,
    },
  }
  s.sqlite
    .prepare(
      "INSERT INTO locationRevision(id,locationId,version,origin,contentHash,rawSource,facts) VALUES('r','shop',1,'local','hash','{}',?)",
    )
    .run(serializeLocationFacts(facts, 'establishment'))
  const content = createLocalLocationAddress()
  content.scope = 'building'
  content.i18n.en = {
    formattedAddress: '1 New Street',
    streetName: 'New Street',
    buildingNumberExpression: '1',
  }
  const canonical = await retainCanonicalAddress(s.db, {
    sourceKey: { provider: 'saanseoi', family: 'addresses', id: 'new-address' },
    components: content,
    geometry: { type: 'Point', coordinates: [114.1, 22.1] },
    sourceVersion: 'one',
    sourceReferences: [
      {
        provider: 'saanseoi',
        dataset: 'addresses',
        apiVersion: 'v1',
        releaseId: 'release',
        snapshotId: 'snapshot',
      },
    ],
    rawSource: { source: 'fixture' },
  })
  const oldAddress = {
    ...emptyFeatureAddress(),
    ...(hints ? { accessHints: { en: 'Old entrance', 'zh-hant': '舊入口' } } : {}),
  }
  s.sqlite
    .prepare(
      "UPDATE feature SET layerId='layer',organisationId='p',geometry=?,addressMeta=? WHERE id='f'",
    )
    .run(
      JSON.stringify(facts.location.geometry),
      JSON.stringify({ address: oldAddress }),
    )
  s.sqlite.exec(
    "INSERT INTO featureLocation(featureId,locationId,version,factsRevisionId,locationRevisionId) VALUES('f','shop','initial','r','r')",
  )
  const occupancy = {
    table: 'locationOccupancy' as const,
    id: 'move',
    relationshipId: 'move',
    previousRevisionId: null,
    scopeOrganisationId: null,
    assertionState: 'asserted' as const,
    evidence: [
      {
        source: {
          kind: 'url' as const,
          url: 'https://example.org/move',
          accessedAt: '2026-10-22T00:00:00Z',
        },
        supports: ['occupancyState'],
        quotedText: 'Moved to new address',
        description: null,
        sourceDate: null,
      },
    ],
    observedAt: '2026-10-22T00:00:00Z',
    verifiedAt: '2026-10-22T00:00:00Z',
    effectiveFrom: null,
    effectiveTo: null,
    establishmentLocationId: 'shop',
    containerLocationId: 'new',
    addressRevisionId: canonical.id,
    occupancyState: 'current' as const,
  }
  await appendLocationRelationship(s.db, occupancy, 'editor')
  return { ...s, canonical, occupancy }
}
function decision(
  proposal: { id: string; associationRevision: string; featureModifiedAt: string },
  action: 'move' | 'keep' | 'later' = 'move',
) {
  return {
    featureId: 'f',
    projectId: 'p',
    proposalId: proposal.id,
    expectedRevision: proposal.associationRevision,
    expectedFeatureModifiedAt: proposal.featureModifiedAt,
    actorId: 'editor',
    reason: 'Verified destination',
    decision: { action },
  }
}
describe('occupancy and canonical address acceptance', () => {
  it('fixed does not propose or move; layer override resolves independently', async () => {
    const s = await setup('fixed')
    expect(
      await proposeLocationPlacement(s.db, {
        featureId: 'f',
        projectId: 'p',
        occupancyRevisionId: 'move',
      }),
    ).toBeNull()
    s.sqlite.exec(
      "UPDATE layer SET relocationPolicy='review',relocationPolicyRevision=1",
    )
    const p = await proposeLocationPlacement(s.db, {
      featureId: 'f',
      projectId: 'p',
      occupancyRevisionId: 'move',
    })
    expect(p?.evidence.placement?.policy).toBe('review')
  })
  it('follows verified occupancy atomically, captures history and is replay safe', async () => {
    const s = await setup('follow')
    const result = await reconcileLocationPlacements(s.db, {
      locationId: 'shop',
      actorId: 'worker',
    })
    expect(result.applied).toBe(1)
    const b = required(s.sqlite.prepare('SELECT * FROM featureLocation').get())
    expect(b.occupancyRevisionId).toBe('move')
    const history = required(
      s.sqlite
        .prepare("SELECT * FROM featureLocationHistory WHERE action='update'")
        .get(),
    )
    expect(JSON.parse(String(history.geometry)).coordinates).toEqual([114.1, 22.1])
    expect(history.adoptionProposalId).toBeTruthy()
    expect(
      s.sqlite
        .prepare('SELECT containerLocationId FROM featureLocationMembership')
        .get()?.containerLocationId,
    ).toBe('new')
    expect(
      (
        await reconcileLocationPlacements(s.db, {
          locationId: 'shop',
          actorId: 'worker',
        })
      ).applied,
    ).toBe(0)
  })
  it('review later retains pending state; keep is durable across policy changes', async () => {
    const s = await setup()
    const p = required(
      await proposeLocationPlacement(s.db, {
        featureId: 'f',
        projectId: 'p',
        occupancyRevisionId: 'move',
      }),
    )
    expect(await decideLocationPlacement(s.db, decision(p, 'later'))).toEqual({
      status: 'deferred',
    })
    expect((await decideLocationPlacement(s.db, decision(p, 'keep'))).status).toBe(
      'rejected',
    )
    s.sqlite
      .prepare('UPDATE project SET locationPolicy=?,locationPolicyRevision=1')
      .run(JSON.stringify({ ...DEFAULT_PROJECT_LOCATION_POLICY, relocation: 'follow' }))
    expect(
      (
        await reconcileLocationPlacements(s.db, {
          locationId: 'shop',
          actorId: 'worker',
        })
      ).applied,
    ).toBe(0)
    expect(
      s.sqlite.prepare('SELECT occupancyRevisionId FROM featureLocation').get()
        ?.occupancyRevisionId,
    ).toBeNull()
  })
  it('requires explicit directions decisions and preserves the old locale text in immutable evidence', async () => {
    const s = await setup('follow', true)
    const p = required(
      await proposeLocationPlacement(s.db, {
        featureId: 'f',
        projectId: 'p',
        occupancyRevisionId: 'move',
      }),
    )
    expect(p.evidence.plan.decision.location).toBe('review')
    expect((await decideLocationPlacement(s.db, decision(p))).status).toBe('review')
    expect(
      (
        await decideLocationPlacement(s.db, {
          ...decision(p),
          decision: {
            action: 'move',
            directions: 'replace',
            accessHints: { en: 'New entrance', 'zh-hant': '新入口' },
          },
        })
      ).status,
    ).toBe('applied')
    const b = required(
      s.sqlite.prepare('SELECT placementOverrides FROM featureLocation').get(),
    )
    expect(JSON.parse(String(b.placementOverrides)).accessHints['zh-hant']).toBe(
      '新入口',
    )
    expect(p.evidence.placement?.beforeAccessHints['zh-hant']).toBe('舊入口')
  })
  it('rejects stale policy and head changes without moving the Feature', async () => {
    const s = await setup()
    const p = required(
      await proposeLocationPlacement(s.db, {
        featureId: 'f',
        projectId: 'p',
        occupancyRevisionId: 'move',
      }),
    )
    s.sqlite.exec('UPDATE layer SET relocationPolicyRevision=1')
    expect((await decideLocationPlacement(s.db, decision(p))).status).toBe('conflict')
    expect(
      s.sqlite
        .prepare("SELECT count(*) n FROM featureLocationHistory WHERE action='update'")
        .get()?.n,
    ).toBe(0)
  })
  it('reconciles forward canonical versions and retires equal local overrides', async () => {
    const s = await setup('follow')
    expect(
      (
        await reconcileLocationPlacements(s.db, {
          locationId: 'shop',
          actorId: 'worker',
        })
      ).applied,
    ).toBe(1)
    const newer = structuredClone(s.canonical.components) as ReturnType<
      typeof createLocalLocationAddress
    >
    newer.i18n.en.buildingName = 'New Name'
    const target = await retainCanonicalAddress(s.db, {
      sourceKey: { provider: 'saanseoi', family: 'addresses', id: 'new-address' },
      components: newer,
      geometry: CanonicalAddressInputSchema.shape.geometry.parse(s.canonical.geometry),
      sourceVersion: 'two',
      sourceReferences: s.canonical.sourceReferences,
      rawSource: { source: 'new' },
    })
    const p = required(
      await proposeLocationPlacement(s.db, {
        featureId: 'f',
        projectId: 'p',
        addressRevisionId: target.id,
      }),
    )
    expect(
      (
        await decideLocationPlacement(s.db, {
          ...decision(p),
          decision: { action: 'move', addressChoice: 'keep' },
        })
      ).status,
    ).toBe('applied')
    expect(
      s.sqlite.prepare('SELECT addressRevisionId FROM featureLocation').get()
        ?.addressRevisionId,
    ).toBe(target.id)
  })
})

it('rolls every projection and history write back if final receipt fails', async () => {
  const s = await setup()
  const p = required(
    await proposeLocationPlacement(s.db, {
      featureId: 'f',
      projectId: 'p',
      occupancyRevisionId: 'move',
    }),
  )
  s.sqlite.exec(
    "CREATE TRIGGER reject_receipt BEFORE UPDATE ON locationAdoptionProposal BEGIN SELECT RAISE(ABORT,'receipt failure'); END",
  )
  await expect(decideLocationPlacement(s.db, decision(p))).rejects.toThrow()
  expect(s.sqlite.prepare('SELECT version FROM featureLocation').get()?.version).toBe(
    'initial',
  )
  expect(
    s.sqlite
      .prepare("SELECT count(*) n FROM featureLocationHistory WHERE action='update'")
      .get()?.n,
  ).toBe(0)
  expect(s.sqlite.prepare('SELECT modifiedAt FROM feature').get()?.modifiedAt).toBe(
    'original',
  )
})
it('does not expose or adopt a destination made private after assessment', async () => {
  const s = await setup()
  const p = required(
    await proposeLocationPlacement(s.db, {
      featureId: 'f',
      projectId: 'p',
      occupancyRevisionId: 'move',
    }),
  )
  s.sqlite.exec(
    "UPDATE location SET state='manual',ownerOrganisationId='other' WHERE id='new'",
  )
  expect((await decideLocationPlacement(s.db, decision(p))).status).toBe('conflict')
})
it('planned or competing occupancies never follow automatically', async () => {
  const s = await setup('follow')
  await appendLocationRelationship(
    s.db,
    {
      ...s.occupancy,
      id: 'planned',
      previousRevisionId: 'move',
      effectiveFrom: { value: '2099', precision: 'year' },
    },
    'editor',
  )
  const p = required(
    await proposeLocationPlacement(s.db, {
      featureId: 'f',
      projectId: 'p',
      occupancyRevisionId: 'planned',
    }),
  )
  expect(p.evidence.placement?.blockers).toContain('planned-or-ended-occupancy')
  expect(
    (await decideLocationPlacement(s.db, { ...decision(p), automatic: true })).status,
  ).toBe('review')
})
it('reasserts only differing local address fields on the new base; equal fields retire', async () => {
  const s = await setup('follow')
  await reconcileLocationPlacements(s.db, { locationId: 'shop', actorId: 'worker' })
  const parent = required(s.sqlite.prepare('SELECT addressMeta FROM feature').get())
  const meta = JSON.parse(String(parent.addressMeta))
  meta.address.overrides = {
    en: { buildingName: 'Local name', streetName: 'New Street' },
  }
  s.sqlite
    .prepare("UPDATE feature SET addressMeta=?,modifiedAt='edited'")
    .run(JSON.stringify(meta))
  const content = structuredClone(s.canonical.components) as ReturnType<
    typeof createLocalLocationAddress
  >
  content.i18n.en.buildingName = 'Canonical name'
  const target = await retainCanonicalAddress(s.db, {
    sourceKey: { provider: 'saanseoi', family: 'addresses', id: 'new-address' },
    components: content,
    geometry: CanonicalAddressInputSchema.shape.geometry.parse(s.canonical.geometry),
    sourceVersion: 'two',
    sourceReferences: s.canonical.sourceReferences,
    rawSource: {},
  })
  const p = required(
    await proposeLocationPlacement(s.db, {
      featureId: 'f',
      projectId: 'p',
      addressRevisionId: target.id,
    }),
  )
  expect(
    (
      await decideLocationPlacement(s.db, {
        ...decision(p),
        decision: { action: 'move', addressChoice: 'keep' },
      })
    ).status,
  ).toBe('applied')
  const correction = required(
    s.sqlite.prepare('SELECT overrides FROM organisationLocationHead').get(),
  )
  expect(JSON.parse(String(correction.overrides)).address).toEqual({
    baseAddressRevisionId: target.id,
    fields: { en: { buildingName: 'Local name' } },
  })
  expect(
    JSON.parse(String(s.sqlite.prepare('SELECT geometry FROM feature').get()?.geometry))
      .coordinates,
  ).toEqual([114.1, 22.1])
})
it('deduplicates content and never edits immutable canonical payloads', async () => {
  const s = await setup()
  const same = await retainCanonicalAddress(s.db, {
    sourceKey: { provider: 'saanseoi', family: 'addresses', id: 'new-address' },
    components: s.canonical.components as ReturnType<typeof createLocalLocationAddress>,
    geometry: CanonicalAddressInputSchema.shape.geometry.parse(s.canonical.geometry),
    sourceVersion: 'other-publication',
    sourceReferences: s.canonical.sourceReferences,
    rawSource: { different: true },
  })
  expect(same.id).toBe(s.canonical.id)
  expect(same.rawSource).toEqual({ source: 'fixture' })
})

it('retains the accepted placement and directions through an unrelated facts save', async () => {
  const s = await setup('follow')
  await reconcileLocationPlacements(s.db, { locationId: 'shop', actorId: 'worker' })
  const accepted = await getAcceptedFeatureLocation(s.db, 'f', 'p')
  expect(accepted?.effective.location?.geometry.coordinates).toEqual([114.1, 22.1])
  expect(accepted?.effective.location?.address.canonical?.revisionId).toBe(
    s.canonical.id,
  )
  const current = required(
    s.sqlite.prepare('SELECT modifiedAt,addressMeta FROM feature').get(),
  )
  const result = await saveLinkedFeatureForm(s.db, {
    featureId: 'f',
    projectId: 'p',
    actorId: 'editor',
    updatedAt: String(current.modifiedAt),
    data: {},
    i18n: {},
  })
  expect(result.status).toBe('saved')
  const binding = required(
    s.sqlite
      .prepare('SELECT acceptedGeometry,addressRevisionId FROM featureLocation')
      .get(),
  )
  expect(JSON.parse(String(binding.acceptedGeometry)).coordinates).toEqual([
    114.1, 22.1,
  ])
  expect(binding.addressRevisionId).toBe(s.canonical.id)
  expect(
    JSON.parse(
      String(s.sqlite.prepare('SELECT addressMeta FROM feature').get()?.addressMeta),
    ),
  ).toEqual(JSON.parse(String(current.addressMeta)))
})
it('requires a deliberate unit decision and retains the old detail as proposal evidence', async () => {
  const s = await setup()
  const meta = {
    address: { ...emptyFeatureAddress(), unitDetails: { unitRef: '8', unitType: 'R' } },
  }
  s.sqlite.prepare('UPDATE feature SET addressMeta=?').run(JSON.stringify(meta))
  const p = required(
    await proposeLocationPlacement(s.db, {
      featureId: 'f',
      projectId: 'p',
      occupancyRevisionId: 'move',
    }),
  )
  expect(
    (
      await decideLocationPlacement(s.db, {
        ...decision(p),
        decision: { action: 'move', addressChoice: 'accept', useDestinationPin: true },
      })
    ).status,
  ).toBe('review')
  expect(
    (
      await decideLocationPlacement(s.db, {
        ...decision(p),
        decision: {
          action: 'move',
          addressChoice: 'accept',
          useDestinationPin: true,
          unitDetails: 'clear',
        },
      })
    ).status,
  ).toBe('applied')
  expect(p.evidence.placement?.beforeUnitDetails).toEqual({
    unitRef: '8',
    unitType: 'R',
  })
})
it('does not create or apply proposals after a source lease is lost', async () => {
  const s = await setup('follow')
  expect(
    await proposeLocationPlacement(s.db, {
      featureId: 'f',
      projectId: 'p',
      occupancyRevisionId: 'move',
      additionalGuard: sql`0`,
    }),
  ).toBeNull()
  const p = required(
    await proposeLocationPlacement(s.db, {
      featureId: 'f',
      projectId: 'p',
      occupancyRevisionId: 'move',
    }),
  )
  expect(
    (await decideLocationPlacement(s.db, { ...decision(p), additionalGuard: sql`0` }))
      .status,
  ).toBe('conflict')
  expect(s.sqlite.prepare('SELECT version FROM featureLocation').get()?.version).toBe(
    'initial',
  )
})
it('retains an actionable review when the destination has no canonical address', async () => {
  const s = await setup('follow')
  await appendLocationRelationship(
    s.db,
    {
      ...s.occupancy,
      id: 'no-address',
      previousRevisionId: 'move',
      addressRevisionId: null,
    },
    'editor',
  )
  const p = required(
    await proposeLocationPlacement(s.db, {
      featureId: 'f',
      projectId: 'p',
      occupancyRevisionId: 'no-address',
    }),
  )
  expect(p.evidence.placement?.blockers).toContain('missing-destination-address')
  expect(p.addressRevisionId).toBeNull()
  expect((await decideLocationPlacement(s.db, decision(p))).status).toBe('review')
  expect((await decideLocationPlacement(s.db, decision(p, 'later'))).status).toBe(
    'deferred',
  )
  expect((await decideLocationPlacement(s.db, decision(p, 'keep'))).status).toBe(
    'rejected',
  )
})
it('fences curated address imports to the exact preceding canonical version', async () => {
  const s = await setup()
  const input = {
    sourceKey: { provider: 'saanseoi', family: 'addresses', id: 'new-address' },
    components: s.canonical.components as ReturnType<typeof createLocalLocationAddress>,
    geometry: CanonicalAddressInputSchema.shape.geometry.parse(s.canonical.geometry),
    sourceVersion: 'next',
    sourceReferences: s.canonical.sourceReferences,
    rawSource: {},
  }
  await expect(retainCanonicalAddress(s.db, input, sql`1`, null)).rejects.toThrow(
    'head changed',
  )
  expect((await retainCanonicalAddress(s.db, input, sql`1`, s.canonical.id)).id).toBe(
    s.canonical.id,
  )
})
it('reviews evidenced occupancy even when the publisher has omitted the historical entity', async () => {
  const s = await setup()
  s.sqlite.exec("UPDATE location SET sourceAvailability='missing' WHERE id='shop'")
  const p = required(
    await proposeLocationPlacement(s.db, {
      featureId: 'f',
      projectId: 'p',
      occupancyRevisionId: 'move',
    }),
  )
  expect(p.evidence.placement?.occupancyRevisionId).toBe('move')
  expect((await decideLocationPlacement(s.db, decision(p, 'keep'))).status).toBe(
    'rejected',
  )
  expect(
    s.sqlite
      .prepare("SELECT count(*) n FROM locationRevision WHERE locationId='shop'")
      .get()?.n,
  ).toBe(1)
})
it('retains a fresh assessment after container dependencies change without a Feature edit', async () => {
  const s = await setup()
  const first = required(
    await proposeLocationPlacement(s.db, {
      featureId: 'f',
      projectId: 'p',
      occupancyRevisionId: 'move',
    }),
  )
  s.sqlite.exec(
    "INSERT INTO location(id,kind,state,ownerOrganisationId) VALUES('premises','premises','unresolved','p')",
  )
  await appendLocationRelationship(
    s.db,
    {
      table: 'locationMembership',
      id: 'membership',
      relationshipId: 'membership',
      previousRevisionId: null,
      scopeOrganisationId: null,
      assertionState: 'asserted',
      childLocationId: 'new',
      parentLocationId: 'premises',
      membershipState: 'current',
      evidence: [],
      observedAt: null,
      verifiedAt: null,
      effectiveFrom: null,
      effectiveTo: null,
    },
    'editor',
  )
  const second = required(
    await proposeLocationPlacement(s.db, {
      featureId: 'f',
      projectId: 'p',
      occupancyRevisionId: 'move',
    }),
  )
  expect(second.id).not.toBe(first.id)
  expect((await decideLocationPlacement(s.db, decision(first))).status).toBe('conflict')
  expect((await decideLocationPlacement(s.db, decision(second))).status).toBe('applied')
})

it('retains a review for two simultaneous evidenced destinations without an automatic move', async () => {
  const s = await setup('follow')
  await appendLocationRelationship(
    s.db,
    {
      ...s.occupancy,
      id: 'competing-destination',
      relationshipId: 'competing-destination',
      containerLocationId: 'old',
    },
    'editor',
  )
  const proposal = required(
    await proposeLocationPlacement(s.db, {
      featureId: 'f',
      projectId: 'p',
      occupancyRevisionId: 'move',
    }),
  )
  expect(proposal.evidence.placement?.blockers).toContain('ambiguous-occupancy')
  expect(
    (await reconcileLocationPlacements(s.db, { locationId: 'shop', actorId: 'worker' }))
      .applied,
  ).toBe(0)
  expect(s.sqlite.prepare('SELECT version FROM featureLocation').get()?.version).toBe(
    'initial',
  )
  expect(
    s.sqlite
      .prepare("SELECT count(*) n FROM featureLocationHistory WHERE action='update'")
      .get()?.n,
  ).toBe(0)
})

it('rejects a relocation after its Feature is reparented without rewriting accepted history', async () => {
  const s = await setup()
  const proposal = required(
    await proposeLocationPlacement(s.db, {
      featureId: 'f',
      projectId: 'p',
      occupancyRevisionId: 'move',
    }),
  )
  s.sqlite.exec(
    "INSERT INTO layer(id,projectId,organisationId,relocationPolicy) VALUES('other-layer','p','p','review'); UPDATE feature SET layerId='other-layer' WHERE id='f'",
  )
  expect((await decideLocationPlacement(s.db, decision(proposal))).status).toBe(
    'conflict',
  )
  expect(s.sqlite.prepare('SELECT version FROM featureLocation').get()?.version).toBe(
    'initial',
  )
  expect(
    s.sqlite
      .prepare("SELECT count(*) n FROM featureLocationHistory WHERE action='update'")
      .get()?.n,
  ).toBe(0)
})

it('transfers a legacy Feature with accepted occupancy and addressing into destination-owned copies', async () => {
  const s = await setup('follow')
  await reconcileLocationPlacements(s.db, { locationId: 'shop', actorId: 'worker' })
  s.sqlite.exec(`ALTER TABLE property ADD COLUMN projectId TEXT;
    ALTER TABLE property ADD COLUMN organisationId TEXT;
    ALTER TABLE property ADD COLUMN type TEXT;
    CREATE TABLE layerProperty(layerId TEXT,propertyId TEXT);
    CREATE TABLE featurePropertyI18n(featureId TEXT,propertyId TEXT,locale TEXT,value TEXT,valueGen INTEGER);
    INSERT INTO locationRevision(id,locationId,version,origin,contentHash,rawSource,facts) SELECT 'new-baseline','new',1,'local','container-hash','{}',json_remove(json_set(facts,'$.kind','building'),'$.details.brands') FROM locationRevision WHERE id='r';
    INSERT INTO layer(id,projectId,organisationId) VALUES('destination','other','other');`)
  const current = required(
    s.sqlite.prepare("SELECT modifiedAt,addressMeta FROM feature WHERE id='f'").get(),
  )
  const result = await saveLinkedFeatureForm(s.db, {
    featureId: 'f',
    projectId: 'p',
    actorId: 'manager',
    updatedAt: String(current.modifiedAt),
    destinationScope: {
      organisationId: 'other',
      projectId: 'other',
      layerId: 'destination',
      resourceHubId: null,
    },
    authorizeDestinationLocation: async () => {},
    data: { organisationId: 'other', projectId: 'other', layerId: 'destination' },
    i18n: {},
  })
  expect(result.status).toBe('saved')
  const accepted = required(
    s.sqlite.prepare("SELECT * FROM featureLocation WHERE featureId='f'").get(),
  )
  expect(accepted.locationId).not.toBe('shop')
  expect(accepted.addressRevisionId).toBe(s.canonical.id)
  expect(
    s.sqlite
      .prepare('SELECT scopeOrganisationId FROM locationOccupancy WHERE id=?')
      .get(accepted.occupancyRevisionId)?.scopeOrganisationId,
  ).toBe('other')
  expect(
    s.sqlite.prepare("SELECT projectId,addressMeta FROM feature WHERE id='f'").get(),
  ).toMatchObject({ projectId: 'other', addressMeta: current.addressMeta })
})
