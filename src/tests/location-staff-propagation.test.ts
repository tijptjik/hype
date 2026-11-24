import {
  proposeFeatureLocationAdoption,
  rejectLocationAdoptionGroup,
} from '#lib/db/services/locationAdoptionReview.js'
import { applyLocationAdoptionGroup } from '#lib/db/services/locationAdoptionApply.js'
// @vitest-environment node
// TESTS
import { afterEach, expect, it } from 'vitest'
import { getTableColumns, getTableName, sql } from 'drizzle-orm'
import { lifecycleFixture } from './fixtures/featureLifecycle'
import {
  prepareStaffLocationPropagation,
  replayStaffLocationCorrection,
} from '#lib/db/services/locationStaffPropagation.js'
import {
  executeRevisionBatch,
  prepareRevisionCheck,
} from '#lib/db/services/revisionBatch.js'
import { property } from '#lib/db/schema/property.js'
import { feature, featureI18n } from '#lib/db/schema/feature.js'
import {
  location,
  locationRevision,
  locationAdoptionProposal,
  featureLocation,
} from '#lib/db/schema/location.js'
import { readFeatureRevisionSource } from '#lib/db/services/featureRevisionSource.js'
import { buildFeatureRevisionBaselineContent } from '#lib/db/services/featureRevisionContent.js'
import {
  initializeCurrentFeatureRevision,
  readCurrentFeatureRevision,
} from '#lib/db/services/featureLifecycle.js'
import { LocationFactsSchema } from '#lib/locations/validation.js'
import { emptyFeatureAddress } from '#lib/addresses/featureAddress.js'

const stores: ReturnType<typeof lifecycleFixture>[] = []
afterEach(() => {
  for (const store of stores.splice(0)) store.sqlite.close()
})
const oldGeometry = { type: 'Point' as const, coordinates: [114, 22] }
const geometry = { type: 'Point' as const, coordinates: [114.01, 22.01] }
const facts = LocationFactsSchema.parse({
  names: { en: 'Service point' },
  phoneNumber: [],
  brands: [],
  location: { geometry, address: emptyFeatureAddress().source },
})

/** Arrange a live linked Feature with the same stale discovery-placement flag as the reported record.
 * @param mode Explicit manual placement or copied discovery evidence.
 * @returns Isolated lifecycle database and prepared propagation input.
 */
async function setup(mode: 'manual' | 'unlinked' = 'unlinked') {
  const f = lifecycleFixture(true)
  stores.push(f)
  f.sqlite.exec(`ALTER TABLE organisation ADD COLUMN settings TEXT NOT NULL DEFAULT '{}';
    ALTER TABLE project ADD COLUMN locationPolicy TEXT;
    ALTER TABLE project ADD COLUMN locationPolicyRevision INTEGER NOT NULL DEFAULT 0;
    UPDATE project SET locationPolicy='{"version":1,"coordinates":{"mode":"follow"},"address":"follow","unit":"follow","establishment":"follow","sameSources":true}';
    CREATE TABLE locationRevision(id TEXT PRIMARY KEY,locationId TEXT,facts TEXT,version INTEGER DEFAULT 1);
    CREATE VIEW locationRevisionContent AS SELECT * FROM locationRevision;
    CREATE TABLE organisationLocation(id TEXT PRIMARY KEY,organisationId TEXT,locationId TEXT,previousRevisionId TEXT,overrides TEXT,provenance TEXT,actorId TEXT,createdAt TEXT);
    CREATE VIEW organisationLocationHead AS SELECT o.*,o.id AS revision FROM organisationLocation o WHERE NOT EXISTS(SELECT 1 FROM organisationLocation n WHERE n.previousRevisionId=o.id);
    CREATE TABLE locationRefreshItem(runId TEXT,locationId TEXT,origin TEXT,status TEXT);
    INSERT INTO locationRefreshItem VALUES('shared:staff','place','local','pending');
    DELETE FROM featureLocationMembership;
    UPDATE featureLocation SET occupancyRevisionId=NULL,addressRevisionId=NULL,membershipRevisionIds='[]',
      factsOrganisationRevision=NULL,locationOrganisationRevision=NULL,
      acceptancePolicy='{"nameMode":"independent","locationMode":"independent"}';`)
  f.sqlite
    .prepare('INSERT INTO locationRevision(id,locationId,facts) VALUES(?,?,?)')
    .run('facts-v1', 'place', JSON.stringify(facts))
  f.sqlite
    .prepare('INSERT INTO locationRevision(id,locationId,facts) VALUES(?,?,?)')
    .run(
      'position-v1',
      'place',
      JSON.stringify({
        ...facts,
        location: { ...facts.location, geometry: oldGeometry },
      }),
    )
  f.sqlite.prepare('UPDATE feature SET addressMeta=? WHERE id=?').run(
    JSON.stringify({
      address: {
        ...emptyFeatureAddress(),
        coordinates: oldGeometry.coordinates,
        markerCoordinates: oldGeometry.coordinates,
        association: {
          originKind: 'building',
          kind: 'service_point',
          mode,
          lookup: 'no-match',
          names: {},
        },
      },
    }),
    'f',
  )
  await f.initialize()
  return {
    ...f,
    input: {
      locationId: 'place',
      sourceRevisionId: 'facts-v1',
      sharedRevisionId: 'staff',
      actorId: 'staff',
      facts,
      fields: ['location'],
    },
  }
}

it('updates the marker, accepted pin, address and history under explicit follow policy', async () => {
  const f = await setup()
  const before = await readCurrentFeatureRevision(f.db, {
    featureId: 'f',
    guard: sql`1`,
  })
  const prepared = await prepareStaffLocationPropagation(f.db, f.input)
  expect(
    await executeRevisionBatch(f.db, prepared.guard, prepared.statements),
  ).not.toBeNull()
  const after = await readCurrentFeatureRevision(f.db, {
    featureId: 'f',
    guard: sql`1`,
  })
  expect(after?.content.placement.geometry).toEqual(geometry)
  expect(after?.content.placement.location?.acceptedGeometry).toEqual(geometry)
  expect(after?.content.placement.addressMeta?.address).toMatchObject({
    coordinates: null,
  })
  expect(after?.content.placement.addressMeta?.address).not.toHaveProperty(
    'markerCoordinates',
  )
  expect(
    after?.content.placement.location?.acceptancePolicy?.locationMode,
  ).toBeUndefined()
  expect(
    after?.content.placement.location?.acceptancePolicy?.locationSharedRevision,
  ).toBe('staff')
  expect(after?.content.translations.en.title).toEqual(
    before?.content.translations.en.title,
  )
  expect(after?.state).toEqual(before?.state)
  expect(after?.revisionId).not.toBe(before?.revisionId)
  expect(
    f.sqlite
      .prepare(`SELECT c.reason FROM featureRevision r
      JOIN revisionChangeSet c ON c.id=r.changeSetId WHERE r.id=?`)
      .get(after?.revisionId ?? '')?.reason,
  ).toBe('Staff updated location')
  expect(
    f.sqlite.prepare('SELECT count(*) n FROM featureRevisionProposal').get()?.n,
  ).toBe(0)
  expect(f.sqlite.prepare('SELECT status FROM locationRefreshItem').get()?.status).toBe(
    'processed',
  )
})

it('retains an explicitly manual marker', async () => {
  const f = await setup('manual')
  const prepared = await prepareStaffLocationPropagation(f.db, f.input)
  expect(
    await executeRevisionBatch(f.db, prepared.guard, prepared.statements),
  ).not.toBeNull()
  const after = await readCurrentFeatureRevision(f.db, {
    featureId: 'f',
    guard: sql`1`,
  })
  expect(after?.content.placement.geometry).toEqual(oldGeometry)
  expect(
    after?.content.placement.location?.acceptancePolicy?.locationSharedRevision,
  ).toBeUndefined()
})

it('rolls back the marker, history and refresh receipt if a later statement fails', async () => {
  const f = await setup()
  const before = await readCurrentFeatureRevision(f.db, {
    featureId: 'f',
    guard: sql`1`,
  })
  const prepared = await prepareStaffLocationPropagation(f.db, f.input)
  await expect(
    executeRevisionBatch(f.db, prepared.guard, [
      ...prepared.statements,
      prepareRevisionCheck(f.db, sql`0`),
    ]),
  ).resolves.toBeNull()
  expect(
    await readCurrentFeatureRevision(f.db, { featureId: 'f', guard: sql`1` }),
  ).toEqual(before)
  expect(f.sqlite.prepare('SELECT status FROM locationRefreshItem').get()?.status).toBe(
    'pending',
  )
})

it('rejects a changed association set instead of missing a concurrent linked Feature', async () => {
  const f = await setup()
  const prepared = await prepareStaffLocationPropagation(f.db, f.input)
  const concurrent = await prepareStaffLocationPropagation(f.db, {
    ...f.input,
    sharedRevisionId: 'concurrent',
  })
  expect(
    await executeRevisionBatch(f.db, concurrent.guard, concurrent.statements),
  ).not.toBeNull()
  expect(
    await executeRevisionBatch(f.db, prepared.guard, prepared.statements),
  ).toBeNull()
  expect(f.sqlite.prepare('SELECT status FROM locationRefreshItem').get()?.status).toBe(
    'pending',
  )
})

it.each(['source-policy-reconcile', 'location-editor'])(
  'does not replay %s evidence over a newer upstream source',
  async kind => {
    const f = await setup()
    f.sqlite.exec(
      `CREATE TABLE locationSharedRevision(id TEXT,locationId TEXT,sourceRevisionId TEXT,previousRevisionId TEXT,corrections TEXT,actorId TEXT,createdAt TEXT,provenance TEXT);`,
    )
    f.sqlite
      .prepare('INSERT INTO locationSharedRevision VALUES(?,?,?,?,?,?,?,?)')
      .run(
        'staff',
        'place',
        'older-source',
        null,
        '{}',
        'staff',
        'now',
        JSON.stringify({ kind }),
      )
    const before = await readCurrentFeatureRevision(f.db, {
      featureId: 'f',
      guard: sql`1`,
    })
    expect(await replayStaffLocationCorrection(f.db, 'place', 'staff')).toBeNull()
    expect(
      await readCurrentFeatureRevision(f.db, { featureId: 'f', guard: sql`1` }),
    ).toEqual(before)
    expect(
      f.sqlite.prepare('SELECT status FROM locationRefreshItem').get()?.status,
    ).toBe('pending')
  },
)

it('keeps a changed marker pinned and the refresh pending under default community review', async () => {
  const f = await setup()
  f.sqlite.exec('UPDATE project SET locationPolicy=NULL')
  const before = await readCurrentFeatureRevision(f.db, {
    featureId: 'f',
    guard: sql`1`,
  })
  const prepared = await prepareStaffLocationPropagation(f.db, f.input)
  expect(prepared.statements).toHaveLength(0)
  const after = await readCurrentFeatureRevision(f.db, {
    featureId: 'f',
    guard: sql`1`,
  })
  expect(after).toEqual(before)
  expect(f.sqlite.prepare('SELECT status FROM locationRefreshItem').get()?.status).toBe(
    'pending',
  )
})

/** Add a real accepted consumer in another Project to exercise Organisation-wide fan-out.
 * @param f Isolated database. @param id Feature and Project suffix. @param organisationId Persisted owner.
 * @returns Completion after its accepted history is initialized.
 */
async function addConsumer(
  f: Awaited<ReturnType<typeof setup>>,
  id: string,
  organisationId = 'org',
): Promise<void> {
  f.sqlite
    .prepare(
      "INSERT OR IGNORE INTO organisation(id,settings,isPublished,isArchived) VALUES(?, '{}',1,0)",
    )
    .run(organisationId)
  f.sqlite
    .prepare(
      'INSERT INTO project(id,organisationId,locationPolicyRevision,isPublished,isArchived) VALUES(?,?,0,1,0)',
    )
    .run(id, organisationId)
  f.sqlite
    .prepare(
      'INSERT INTO layer(id,organisationId,projectId,isPublished,isArchived) VALUES(?,?,?,1,0)',
    )
    .run(id, organisationId, id)
  f.seed(feature, [
    { ...f.source.record, id, projectId: id, organisationId, layerId: id },
  ])
  f.seed(
    featureI18n,
    f.source.translations.map(row => ({ ...row, featureId: id })),
  )
  f.seed(
    featureLocation,
    f.source.location.map(row => ({
      ...row,
      featureId: id,
      occupancyRevisionId: null,
      addressRevisionId: null,
      membershipRevisionIds: [],
      acceptancePolicy: {},
      factsOrganisationRevision: null,
      locationOrganisationRevision: null,
    })),
  )
  const captured = await readFeatureRevisionSource(f.db, id, sql`1`)
  if (!captured) throw new Error('Missing consumer')
  await initializeCurrentFeatureRevision(f.db, {
    featureId: id,
    actorId: 'fixture',
    guard: captured.unchanged,
    content: buildFeatureRevisionBaselineContent(captured.snapshot, {
      revisions: {},
      order: [],
    }),
  })
}

it('accepts a community identity for all Projects in the Organisation and retires only its matching customization', async () => {
  const f = await setup()
  await addConsumer(f, 'sibling')
  await addConsumer(f, 'outsider', 'other-org')
  f.sqlite.prepare('INSERT INTO organisationLocation VALUES(?,?,?,?,?,?,?,?)').run(
    'org-before',
    'org',
    'place',
    null,
    JSON.stringify({
      names: { en: { mode: 'override', value: 'Private name' } },
      branchId: { mode: 'override', value: '0012' },
    }),
    null,
    'editor',
    'now',
  )
  const prepared = await prepareStaffLocationPropagation(f.db, {
    ...f.input,
    fields: ['names'],
    facts: { ...facts, names: { en: 'Community name' } },
  })
  expect(
    await executeRevisionBatch(f.db, prepared.guard, prepared.statements),
  ).not.toBeNull()
  for (const id of ['f', 'sibling']) {
    const accepted = await readCurrentFeatureRevision(f.db, {
      featureId: id,
      guard: sql`1`,
    })
    expect(
      accepted?.content.placement.location?.acceptancePolicy?.factsSharedFields,
    ).toContainEqual({ field: 'names', revision: 'staff' })
    expect(accepted?.content.placement.location?.acceptedOverrides).toEqual({
      branchId: { mode: 'override', value: '0012' },
    })
  }
  const sibling = await readCurrentFeatureRevision(f.db, {
    featureId: 'sibling',
    guard: sql`1`,
  })
  expect(sibling?.content.translations.en.title.value).toBe('Community name')
  const outsider = await readCurrentFeatureRevision(f.db, {
    featureId: 'outsider',
    guard: sql`1`,
  })
  expect(
    outsider?.content.placement.location?.acceptancePolicy?.factsSharedFields,
  ).toBeUndefined()
  expect(
    JSON.parse(
      String(
        f.sqlite
          .prepare(
            'SELECT overrides FROM organisationLocationHead WHERE organisationId=?',
          )
          .get('org')?.overrides,
      ),
    ),
  ).toEqual({ branchId: { mode: 'override', value: '0012' } })
  expect(f.sqlite.prepare('SELECT count(*) n FROM organisationLocation').get()?.n).toBe(
    2,
  )
})

/** Add source/review storage to the actual Feature lifecycle fixture.
 * @returns Review-ready consumers with immutable source rows.
 */
async function reviewFixture() {
  const f = await setup()
  await addConsumer(f, 'sibling')
  for (const table of [location, locationRevision, locationAdoptionProposal]) {
    const name = getTableName(table)
    const existing = new Set(
      f.sqlite
        .prepare(`PRAGMA table_info("${name}")`)
        .all()
        .map(row => row.name),
    )
    const columns = Object.values(getTableColumns(table))
    if (!existing.size)
      f.sqlite.exec(
        `CREATE TABLE "${name}" (${columns.map(column => `"${column.name}" ${column.dataType === 'number' ? 'INTEGER' : 'TEXT'}`).join(',')})`,
      )
    else
      for (const column of columns)
        if (!existing.has(column.name))
          f.sqlite.exec(
            `ALTER TABLE "${name}" ADD COLUMN "${column.name}" ${column.dataType === 'number' ? 'INTEGER' : 'TEXT'}`,
          )
  }
  f.sqlite.exec(`CREATE TABLE locationSharedRevision(id TEXT,locationId TEXT,sourceRevisionId TEXT,previousRevisionId TEXT,corrections TEXT,actorId TEXT,createdAt TEXT,provenance TEXT);
    CREATE VIEW locationSharedHead AS SELECT * FROM locationSharedRevision;
    UPDATE locationRevision SET origin='local',rawSource='{}';
    INSERT INTO location(id,kind,state,sourceAvailability) VALUES('place','establishment','unresolved','current');`)
  f.seed(locationRevision, [
    {
      id: 'candidate',
      locationId: 'place',
      version: 2,
      origin: 'local',
      ssId: null,
      contentHash: 'candidate',
      rawSource: {},
      facts: JSON.parse(
        JSON.stringify({
          ...facts,
          location: {
            ...facts.location,
            geometry: { type: 'Point', coordinates: [114.02, 22.02] },
          },
        }),
      ),
    },
  ])
  const review = await proposeFeatureLocationAdoption(f.db, {
    featureId: 'f',
    projectId: 'project',
    candidateRevisionId: 'candidate',
  })
  if (!review) throw new Error('Missing review')
  return {
    ...f,
    review,
    decision: {
      featureId: 'f',
      projectId: 'project',
      proposalId: review.proposal.id,
      fieldGroup: 'location' as const,
      expectedRevision: review.proposal.associationRevision,
      expectedFeatureModifiedAt: review.proposal.featureModifiedAt,
      actorId: 'reviewer',
      reason: 'Reviewed for our Organisation',
    },
  }
}

it('accepts a reviewed source change across the Organisation in one transaction', async () => {
  const f = await reviewFixture()
  const result = await applyLocationAdoptionGroup(f.db, {
    ...f.decision,
    mode: 'reviewed',
  })
  expect(result.status).toBe('applied')
  for (const id of ['f', 'sibling']) {
    const accepted = await readCurrentFeatureRevision(f.db, {
      featureId: id,
      guard: sql`1`,
    })
    expect(accepted?.content.placement.location?.locationRevisionId).toBe('candidate')
    expect(accepted?.content.placement.geometry).toEqual({
      type: 'Point',
      coordinates: [114.02, 22.02],
    })
  }
  expect(
    (await applyLocationAdoptionGroup(f.db, { ...f.decision, mode: 'reviewed' }))
      .status,
  ).toBe('conflict')
})

it('Keep current authors an Organisation customization and aligns its consumers', async () => {
  const f = await reviewFixture()
  const result = await rejectLocationAdoptionGroup(f.db, f.decision)
  expect(result?.action).toBe('rejected')
  const retained = JSON.parse(
    String(
      f.sqlite.prepare('SELECT overrides FROM organisationLocationHead').get()
        ?.overrides,
    ),
  )
  expect(retained.location.mode).toBe('override')
  for (const id of ['f', 'sibling']) {
    const accepted = await readCurrentFeatureRevision(f.db, {
      featureId: id,
      guard: sql`1`,
    })
    expect(accepted?.content.placement.location?.acceptedOverrides.location).toEqual(
      retained.location,
    )
    expect(accepted?.content.placement.geometry).toEqual(
      retained.location.value.geometry,
    )
  }
})

it('rolls back Organisation override retirement with every consumer when a later write fails', async () => {
  const f = await setup()
  await addConsumer(f, 'sibling')
  f.sqlite
    .prepare('INSERT INTO organisationLocation VALUES(?,?,?,?,?,?,?,?)')
    .run(
      'retained',
      'org',
      'place',
      null,
      JSON.stringify({ branchId: { mode: 'override', value: '0012' } }),
      null,
      'editor',
      'now',
    )
  const before = await readCurrentFeatureRevision(f.db, {
    featureId: 'f',
    guard: sql`1`,
  })
  const siblingBefore = await readCurrentFeatureRevision(f.db, {
    featureId: 'sibling',
    guard: sql`1`,
  })
  const prepared = await prepareStaffLocationPropagation(f.db, {
    ...f.input,
    fields: ['branchId'],
    facts: { ...facts, branchId: '0020' },
  })
  expect(
    await executeRevisionBatch(f.db, prepared.guard, [
      ...prepared.statements,
      prepareRevisionCheck(f.db, sql`0`),
    ]),
  ).toBeNull()
  expect(
    f.sqlite.prepare('SELECT revision FROM organisationLocationHead').get()?.revision,
  ).toBe('retained')
  expect(
    await readCurrentFeatureRevision(f.db, { featureId: 'f', guard: sql`1` }),
  ).toEqual(before)
  expect(
    await readCurrentFeatureRevision(f.db, { featureId: 'sibling', guard: sql`1` }),
  ).toEqual(siblingBefore)
})

it('accepting identity releases the changed name but preserves an unrelated branch ID customization', async () => {
  const f = await reviewFixture()
  f.sqlite.exec("INSERT INTO hub VALUES('core','core')")
  f.seed(property, [
    {
      ...f.source.fieldDefinitions[0],
      id: 'phone',
      key: 'phoneNumber',
      component: 'PhoneField',
      hubId: 'core',
      scope: 'hub',
    },
  ])
  f.sqlite
    .prepare('UPDATE locationRevision SET facts=? WHERE id=?')
    .run(JSON.stringify({ ...facts, names: { en: 'New community name' } }), 'candidate')
  f.sqlite.prepare('INSERT INTO organisationLocation VALUES(?,?,?,?,?,?,?,?)').run(
    'custom',
    'org',
    'place',
    null,
    JSON.stringify({
      names: { en: { mode: 'override', value: 'Custom name' } },
      branchId: { mode: 'override', value: '0012' },
    }),
    null,
    'editor',
    'now',
  )
  const review = await proposeFeatureLocationAdoption(f.db, {
    featureId: 'f',
    projectId: 'project',
    candidateRevisionId: 'candidate',
    organisationRevision: 'custom',
    reevaluatePending: true,
  })
  if (!review) throw new Error('Missing identity review')
  const result = await applyLocationAdoptionGroup(f.db, {
    ...f.decision,
    proposalId: review.proposal.id,
    fieldGroup: 'facts',
    mode: 'reviewed',
  })
  expect(result.status).toBe('applied')
  const retained = JSON.parse(
    String(
      f.sqlite.prepare('SELECT overrides FROM organisationLocationHead').get()
        ?.overrides,
    ),
  )
  expect(retained).toEqual({ branchId: { mode: 'override', value: '0012' } })
  const sibling = await readCurrentFeatureRevision(f.db, {
    featureId: 'sibling',
    guard: sql`1`,
  })
  expect(sibling?.content.translations.en.title.value).toBe('New community name')
})

it('rejects a review made stale by a new Organisation customization', async () => {
  const f = await reviewFixture()
  f.sqlite
    .prepare('INSERT INTO organisationLocation VALUES(?,?,?,?,?,?,?,?)')
    .run(
      'newer',
      'org',
      'place',
      null,
      JSON.stringify({ branchId: { mode: 'override', value: '0012' } }),
      null,
      'editor',
      'later',
    )
  expect(
    (await applyLocationAdoptionGroup(f.db, { ...f.decision, mode: 'reviewed' }))
      .status,
  ).toBe('conflict')
  expect(
    f.sqlite.prepare('SELECT revision FROM organisationLocationHead').get()?.revision,
  ).toBe('newer')
})

it('Keep current suppresses newly supplied fields and locales that were previously absent', async () => {
  const f = await reviewFixture()
  f.sqlite.exec("INSERT INTO hub VALUES('core','core')")
  f.seed(property, [
    {
      ...f.source.fieldDefinitions[0],
      id: 'phone',
      key: 'phoneNumber',
      component: 'PhoneField',
      hubId: 'core',
      scope: 'hub',
    },
  ])
  f.sqlite.prepare('UPDATE locationRevision SET facts=? WHERE id=?').run(
    JSON.stringify({
      ...facts,
      names: { ...facts.names, 'zh-Hant': '新名稱' },
      branch: { en: 'Central' },
    }),
    'candidate',
  )
  const review = await proposeFeatureLocationAdoption(f.db, {
    featureId: 'f',
    projectId: 'project',
    candidateRevisionId: 'candidate',
    reevaluatePending: true,
  })
  if (!review) throw new Error('Missing identity review')
  expect(
    (
      await rejectLocationAdoptionGroup(f.db, {
        ...f.decision,
        proposalId: review.proposal.id,
        fieldGroup: 'facts',
      })
    )?.action,
  ).toBe('rejected')
  const retained = JSON.parse(
    String(
      f.sqlite.prepare('SELECT overrides FROM organisationLocationHead').get()
        ?.overrides,
    ),
  )
  expect(retained.branch).toEqual({ mode: 'clear' })
  expect(retained.names['zh-Hant']).toEqual({ mode: 'clear' })
})

it('retains the author override until a later revision accepts that field only', async () => {
  const f = await setup()
  f.sqlite.exec(
    "INSERT INTO hub VALUES('core','core'); CREATE TABLE locationSharedRevision(id TEXT PRIMARY KEY,locationId TEXT,previousRevisionId TEXT,sourceRevisionId TEXT,corrections TEXT,actorId TEXT,createdAt TEXT,provenance TEXT); INSERT INTO locationSharedRevision VALUES('staff','place',NULL,'facts-v1','{}','staff','now','{}');",
  )
  f.seed(property, [
    {
      ...f.source.fieldDefinitions[0],
      id: 'phone',
      key: 'phoneNumber',
      component: 'PhoneField',
      hubId: 'core',
      scope: 'hub',
    },
  ])
  const overrides = {
    phoneNumber: { mode: 'override' as const, value: ['+85221234567'] },
    brands: { mode: 'clear' as const },
  }
  f.sqlite
    .prepare('INSERT INTO organisationLocation VALUES(?,?,?,?,?,?,?,?)')
    .run(
      'author-choice',
      'org',
      'place',
      null,
      JSON.stringify(overrides),
      '{}',
      'staff',
      'now',
    )
  const authored = await prepareStaffLocationPropagation(f.db, {
    ...f.input,
    facts: { ...facts, phoneNumber: ['+85221234567'] },
    fields: ['phoneNumber'],
    authorOrganisation: { id: 'org', revision: 'author-choice', overrides },
  })
  expect(
    await executeRevisionBatch(f.db, authored.guard, authored.statements),
  ).not.toBeNull()
  const first = await readCurrentFeatureRevision(f.db, {
    featureId: 'f',
    guard: sql`1`,
  })
  expect(first?.content.placement.location?.acceptedOverrides).toEqual(overrides)
  const later = await prepareStaffLocationPropagation(f.db, {
    ...f.input,
    sharedRevisionId: 'later',
    facts: { ...facts, phoneNumber: ['+85229999999'] },
    fields: ['phoneNumber'],
  })
  expect(await executeRevisionBatch(f.db, later.guard, later.statements)).not.toBeNull()
  const next = await readCurrentFeatureRevision(f.db, { featureId: 'f', guard: sql`1` })
  expect(next?.content.placement.location?.acceptedOverrides).toEqual({
    brands: { mode: 'clear' },
  })
})

it('commits an Organisation correction and its Feature adoption after advancing the head', async () => {
  const f = await setup()
  f.sqlite.exec(
    "CREATE TABLE locationCorrectionProposal(id TEXT); CREATE TABLE location(id TEXT PRIMARY KEY,state TEXT,ownerOrganisationId TEXT); INSERT INTO location VALUES('place','linked',NULL)",
  )
  const { applyLocationCorrection, readLocationCorrectionContext } = await import(
    '#lib/db/services/locationCorrectionReview.js'
  )
  const row = f.sqlite
    .prepare('SELECT projectId,organisationId FROM feature WHERE id=?')
    .get('f') as { projectId: string; organisationId: string }
  const scope = { ...row, featureId: 'f', guard: sql`1` }
  const before = await readLocationCorrectionContext(f.db, scope)
  expect(before).not.toBeNull()
  const saved = await applyLocationCorrection(f.db, {
    ...scope,
    actorId: 'staff',
    reason: 'Correct the accepted name',
    expectedAssociationVersion: before!.association.version,
    expectedOrganisationRevision: before!.expectedOrganisationRevision,
    patch: { names: { en: { mode: 'override', value: 'Corrected name' } } },
    canEditOrganisation: true,
  })
  expect(saved).not.toBeNull()
  const after = await readCurrentFeatureRevision(f.db, {
    featureId: 'f',
    guard: sql`1`,
  })
  expect(after?.content.placement.location?.acceptedOverrides).toMatchObject({
    names: { en: { mode: 'override', value: 'Corrected name' } },
  })
  expect(
    (await readLocationCorrectionContext(f.db, scope))?.expectedOrganisationRevision,
  ).toBe(saved)
})

it('replicates mobility through the same accepted field pins and Feature history as contacts', async () => {
  const f = await setup()
  const accessibility = {
    wheelchair: 'yes',
    stepFreeEntrance: 'yes',
    lift: 'not_needed',
    toilet: 'unknown',
  } as const
  const prepared = await prepareStaffLocationPropagation(f.db, {
    ...f.input,
    facts: { ...facts, accessibility },
    fields: ['accessibility'],
  })
  expect(
    await executeRevisionBatch(f.db, prepared.guard, prepared.statements),
  ).not.toBeNull()
  const after = await readCurrentFeatureRevision(f.db, {
    featureId: 'f',
    guard: sql`1`,
  })
  expect(
    after?.content.placement.location?.acceptancePolicy?.factsSharedFields,
  ).toContainEqual({ field: 'accessibility', revision: 'staff' })
})
