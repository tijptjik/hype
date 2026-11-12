// FIXTURE ASSERTIONS
import { required } from './fixtures/required'
import { getAcceptedFeatureLocation } from '#lib/db/services/location.js'
import { saveLinkedFeatureForm } from '#lib/db/services/locationEdit.js'
// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { getTableColumns, getTableName, sql } from 'drizzle-orm'
import {
  feature,
  featureI18n,
  featureProperty,
  featurePropertyI18n,
} from '#lib/db/schema/feature.js'
import { image, featureImage } from '#lib/db/schema/image.js'
import {
  property,
  propertyI18n,
  propertyValue,
  propertyValueI18n,
} from '#lib/db/schema/property.js'
import { readFeatureRevisionSource } from '#lib/db/services/featureRevisionSource.js'
import { unlinkFeatureLocation } from '#lib/db/services/locationUnlink.js'
import { linkInitialFeatureLocation } from '#lib/db/services/locationLink.js'
import { relinkFeatureLocation } from '#lib/db/services/locationRelink.js'
import { buildFeatureRevisionBaselineContent } from '#lib/db/services/featureRevisionContent.js'
import { initializeFeatureRevision } from '#lib/db/services/featureRevision.js'
import { featureContentProjectionMatches } from '#lib/db/services/featureRevisionProjection.js'
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
      s.sqlite.exec(`ALTER TABLE feature ADD COLUMN "${col.name}" ${col.getSQLType()}`)
  s.sqlite.exec(
    `CREATE TABLE layer(id TEXT PRIMARY KEY,projectId TEXT,organisationId TEXT); INSERT INTO layer VALUES('layer','p','p');`,
  )
  s.sqlite.exec(readFileSync('migrations/0143_layer_relocation_policy.sql', 'utf8'))
  s.sqlite.prepare("UPDATE project SET locationPolicy=? WHERE id='p'").run(
    JSON.stringify({
      ...DEFAULT_PROJECT_LOCATION_POLICY,
      // These placement tests deliberately apply one policy to both change sources.
      sameSources: true,
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
      "INSERT INTO locationRevisionContent(id,locationId,version,origin,contentHash,rawSource,facts) VALUES('r','shop',1,'local','hash','{}',?)",
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

/** Completes the isolated lifecycle fixture with revision source columns and enrolls its published Feature. */
async function enroll(s: Awaited<ReturnType<typeof setup>>): Promise<string> {
  for (const table of [
    featureI18n,
    featureProperty,
    featurePropertyI18n,
    image,
    featureImage,
    property,
    propertyI18n,
    propertyValue,
    propertyValueI18n,
  ]) {
    const name = getTableName(table)
    const columns = Object.values(getTableColumns(table))
    const existing = new Set(
      s.sqlite
        .prepare(`PRAGMA table_info("${name}")`)
        .all()
        .map(row => row.name),
    )
    if (!existing.size)
      s.sqlite.exec(
        `CREATE TABLE "${name}" (${columns.map(column => `"${column.name}" ${column.getSQLType()}${column.primary ? ' PRIMARY KEY' : ''}`).join(',')})`,
      )
    else
      for (const column of columns)
        if (!existing.has(column.name))
          s.sqlite.exec(
            `ALTER TABLE "${name}" ADD COLUMN "${column.name}" ${column.getSQLType()}`,
          )
  }
  s.sqlite.exec(
    'UPDATE feature SET isPublished=1,localIsPublished=1,isVisitable=1,visitableAsOf=NULL',
  )
  s.sqlite.exec(
    "INSERT INTO featureI18n(featureId,locale,title,titleGen,descriptionGen,displayAddressGen) VALUES('f','en','Shop',0,0,0)",
  )
  s.sqlite.exec(readFileSync('migrations/0171_feature_revisions.sql', 'utf8'))
  s.sqlite.exec(readFileSync('migrations/0172_image_revisions.sql', 'utf8'))
  const source = required(await readFeatureRevisionSource(s.db, 'f', sql`1`))
  const content = buildFeatureRevisionBaselineContent(source.snapshot, {
    revisions: {},
    order: [],
  })
  expect(
    await s.db.get(
      sql`SELECT ${featureContentProjectionMatches('f', content)} AS matches`,
    ),
  ).toEqual({ matches: 1 })
  return required(
    await initializeFeatureRevision(s.db, {
      featureId: 'f',
      actorId: 'baseline',
      guard: source.unchanged,
      content,
      published: true,
    }),
  )
}

describe('Feature revisions during placement acceptance', () => {
  it.each(['inherit', 'independent'] as const)(
    'captures relinking materialization while respecting %s names',
    async nameMode => {
      const s = await setup()
      const baseline = await enroll(s)
      s.sqlite.exec(
        "INSERT INTO hub VALUES('core','core'); INSERT INTO property(id,key,scope,hubId,type,component,dataType,audience,isTranslatable,dateResolution,timeMaxHour,cardinality,presentation) VALUES('phone','phoneNumber','hub','core','field','input','text','public',0,'day',24,'many','text')",
      )
      s.sqlite.exec(
        "INSERT INTO location(id,kind,state,ownerOrganisationId) VALUES('replacement','establishment','unresolved','p'); INSERT INTO locationRevisionContent(id,locationId,version,origin,contentHash,rawSource,facts) SELECT 'replacement-r','replacement',1,origin,contentHash,rawSource,json_set(facts,'$.i18n.en.name','Replacement') FROM locationRevision WHERE id='r'",
      )
      const result = await relinkFeatureLocation(s.db, {
        featureId: 'f',
        projectId: 'p',
        locationId: 'replacement',
        revisionId: 'replacement-r',
        expectedFeatureModifiedAt: 'original',
        expectedRevision: 'initial',
        actorId: 'relink-editor',
        nameMode,
      })
      expect(result.status).toBe('linked')
      const row = required(
        s.sqlite
          .prepare(
            'SELECT r.content,r.previousRevisionId FROM featureRevisionHead h JOIN featureRevision r ON r.id=h.publishedRevisionId',
          )
          .get(),
      )
      const content = JSON.parse(String(row.content))
      expect(row.previousRevisionId).toBe(baseline)
      expect(content.translations.en.title.value).toBe(
        nameMode === 'inherit' ? 'Replacement' : 'Shop',
      )
      expect(content.properties.phone.selection.value).toBe('[]')
      expect(
        await s.db.get(
          sql`SELECT ${featureContentProjectionMatches('f', content)} AS matches`,
        ),
      ).toEqual({ matches: 1 })
    },
  )
  it('records an initial link after detachment without losing either accepted history', async () => {
    const s = await setup()
    await enroll(s)
    await unlinkFeatureLocation(s.db, {
      featureId: 'f',
      projectId: 'p',
      expectedFeatureModifiedAt: 'original',
      expectedRevision: 'initial',
      actorId: 'unlink-editor',
    })
    const detached = required(
      s.sqlite.prepare('SELECT publishedRevisionId FROM featureRevisionHead').get(),
    ).publishedRevisionId
    const modifiedAt = String(
      required(s.sqlite.prepare("SELECT modifiedAt FROM feature WHERE id='f'").get())
        .modifiedAt,
    )
    const result = await linkInitialFeatureLocation(s.db, {
      featureId: 'f',
      projectId: 'p',
      locationId: 'shop',
      revisionId: 'r',
      expectedFeatureModifiedAt: modifiedAt,
      actorId: 'link-editor',
    })
    expect(result.status).toBe('linked')
    const row = required(
      s.sqlite
        .prepare(
          'SELECT r.content,r.previousRevisionId,c.actorId FROM featureRevisionHead h JOIN featureRevision r ON r.id=h.publishedRevisionId JOIN revisionChangeSet c ON c.id=r.changeSetId',
        )
        .get(),
    )
    const content = JSON.parse(String(row.content))
    expect(row.previousRevisionId).toBe(detached)
    expect(row.actorId).toBe('link-editor')
    expect(content.placement.location.locationId).toBe('shop')
    expect(
      await s.db.get(
        sql`SELECT ${featureContentProjectionMatches('f', content)} AS matches`,
      ),
    ).toEqual({ matches: 1 })
  })
  it.each([false, true])(
    'captures relinking atomically including a late receipt failure (%s)',
    async fail => {
      const s = await setup()
      const baseline = await enroll(s)
      s.sqlite.exec(
        "INSERT INTO location(id,kind,state,ownerOrganisationId) VALUES('replacement','establishment','unresolved','p'); INSERT INTO locationRevisionContent(id,locationId,version,origin,contentHash,rawSource,facts) SELECT 'replacement-r','replacement',1,origin,contentHash,rawSource,facts FROM locationRevisionContent WHERE id='r'",
      )
      if (fail)
        s.sqlite.exec(
          "CREATE TRIGGER fail_feature_receipt BEFORE INSERT ON featureRevisionPublication WHEN NEW.generation=1 BEGIN SELECT RAISE(ABORT,'feature receipt failed'); END",
        )
      const action = () =>
        relinkFeatureLocation(s.db, {
          featureId: 'f',
          projectId: 'p',
          locationId: 'replacement',
          revisionId: 'replacement-r',
          expectedFeatureModifiedAt: 'original',
          expectedRevision: 'initial',
          actorId: 'relink-editor',
        })
      if (fail) {
        await expect(action()).rejects.toThrow()
        expect(
          s.sqlite.prepare('SELECT publishedRevisionId FROM featureRevisionHead').get()
            ?.publishedRevisionId,
        ).toBe(baseline)
        expect(
          s.sqlite.prepare('SELECT locationId FROM featureLocation').get()?.locationId,
        ).toBe('shop')
      } else {
        expect((await action()).status).toBe('linked')
        const row = required(
          s.sqlite
            .prepare(
              'SELECT r.content,r.previousRevisionId,c.actorId FROM featureRevisionHead h JOIN featureRevision r ON r.id=h.publishedRevisionId JOIN revisionChangeSet c ON c.id=r.changeSetId',
            )
            .get(),
        )
        expect(row.previousRevisionId).toBe(baseline)
        expect(row.actorId).toBe('relink-editor')
        const content = JSON.parse(String(row.content))
        expect(content.placement.location.locationId).toBe('replacement')
        expect(
          await s.db.get(
            sql`SELECT ${featureContentProjectionMatches('f', content)} AS matches`,
          ),
        ).toEqual({ matches: 1 })
      }
    },
  )
  it('records detachment while retaining materialized fields and the earlier Location pins', async () => {
    const s = await setup()
    const baseline = await enroll(s)
    expect(
      (
        await unlinkFeatureLocation(s.db, {
          featureId: 'f',
          projectId: 'p',
          expectedFeatureModifiedAt: 'original',
          expectedRevision: 'initial',
          actorId: 'unlink-editor',
        })
      ).status,
    ).toBe('unlinked')
    const row = required(
      s.sqlite
        .prepare(
          'SELECT r.content,r.previousRevisionId,c.actorId FROM featureRevisionHead h JOIN featureRevision r ON r.id=h.publishedRevisionId JOIN revisionChangeSet c ON c.id=r.changeSetId',
        )
        .get(),
    )
    const content = JSON.parse(String(row.content))
    expect(row.previousRevisionId).toBe(baseline)
    expect(row.actorId).toBe('unlink-editor')
    expect(content.placement.location).toBeNull()
    expect(content.placement.geometry.coordinates).toEqual([114, 22])
    expect(content.translations.en.title.value).toBe('Shop')
    const old = required(
      s.sqlite.prepare('SELECT content FROM featureRevision WHERE id=?').get(baseline),
    )
    expect(JSON.parse(String(old.content)).placement.location.locationId).toBe('shop')
  })
  it.each([false, true])(
    'records approved placement and trigger-built memberships together (automatic: %s)',
    async automatic => {
      const s = await setup(automatic ? 'follow' : 'review')
      const baseline = await enroll(s)
      const proposal = required(
        await proposeLocationPlacement(s.db, {
          featureId: 'f',
          projectId: 'p',
          occupancyRevisionId: 'move',
        }),
      )
      expect(
        (await decideLocationPlacement(s.db, { ...decision(proposal), automatic }))
          .status,
      ).toBe('applied')
      const head = required(s.sqlite.prepare('SELECT * FROM featureRevisionHead').get())
      expect(head.generation).toBe(1)
      const row = required(
        s.sqlite
          .prepare(
            'SELECT r.*,c.origin,c.actorId FROM featureRevision r JOIN revisionChangeSet c ON c.id=r.changeSetId WHERE r.id=?',
          )
          .get(head.publishedRevisionId),
      )
      const content = JSON.parse(String(row.content))
      expect(row.previousRevisionId).toBe(baseline)
      expect(row.origin).toBe(automatic ? 'system' : 'user')
      expect(row.actorId).toBe('editor')
      expect(content.placement.geometry.coordinates).toEqual([114.1, 22.1])
      expect(content.placement.location.acceptanceProposalId).toBe(proposal.id)
      expect(content.placement.location.memberships).toMatchObject([
        { containerLocationId: 'new', role: 'building', occupancyRevisionId: 'move' },
      ])
      expect(content.placement.location.memberships[0].bindingVersion).toBe(
        content.placement.location.associationVersion,
      )
    },
  )
  it('rolls back the move, memberships and Location decision if the Feature receipt fails', async () => {
    const s = await setup()
    const baseline = await enroll(s)
    const proposal = required(
      await proposeLocationPlacement(s.db, {
        featureId: 'f',
        projectId: 'p',
        occupancyRevisionId: 'move',
      }),
    )
    s.sqlite.exec(
      "CREATE TRIGGER fail_feature_receipt BEFORE INSERT ON featureRevisionPublication WHEN NEW.generation=1 BEGIN SELECT RAISE(ABORT,'feature receipt failed'); END",
    )
    await expect(decideLocationPlacement(s.db, decision(proposal))).rejects.toThrow()
    expect(
      s.sqlite.prepare('SELECT publishedRevisionId FROM featureRevisionHead').get()
        ?.publishedRevisionId,
    ).toBe(baseline)
    expect(s.sqlite.prepare('SELECT version FROM featureLocation').get()?.version).toBe(
      'initial',
    )
    expect(
      s.sqlite
        .prepare('SELECT locationDecision FROM locationAdoptionProposal WHERE id=?')
        .get(proposal.id)?.locationDecision,
    ).toBeNull()
    expect(
      s.sqlite.prepare('SELECT count(*) n FROM featureLocationMembership').get()?.n,
    ).toBe(0)
  })
})
describe('occupancy and canonical address acceptance', () => {
  it('fixed does not propose or move; Project policy changes require review', async () => {
    const s = await setup('fixed')
    expect(
      await proposeLocationPlacement(s.db, {
        featureId: 'f',
        projectId: 'p',
        occupancyRevisionId: 'move',
      }),
    ).toBeNull()
    s.sqlite.exec(
      "UPDATE project SET locationPolicy=json_set(locationPolicy,'$.relocation','review'),locationPolicyRevision=locationPolicyRevision+1 WHERE id='p'",
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
    INSERT INTO locationRevisionContent(id,locationId,version,origin,contentHash,rawSource,facts) SELECT 'new-baseline','new',1,'local','container-hash','{}',json_remove(json_set(facts,'$.kind','building'),'$.details.brands') FROM locationRevisionContent WHERE id='r';
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
